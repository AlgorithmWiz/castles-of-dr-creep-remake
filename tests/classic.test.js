import test from "node:test";
import assert from "node:assert/strict";
import { CASTLES, castleById, TOTAL_ORIGINAL_ROOMS } from "../src/catalog.js";
import originals from "../src/data/original-castles.js";
import { ClassicGame, validateClassicSave } from "../src/classic-game.js";
import {
  beginEnemyDeath,
  advanceEnemyDeath,
  deathPose,
  DEATH_DURATION,
} from "../src/enemy-death.js";
import { analyze } from "../scripts/analyze-routes.mjs";
import { castleMap } from "../src/castle-map.js";

const ticks = (g, n, input = {}) => {
  for (let i = 0; i < n; i++) g.update(1 / 60, input);
};
function tutorial(i = 0) {
  const g = new ClassicGame(castleById("tutorial"));
  g.start();
  g.loadRoom(i);
  return g;
}
function at(g, item) {
  Object.assign(g.player, {
    x: item.x,
    y: item.y,
    climbing: null,
    invincible: 99,
  });
}
function walk(g, x) {
  for (let i = 0; i < 1500 && Math.abs(g.player.x - x) > 0.08; i++)
    g.update(1 / 120, { left: x < g.player.x, right: x > g.player.x });
  assert.ok(
    Math.abs(g.player.x - x) < 0.1,
    `Could not reach ${x} in ${g.room.name}; stopped ${g.player.x}, y ${g.player.y}`,
  );
}

