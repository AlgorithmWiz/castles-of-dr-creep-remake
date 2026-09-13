import test from "node:test";
import assert from "node:assert/strict";
import { CASTLES, castleById } from "../src/catalog.js";
import { ClassicGame } from "../src/classic-game.js";
import { Game } from "../src/game.js";
import { climbingOpenings, crossedLanding } from "../src/walkway.js";
import { playAction } from "../scripts/play-route.mjs";

test("every imported ladder and pole landing can be reached and dismounted at 20 and 60 fps", () => {
  let traversals = 0;
  for (const c of CASTLES)
    for (const r of c.rooms) {
      const g = new ClassicGame(c);
      g.loadRoom(r.number);
      for (const [pole, links] of [
        [false, r.ladders],
        [true, r.poles],
      ])
        for (const l of links)
          for (const from of l.stops)
            for (const to of l.stops) {
              if (from === to || (pole && to > from)) continue;
              for (const dt of [1 / 20, 1 / 60]) {
                const start = r.platforms.find(
                  (p) =>
                    Math.abs(p.y - from) < 0.055 &&
                    l.x >= p.min - 0.28 &&
                    l.x <= p.max + 0.28,
                );
                const target = r.platforms.find(
                  (p) =>
                    Math.abs(p.y - to) < 0.055 &&
                    l.x >= p.min - 0.28 &&
                    l.x <= p.max + 0.28,
                );
                const e = {
                  x: Math.max(start.min + 0.2, Math.min(start.max - 0.2, l.x)),
                  y: from,
                  climbing: null,
                };
                const dir = Math.sign(to - from),
                  side = target.max > l.x ? 1 : -1;
                // Start holding the selected shaft, then traverse with real movement.
                // This isolates geometry from enemies and machinery covered separately.
                e.x = l.x;
                e.climbing = { ...l, pole };
                for (
                  let frame = 0;
                  frame < 1000 && (e.climbing || Math.abs(e.y - to) > 0.01);
                  frame++
                )
                  g.move(
                    e,
                    dt,
                    Math.abs(e.y - to) <= 4.2 * dt + 0.002 ? side : 0,
                    dir,
                    3.65,
                  );
                assert.equal(
                  e.climbing,
                  null,
                  `${r.id}/${l.id}: ${from} → ${to}`,
                );
                assert.equal(e.y, to);
                assert.ok(
                  g.supports(e.x, e.y).length,
                  `${r.id}/${l.id}: landing has no footing`,
                );
                // The shaft can be re-gripped from the actual dismount position.
                const back = pole ? -1 : -dir;
                if (to > l.yBottom || back > 0) {
                  g.move(e, dt, 0, back, 3.65);
                  assert.ok(e.climbing, `${r.id}/${l.id}: cannot re-grip`);
                }
                traversals++;
              }
            }
    }
  assert.ok(traversals > 2000);
});

test("endpoint release works without sideways input, including fractional frame times", () => {
  assert.equal(crossedLanding([6.24], 6.20, 6.2395, 1, 0), undefined);
  assert.equal(crossedLanding([6.24], 6.2395, 6.24, 1, 0), 6.24);
  assert.equal(crossedLanding([0], 0.0005, 0, -1, 0), 0);
  let endpoints = 0;
  for (const c of CASTLES) {
    const g = new ClassicGame(c);
    for (const r of c.rooms) {
      g.loadRoom(r.number);
      for (const [pole, links] of [
        [false, r.ladders],
        [true, r.poles],
      ])
        for (const l of links) {
          if (l.stops.length < 2) continue;
          for (const dir of pole ? [-1] : [-1, 1]) {
            const target = dir > 0 ? l.yTop : l.yBottom;
            // Reproduce the last sub-millimetre of a climb, then vary frame time.
            const e = {
              x: l.x,
              y: target - dir * 0.0005,
              climbing: { ...l, pole },
            };
            g.move(e, 0.007, 0, dir, 3.65);
            assert.equal(e.climbing, null, `${r.id}/${l.id}: stuck at endpoint`);
            assert.ok(g.supports(e.x, e.y).length);
            e.x = l.x;
            e.y = dir > 0 ? l.yBottom : l.yTop;
            e.climbing = { ...l, pole };
            for (let frame = 0; e.climbing && frame < 2000; frame++)
              g.move(
                e,
                [0.013, 0.017, 0.016, 0.05, 0.007][frame % 5],
                0,
                dir,
                3.65,
              );
            assert.equal(
              e.climbing,
              null,
              `${r.id}/${l.id}: held direction never releases`,
            );
            assert.equal(e.y, target);
            endpoints++;
          }
        }
    }
  }
  assert.ok(endpoints > 500);
});

test("an open trap cannot drop a character holding a ladder; stepping onto it remains dangerous", () => {
  const g = new ClassicGame(castleById("tutorial"));
  g.start();
  g.loadRoom(9);
  const trap = g.room.traps[0];
  g.switches[trap.switch] = true;
  Object.assign(g.player, {
    x: trap.x,
    y: trap.y,
    invincible: 0,
    climbing: { pole: false },
  });
  g.hazards(g.player, true);
  assert.equal(g.deathTimer, 0);
  g.player.climbing = null;
  g.hazards(g.player, true);
  assert.ok(g.deathTimer > 0);
  const e = { x: trap.x, y: trap.y, alive: true, climbing: { pole: false } };
  g.hazards(e);
  assert.ok(e.alive);
  e.climbing = null;
  g.hazards(e);
  assert.equal(e.death.cause, "fall");
});

