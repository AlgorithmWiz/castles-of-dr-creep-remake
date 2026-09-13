import test from "node:test";
import assert from "node:assert/strict";
import { Game, validateSave } from "../src/game.js";
import { ROOMS, FLOORS } from "../src/levels.js";

function ticks(g, seconds, input = {}) {
  for (let i = 0; i < Math.ceil(seconds / 0.02); i++) g.update(0.02, input);
}
function place(g, x, floor) {
  Object.assign(g.player, {
    x,
    floor,
    y: FLOORS[floor],
    climbing: null,
    invincible: 0,
  });
}
function walkTo(g, x) {
  for (let i = 0; i < 2200 && Math.abs(g.player.x - x) > 0.07; i++)
    g.update(0.02, { left: g.player.x > x, right: g.player.x < x });
  assert.ok(
    Math.abs(g.player.x - x) < 0.1,
    `Could not walk to ${x}; reached ${g.player.x}`,
  );
}
function climb(g, up = true) {
  const start = g.player.floor;
  for (let i = 0; i < 180; i++) {
    g.update(0.02, up ? { up: true } : { down: true });
    if (!g.player.climbing && g.player.floor !== start) return;
  }
  assert.fail("Ladder did not reach next floor");
}

test("walking, climbing, and no jump are deterministic", () => {
  const g = new Game();
  g.start();
  ticks(g, 1, { right: true });
  assert.ok(Math.abs(g.player.x - -5.35) < 0.01);
  place(g, 7, 0);
  climb(g);
  assert.equal(g.player.floor, 1);
  climb(g, false);
  assert.equal(g.player.floor, 0);
});
test("brass key unlocks the first door and persists across rooms", () => {
  const g = new Game();
  g.start();
  place(g, 9, 2);
  g.interact();
  assert.equal(g.roomIndex, 0);
  place(g, -6.5, 0);
  g.interact();
  assert.ok(g.keys.has("bronze"));
  place(g, 9, 2);
  g.interact();
  assert.equal(g.roomIndex, 1);
  assert.ok(g.keys.has("bronze"));
  assert.deepEqual([...g.visited], [0, 1]);
});
test("force fields block both directions and their switch lasts eight seconds", () => {
  const g = new Game();
  g.start();
  place(g, 1, 0);
  ticks(g, 1, { right: true });
  assert.ok(g.player.x <= 1.56);
  place(g, -2.5, 0);
  g.interact();
  assert.equal(g.switches.field, 8);
  ticks(g, 7.8);
  assert.equal(g.fieldActive(g.room.fields[0]), false);
  ticks(g, 0.3);
  assert.equal(g.fieldActive(g.room.fields[0]), true);
  place(g, 3, 0);
  ticks(g, 1, { left: true });
  assert.ok(g.player.x >= 2.44);
});
test("lightning kills, its switch disables it, and respawn keeps keys", () => {
  const events = [];
  const g = new Game((e) => events.push(e));
  g.start();
  g.keys.add("bronze");
  g.loadRoom(2);
  place(g, 1, 1);
  g.update(0.02);
  assert.equal(g.returns, 1);
  ticks(g, 1.3);
  assert.equal(g.player.floor, 0);
  assert.ok(g.keys.has("bronze"));
  place(g, -3.4, 1);
  g.interact();
  place(g, 1, 1);
  g.update(0.02);
  assert.equal(g.deathTimer, 0);
  assert.equal(g.returns, 1);
});
test("trapdoors defeat a pursuing mummy", () => {
  const g = new Game();
  g.start();
  g.loadRoom(1);
  place(g, -5, 1);
  g.interact();
  ticks(g, 4);
  assert.equal(g.enemies[0].alive, false);
  assert.equal(g.returns, 0);
});
test("matter transmitter crosses the upper lightning machine", () => {
  const g = new Game();
  g.start();
  g.loadRoom(2);
  place(g, 6, 2);
  g.interact();
  assert.equal(g.player.x, -7);
  assert.equal(g.player.floor, 2);
  assert.equal(g.returns, 0);
});
test("sliding poles descend to ground and cannot be climbed", () => {
  const g = new Game();
  g.start();
  g.loadRoom(3);
  place(g, 0, 2);
  ticks(g, 2, { down: true });
  assert.equal(g.player.floor, 0);
  assert.equal(g.player.y, 0);
  ticks(g, 2, { up: true });
  assert.equal(g.player.floor, 0);
});
test("conveyors carry an idle player", () => {
  const g = new Game();
  g.start();
  g.loadRoom(3);
  place(g, 0, 1);
  ticks(g, 1);
  assert.ok(g.player.x > 1.3 && g.player.x < 1.5);
});
test("pause freezes the simulation and prevents interactions", () => {
  const g = new Game();
  g.start();
  place(g, -6.5, 0);
  g.paused = true;
  ticks(g, 1, { right: true });
  g.interact();
  assert.equal(g.elapsed, 0);
  assert.equal(g.player.x, -6.5);
  assert.equal(g.keys.size, 0);
});
test("saved state is validated before loading", () => {
  const g = new Game();
  g.start();
  g.keys.add("bronze");
  g.loadRoom(2);
  assert.ok(validateSave(g.snapshot()));
  assert.equal(validateSave({ ...g.snapshot(), roomIndex: 80 }), null);
  assert.equal(validateSave({ ...g.snapshot(), keys: ["evil"] }), null);
  assert.equal(validateSave({ ...g.snapshot(), elapsed: -1 }), null);
  const restored = new Game();
  restored.start(validateSave(g.snapshot()));
  assert.equal(restored.roomIndex, 2);
  assert.ok(restored.keys.has("bronze"));
});
test("final gate requires all three keys", () => {
  const g = new Game();
  g.start();
  g.loadRoom(5);
  place(g, 0, 2);
  g.interact();
  assert.equal(g.won, false);
  for (const key of ["bronze", "silver", "gold"]) g.keys.add(key);
  g.interact();
  assert.equal(g.won, true);
});
test("every room links back and has valid machinery connections", () => {
  for (const [i, r] of ROOMS.entries()) {
    for (const d of r.doors) if (d.target !== "win") assert.ok(ROOMS[d.target]);
    for (const f of [
      ...r.fields,
      ...r.traps,
      ...r.lightning.filter((l) => l.switch),
    ])
      assert.ok(r.switches.some((s) => s.id === f.switch));
    if (i > 0) assert.ok(r.doors.some((d) => d.target === i - 1));
  }
});
test("complete castle can be solved through movement and interaction without a death", () => {
  const g = new Game();
  g.start();
  walkTo(g, -6.5);
  g.interact();
  walkTo(g, -2.5);
  g.interact();
  walkTo(g, 7);
  climb(g);
  walkTo(g, -5);
  climb(g);
  walkTo(g, 9);
  g.interact();
  assert.equal(g.roomIndex, 1);
  walkTo(g, -3);
  climb(g);
  walkTo(g, -5);
  g.interact();
  walkTo(g, -7);
  climb(g);
  walkTo(g, 9);
  g.interact();
  assert.equal(g.roomIndex, 2);
  walkTo(g, -6);
  climb(g);
  walkTo(g, -3.4);
  g.interact();
  walkTo(g, 6);
  g.interact();
  walkTo(g, 8);
  climb(g);
  walkTo(g, 6);
  g.interact();
  walkTo(g, -9.2);
  g.interact();
  assert.equal(g.roomIndex, 3);
  walkTo(g, 0);
  ticks(g, 1.6, { down: true });
  assert.equal(g.player.floor, 0);
  walkTo(g, -3);
  g.interact();
  walkTo(g, 9);
  g.interact();
  assert.equal(g.roomIndex, 4);
  walkTo(g, -6);
  climb(g);
  walkTo(g, -4);
  g.interact();
  walkTo(g, 6);
  climb(g);
  walkTo(g, 5.5);
  g.interact();
  walkTo(g, 8.1);
  g.interact();
  walkTo(g, 9.2);
  g.interact();
  assert.equal(g.roomIndex, 5);
  walkTo(g, -6);
  climb(g);
  walkTo(g, -3.5);
  g.interact();
  walkTo(g, 7);
  climb(g);
  walkTo(g, 0);
  g.interact();
  assert.equal(g.won, true);
  assert.equal(g.returns, 0);
  assert.equal(g.keys.size, 3);
  assert.equal(g.visited.size, 6);
});