test("all 13 original castles and 13 tutorial rooms are present with their source hashes", () => {
  assert.deepEqual(
    CASTLES.map((c) => [c.id, c.rooms.length]),
    [
      ["tutorial", 13],
      ["sylvania", 16],
      ["callanwolde", 24],
      ["tannenbaum", 10],
      ["alternation", 16],
      ["freedonia", 5],
      ["carpathia", 18],
      ["parthenia", 16],
      ["teasdale", 16],
      ["rittenhouse", 19],
      ["romania", 16],
      ["doublecross", 15],
      ["baskerville", 18],
      ["lovecraft", 15],
    ],
  );
  assert.equal(TOTAL_ORIGINAL_ROOMS, 217);
  for (const c of CASTLES) assert.match(c.sourceHash, /^[a-f0-9]{64}$/);
});
test("every platform is converted directly from the original record without filling gaps", () => {
  for (const [ci, c] of CASTLES.entries())
    for (const [ri, r] of c.rooms.entries()) {
      const source = originals[ci].rooms[ri].objects.platforms;
      assert.equal(r.platforms.length, source.length);
      source.forEach(([len, x, y], i) => {
        const p = r.platforms[i];
        assert.ok(Math.abs(p.min - (x - 96) * 0.135) < 1e-5);
        assert.ok(Math.abs(p.max - p.min - len * 0.54) < 1e-5);
        assert.ok(Math.abs(p.y - (192 - y) * 0.06) < 1e-5);
      });
    }
});
test("all imported doors, locks, remote circuits, receivers and entrance coordinates are valid", () => {
  for (const c of CASTLES)
    for (const r of c.rooms) {
      const g = new ClassicGame(c);
      g.loadRoom(r.number);
      for (const d of r.doors) {
        assert.ok(
          g.supports(d.x, d.y).length,
          `${r.id} door ${d.index} has no walkway`,
        );
        if (d.target !== "win")
          assert.ok(c.rooms[d.target]?.doors[d.targetDoor]);
      }
      for (const s of r.switches) {
        if (s.door !== undefined) assert.ok(r.doors[s.door]);
        if (s.key) assert.ok(c.keyIds.includes(s.key));
        for (const id of s.machines || [])
          assert.ok(r.lightning.some((l) => l.id === id));
      }
      for (const t of r.teleporters) {
        assert.ok(t.targets.length);
        for (const p of t.targets) assert.ok(g.supports(p.x, p.y).length);
      }
      for (const gun of r.guns)
        assert.ok(gun.yTop >= gun.yBottom, `${r.id} invalid gun travel`);
      assert.doesNotMatch(castleMap(c, g), /NaN|undefined/);
    }
});
test("all castles have structural routes to every room, every key and the exit", () => {
  for (const c of CASTLES) {
    const result = analyze(c);
    assert.equal(result.rooms, c.rooms.length, c.name);
    assert.equal(result.exit, true, c.name);
    assert.equal(result.keys.length, c.keyIds.length, c.name);
  }
});
test("Sylvania starts at its original top entrance, its pole stops at intermediate walkways, and gaps block walking", () => {
  const g = new ClassicGame(castleById("sylvania"));
  g.start();
  assert.equal(g.player.y, 9.6);
  walk(g, -5.67);
  ticks(g, 60, { down: true });
  assert.ok(g.player.y < 6 && g.player.y > 5);
  for (let i = 0; i < 20 && g.player.climbing; i++)
    g.update(1 / 120, { down: true, left: true });
  assert.equal(g.player.y, 5.28);
  assert.equal(g.player.climbing, null);
  walk(g, -7.02);
  g.interact();
  assert.ok(g.doorOpen(g.room.doors[3]));
  walk(g, -8.91);
  g.interact();
  assert.equal(g.roomIndex, 14);
  const arrival = g.room.doors[3];
  assert.ok(g.doorOpen(arrival));
  g.interact();
  assert.equal(g.roomIndex, 0);
  at(g, { x: -4, y: 5.28 });
  ticks(g, 120, { right: true });
  assert.ok(g.player.x < -3.7);
});
test("a bell opens both sides of the original linked passage and that state survives return", () => {
  const g = tutorial();
  at(g, g.room.switches[0]);
  g.interact();
  assert.ok(g.doorOpen(g.room.doors[0]));
  at(g, g.room.doors[0]);
  g.interact();
  assert.equal(g.roomIndex, 1);
  assert.ok(g.doorOpen(g.room.doors[0]));
  g.interact();
  assert.equal(g.roomIndex, 0);
  assert.ok(g.doorOpen(g.room.doors[0]));
});
test("coloured locks need their matching key and do not consume it", () => {
  const g = tutorial(6),
    lock = g.room.switches[0];
  at(g, lock);
  g.interact();
  assert.equal(g.doorOpen(g.room.doors[1]), false);
  at(g, g.room.keys[0]);
  g.interact();
  at(g, lock);
  g.interact();
  assert.ok(g.doorOpen(g.room.doors[1]));
  assert.ok(g.keys.has("yellow"));
});
test("a remote lightning lever toggles every referenced machine and electrocution starts a visible death", () => {
  const g = tutorial(3),
    s = g.room.switches.find((s) => s.kind === "power");
  assert.ok(g.room.lightning.every((l) => g.lightningActive(l)));
  at(g, s);
  g.interact();
  assert.ok(g.room.lightning.every((l) => !g.lightningActive(l)));
  g.interact();
  const l = g.room.lightning[0],
    e = { id: "probe", x: l.x, y: l.y, alive: true, facing: 1 };
  g.hazards(e);
  assert.equal(e.alive, false);
  assert.equal(e.death.cause, "lightning");
  assert.equal(deathPose(e.death).finished, false);
});
test("force fields block both directions, lower for eight seconds and freeze while paused", () => {
  const g = tutorial(4),
    f = g.room.fields[0];
  at(g, { x: f.x - 1, y: f.y });
  ticks(g, 60, { right: true });
  assert.ok(g.player.x < f.x);
  at(
    g,
    g.room.switches.find((s) => s.kind === "field"),
  );
  g.interact();
  assert.equal(g.fieldActive(f), false);
  ticks(g, 120);
  const left = g.switches[f.switch];
  g.paused = true;
  ticks(g, 600);
  assert.equal(g.switches[f.switch], left);
  g.paused = false;
  ticks(g, 361);
  assert.ok(g.fieldActive(f));
});
test("teleport destination selection wraps and sends the player to the selected original receiver", () => {
  const g = tutorial(8),
    t = g.room.teleporters[0];
  at(g, t);
  g.update(0.016, { up: true });
  assert.equal(g.state.teleports[t.id], 1);
  g.interact();
  assert.equal(g.player.x, t.targets[1].x);
  assert.equal(g.player.y, t.targets[1].y);
  at(g, t);
  ticks(g, 30);
  g.update(0.016, { down: true });
  assert.equal(g.state.teleports[t.id], 0);
});
test("pressure controls toggle once per crossing, and an open trap kills a monster without removing its animation", () => {
  const g = tutorial(9),
    s = g.room.switches.find((s) => s.kind === "trap"),
    trap = g.room.traps[0];
  const original = g.switches[s.id];
  at(g, s);
  ticks(g, 1);
  assert.equal(g.switches[s.id], !original);
  ticks(g, 10);
  assert.equal(g.switches[s.id], !original);
  at(g, { x: s.x + 1, y: s.y });
  ticks(g, 1);
  at(g, s);
  ticks(g, 1);
  assert.equal(g.switches[s.id], original);
  g.switches[s.id] = true;
  const e = { id: "probe", x: trap.x, y: trap.y, alive: true, facing: 1 };
  g.hazards(e);
  assert.equal(e.death.cause, "fall");
  assert.ok(e.death.impactY < e.y);
  assert.equal(e.death.time, 0);
});
test("conveyor controls cycle through both stopped states and both directions", () => {
  const g = tutorial(10),
    s = g.room.switches.find((s) => s.kind === "conveyor"),
    b = g.room.conveyors[0],
    seen = [];
  for (let i = 0; i < 4; i++) {
    seen.push(g.beltSpeed(b));
    g.activate(s);
  }
  assert.ok(seen.includes(-4.4) && seen.includes(4.4));
  assert.equal(seen.filter((v) => v === 0).length, 2);
});
test("mummies awaken at the ankh on its own walkway, not at the tomb", () => {
  const g = tutorial(5),
    e = g.enemies[0];
  assert.equal(e.active, false);
  at(g, e);
  ticks(g, 1);
  assert.equal(e.active, false);
  at(g, e.trigger);
  ticks(g, 1);
  assert.equal(e.active, true);
  assert.ok(e.wake > 0);
});
test("Frankie can pursue down a reachable ladder", () => {
  const g = tutorial(11),
    e = g.enemies[0];
  e.active = true;
  e.wake = 0;
  at(g, { x: 5, y: 0 });
  const start = e.y;
  for (let i = 0; i < 1200 && e.y >= start - 0.5; i++) g.update(1 / 60);
  assert.ok(e.y < start - 0.5);
});
test("ray-gun control aims within its rail, fires, and the swept projectile defeats a target", () => {
  const g = tutorial(7),
    s = g.room.switches.find((s) => s.kind === "gun"),
    gun = g.guns[0];
  at(g, s);
  ticks(g, 180, { down: true });
  assert.ok(gun.y >= gun.yBottom && gun.y <= gun.yTop);
  ticks(g, 100);
  gun.cooldown = 0;
  const e = {
    id: "probe",
    kind: "mummy",
    alive: true,
    active: true,
    x: gun.x + 2,
    y: gun.y - 0.6,
    speed: 0,
    trigger: { x: 100, y: 0 },
    facing: 1,
  };
  g.enemies.push(e);
  g.interact();
  assert.equal(g.projectiles.length, 1);
  ticks(g, 30);
  assert.equal(e.alive, false);
  assert.equal(e.death.cause, "ray");
  assert.equal(e.death.direction, 1);
});
test("death animation has distinct impact, shock, knockback and fade phases", () => {
  for (const cause of ["fall", "lightning", "ray"]) {
    const e = { alive: true, x: 2, y: 5, facing: 1 };
    assert.equal(beginEnemyDeath(e, cause, cause === "fall" ? 0 : 5), true);
    assert.equal(beginEnemyDeath(e, cause), false);
    assert.equal(deathPose(e.death).opacity, 1);
    advanceEnemyDeath(e, 0.3);
    const pose = deathPose(e.death);
    assert.equal(pose.finished, false);
    if (cause === "lightning") assert.ok(pose.shock);
    if (cause === "ray") assert.ok(pose.x > 2);
    advanceEnemyDeath(e, 0.9);
    if (cause === "fall") assert.equal(deathPose(e.death).y, 0);
    advanceEnemyDeath(e, 1);
    assert.equal(e.death.time, DEATH_DURATION);
    assert.equal(deathPose(e.death).opacity, 0);
    assert.ok(deathPose(e.death).finished);
  }
});
test("dead enemies no longer collide and their animation freezes on pause", () => {
  const g = tutorial(5),
    e = g.enemies[0];
  e.active = true;
  g.killEnemy(e, "lightning");
  at(g, e);
  g.player.invincible = 0;
  ticks(g, 20);
  assert.equal(g.returns, 0);
  assert.ok(e.death.time > 0);
  g.paused = true;
  const t = e.death.time;
  ticks(g, 180);
  assert.equal(e.death.time, t);
});
test("save roundtrip preserves castle, keys, visited rooms, both door sides and machinery", () => {
  const g = tutorial(3);
  g.activate(g.room.switches.find((s) => s.kind === "power"));
  g.openDoor(1);
  g.keys.add("yellow");
  g.loadRoom(5);
  g.killEnemy(g.enemies[0], "lightning");
  g.loadRoom(8);
  g.state.teleports["teleporter-0"] = 2;
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  assert.ok(validateClassicSave(snap));
  const restored = new ClassicGame(g.castle);
  restored.start(snap);
  assert.deepEqual(restored.snapshot(), snap);
  restored.loadRoom(5);
  assert.equal(restored.enemies[0].alive, false);
  restored.loadRoom(3);
  assert.ok(restored.room.lightning.every((l) => !restored.lightningActive(l)));
});
test("invalid saves cannot address other castles, nonexistent rooms, switches or receivers", () => {
  const base = tutorial(8).snapshot();
  for (const edit of [
    (s) => (s.castleId = "bad"),
    (s) => (s.roomIndex = 999),
    (s) => (s.keys = ["gold"]),
    (s) => (s.opened = ["1:999"]),
    (s) => (s.states[8].switches.bad = true),
    (s) => (s.states[8].teleports["teleporter-0"] = 999),
    (s) => (s.spawn.x = NaN),
  ]) {
    const s = structuredClone(base);
    edit(s);
    assert.equal(validateClassicSave(s), null);
  }
});
test("the entire 13-room original tutorial can be completed by walking and interaction without dying", () => {
  const g = tutorial();
  for (let i = 0; i < 13; i++) {
    assert.equal(g.roomIndex, i);
    const r = g.room;
    if (i === 3) {
      walk(g, r.switches.find((s) => s.kind === "power").x);
      g.interact();
    }
    if (i === 4) {
      walk(g, r.switches.find((s) => s.kind === "field").x);
      g.interact();
    }
    if (i === 6) {
      walk(g, r.keys[0].x);
      g.interact();
    }
    if (i === 9) {
      const l = r.ladders[0],
        s = r.switches.find((s) => s.kind === "trap");
      walk(g, l.x);
      ticks(g, 60, { up: true });
      walk(g, s.x);
      assert.equal(g.switches[s.id], false);
      walk(g, l.x);
      ticks(g, 60, { down: true });
    }
    const control = r.switches.find(
      (s) => s.kind === "bell" || s.kind === "lock",
    );
    walk(g, control.x);
    g.interact();
    const door = r.doors.find((d) => d.target === i + 1 || d.target === "win");
    walk(g, door.x);
    g.interact();
  }
  assert.ok(g.won);
  assert.equal(g.visited.size, 13);
  assert.equal(g.returns, 0);
});