test("bonus-estate trap checks also respect holding a ladder", () => {
  const g = new Game();
  g.start();
  g.loadRoom(1);
  const t = g.room.traps[0];
  g.switches[t.switch] = true;
  Object.assign(g.player, {
    x: t.x,
    y: t.floor * 3.6,
    floor: t.floor,
    invincible: 0,
    climbing: { from: 0, to: 2, pole: false },
  });
  g.update(1 / 60);
  assert.equal(g.deathTimer, 0);
});

test("climbing past a gun control neither steals climbing input nor fires on E", () => {
  const c = structuredClone(castleById("tutorial"));
  const r = c.rooms[7],
    l = r.ladders[0],
    control = r.switches.find((s) => s.kind === "gun");
  control.x = l.x;
  control.y = l.yBottom + 0.1;
  const g = new ClassicGame(c);
  g.start();
  g.loadRoom(7);
  Object.assign(g.player, {
    x: l.x,
    y: l.yBottom + 0.1,
    climbing: { ...l, pole: false },
    invincible: 0,
  });
  const before = g.player.y;
  g.update(1 / 60, { up: true });
  assert.ok(g.player.y > before);
  assert.equal(g.nearby(), null);
  g.interact();
  assert.equal(g.projectiles.length, 0);
});

test("castle recall retains discoveries and machinery while recovering a one-way route", () => {
  const g = new ClassicGame(castleById("freedonia"));
  g.start();
  g.loadRoom(1);
  g.keys.add("white");
  g.openDoor(3);
  g.activate(g.room.switches.find((s) => s.kind === "power"));
  const state = g.state;
  g.recall();
  assert.equal(g.roomIndex, g.castle.startRoom);
  assert.equal(g.returns, 1);
  assert.ok(g.keys.has("white"));
  assert.ok(g.opened.has("1:3"));
  assert.equal(g.states[1], state);
  assert.equal(state.power["lightning-0"], false);
});

test("every control sharing coordinates operates every linked record with one E press", () => {
  let groups = 0;
  for (const c of CASTLES)
    for (const r of c.rooms) {
      const seen = new Set();
      for (const s of r.switches) {
        const key = [s.kind, s.x, s.y].join();
        if (seen.has(key)) continue;
        seen.add(key);
        const group = r.switches.filter(
          (q) => q.kind === s.kind && q.x === s.x && q.y === s.y,
        );
        if (group.length < 2) continue;
        const g = new ClassicGame(c);
        g.start();
        g.loadRoom(r.number);
        Object.assign(g.player, { x: s.x, y: s.y });
        const before = structuredClone(g.state);
        g.interact();
        for (const q of group) {
          if (q.kind === "field")
            assert.equal(g.switches[q.id], 8, `${r.id}/${q.id}`);
          if (q.kind === "bell") assert.ok(g.doorOpen(r.doors[q.door]));
          if (q.kind === "conveyor")
            assert.notEqual(g.switches[q.id], before.switches[q.id]);
          if (q.kind === "power")
            for (const id of q.machines)
              assert.equal(g.state.power[id], !before.power[id]);
        }
        groups++;
      }
    }
  assert.ok(groups >= 15);
});

test("shaft cutouts stay within each floor segment and leave the bottom landing solid", () => {
  for (const c of CASTLES)
    for (const r of c.rooms)
      for (const p of r.platforms) {
        const holes = climbingOpenings(r, p.min, p.max, p.y);
        for (const [i, h] of holes.entries()) {
          assert.ok(h.min >= p.min && h.max <= p.max && h.max > h.min);
          if (i) assert.ok(holes[i - 1].max < h.min);
        }
      }
  const room = { ladders: [{ x: 0, yBottom: 0, yTop: 3.6 }], poles: [] };
  assert.deepEqual(climbingOpenings(room, -3, 3, 0), []);
  assert.deepEqual(climbingOpenings(room, -3, 3, 3.6), [
    { min: -0.59, max: 0.59 },
  ]);
});

test("Sylvania's remote trap puzzle can be solved by attracting Frankenstein across the gap", () => {
  const g = new ClassicGame(castleById("sylvania"));
  g.start();
  g.loadRoom(9, 3);
  const route = [
    { kind: "peek", x: 7.29, y: 7.68 },
    { kind: "return" },
    { kind: "climb", x: -6.75, y: 2.88 },
    { kind: "wait", seconds: 10 },
    { kind: "climb", x: -6.75, y: 7.68 },
    { kind: "use", x: -8.64 },
    { kind: "climb", x: -6.75, y: 9.6 },
    { kind: "use", x: -8.91 },
  ];
  for (const a of route) assert.ok(playAction(g, a), JSON.stringify(a));
  assert.equal(g.roomIndex, 12);
  assert.equal(g.returns, 0);
  assert.equal(g.states[9].switches["trap-0"], false);
});

test("trapdoors retain the original three-column footprint and its centre", () => {
  for (const c of CASTLES)
    for (const r of c.rooms)
      for (const t of r.traps) {
        assert.ok(Math.abs(t.width - 1.62) < 1e-8);
        assert.ok(Math.abs(t.x - (t.source[1] + 6 - 96) * 0.135) < 1e-8);
      }
});
