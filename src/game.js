import { ROOMS, FLOORS, KEY_NAMES } from "./levels.js";
import { beginEnemyDeath, advanceEnemyDeath } from "./enemy-death.js";

export class Game {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.started = false;
    this.paused = false;
    this.won = false;
    this.keys = new Set();
    this.visited = new Set();
    this.elapsed = 0;
    this.returns = 0;
    this.loadRoom(0);
  }
  get room() {
    return ROOMS[this.roomIndex];
  }
  emit(type, detail = {}) {
    this.onEvent({ type, ...detail });
  }
  loadRoom(index, arrival) {
    this.roomIndex = index;
    const room = this.room;
    const entry = arrival || room.entry;
    this.spawn = { ...entry };
    this.player = {
      x: entry.x,
      y: FLOORS[entry.floor],
      floor: entry.floor,
      facing: 1,
      climbing: null,
      walking: false,
      invincible: 1.5,
    };
    this.switches = Object.fromEntries(
      room.switches.map((s) => [s.id, s.kind === "field" ? 0 : false]),
    );
    this.enemies = room.enemies.map((e) => ({
      ...e,
      y: FLOORS[e.floor],
      alive: true,
      facing: -1,
      death: null,
    }));
    this.deathTimer = 0;
    if (this.started) this.visited.add(index);
    this.emit("room", { index });
  }
  start(saved) {
    this.started = true;
    this.paused = false;
    this.won = false;
    this.keys = new Set(saved?.keys || []);
    this.visited = new Set(saved?.visited || []);
    this.elapsed = saved?.elapsed || 0;
    this.returns = saved?.returns || 0;
    this.loadRoom(saved?.roomIndex || 0);
    this.emit("start");
  }
  snapshot() {
    return {
      version: 1,
      keys: [...this.keys],
      visited: [...this.visited],
      elapsed: this.elapsed,
      returns: this.returns,
      roomIndex: this.roomIndex,
    };
  }
  fieldActive(field) {
    return this.switches[field.switch] <= 0;
  }
  lightningActive(machine) {
    return !machine.switch || !this.switches[machine.switch];
  }
  nearby() {
    const p = this.player;
    if (p.climbing || this.deathTimer || !this.started || this.won) return null;
    const candidates = [
      ...this.room.keys
        .filter((k) => !this.keys.has(k.id))
        .map((k) => ({
          ...k,
          type: "key",
          label: `Take the ${KEY_NAMES[k.id].toLowerCase()} key`,
        })),
      ...this.room.switches.map((s) => ({ ...s, type: "switch" })),
      ...this.room.teleporters.map((t) => ({
        ...t,
        type: "teleporter",
        label: "Use matter transmitter",
      })),
      ...this.room.doors.map((d) => ({ ...d, type: "door" })),
    ];
    return (
      candidates
        .filter(
          (c) =>
            Math.abs(c.x - p.x) < 1 && Math.abs(FLOORS[c.floor] - p.y) < 0.25,
        )
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0] || null
    );
  }
  interact() {
    if (!this.started || this.paused || this.won) return;
    const item = this.nearby();
    if (!item) {
      this.emit("notice", {
        text: "Stand beside a key, switch, transmitter, or door to interact.",
      });
      return;
    }
    if (item.type === "key") {
      this.keys.add(item.id);
      this.emit("key", {
        id: item.id,
        text: `${KEY_NAMES[item.id]} key recovered. One step closer to freedom.`,
      });
    }
    if (item.type === "switch") {
      this.switches[item.id] =
        item.kind === "field" ? 8 : !this.switches[item.id];
      this.emit("switch", {
        kind: item.kind,
        text:
          item.kind === "field"
            ? "Force field lowered. You have eight seconds."
            : item.kind === "power"
              ? this.switches[item.id]
                ? "Lightning machine disabled."
                : "Lightning machine powered on."
              : this.switches[item.id]
                ? "Trapdoor opened. Mind your step."
                : "Trapdoor closed.",
      });
    }
    if (item.type === "teleporter") {
      this.player.x = item.toX;
      this.player.floor = item.toFloor;
      this.player.y = FLOORS[item.toFloor];
      this.player.invincible = 1;
      this.emit("teleport", {
        text: "All of your atoms appear to have arrived.",
      });
    }
    if (item.type === "door") {
      if (item.key === "all" && this.keys.size < 3) {
        this.emit("notice", {
          text: "The final gate needs the brass, silver, and gold keys.",
        });
        return;
      }
      if (item.key && item.key !== "all" && !this.keys.has(item.key)) {
        this.emit("notice", {
          text: `This door requires the ${KEY_NAMES[item.key].toLowerCase()} key.`,
        });
        return;
      }
      if (item.target === "win") {
        this.won = true;
        this.emit("win");
      } else this.loadRoom(item.target, item.arrival);
    }
  }
  die(reason = "The castle claims another guest.") {
    if (this.deathTimer || this.player.invincible > 0) return;
    this.returns++;
    this.deathTimer = 1.2;
    this.player.walking = false;
    this.emit("death", { text: reason });
  }
  retry() {
    this.loadRoom(this.roomIndex, this.spawn);
    this.emit("notice", { text: "Back at the entrance. Your keys are safe." });
  }
  update(dt, input = {}) {
    if (!this.started || this.paused || this.won) return;
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    for (const enemy of this.enemies) advanceEnemyDeath(enemy, dt);
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) {
        this.deathTimer = 0;
        this.retry();
      }
      return;
    }
    const p = this.player;
    p.invincible = Math.max(0, p.invincible - dt);
    for (const sw of this.room.switches)
      if (sw.kind === "field")
        this.switches[sw.id] = Math.max(0, this.switches[sw.id] - dt);
    const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const vertical = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    p.walking = false;
    if (!p.climbing && vertical) {
      const ladder = this.room.ladders.find(
        (l) =>
          Math.abs(l.x - p.x) < 0.62 &&
          (vertical > 0 ? l.from === p.floor : l.to === p.floor),
      );
      const pole =
        vertical < 0 &&
        this.room.poles.find(
          (l) =>
            Math.abs(l.x - p.x) < 0.62 && p.floor > l.to && p.floor <= l.from,
        );
      if (ladder || pole) {
        const l = ladder || pole;
        p.climbing = {
          ...l,
          pole: !ladder,
          direction: vertical,
          target: vertical > 0 ? l.to : l.to === p.floor ? l.from : l.to,
        };
        p.x = l.x;
      }
    }
    if (p.climbing) {
      const l = p.climbing;
      const dir = l.pole ? -1 : vertical;
      p.y = Math.max(
        FLOORS[l.from < l.to ? l.from : l.to],
        Math.min(
          FLOORS[Math.max(l.from, l.to)],
          p.y + dir * (l.pole ? 5 : 2.7) * dt,
        ),
      );
      p.walking = dir !== 0;
      const floor = FLOORS.findIndex((y) => Math.abs(y - p.y) < 0.07);
      const atEndpoint =
        (dir > 0 && p.y >= FLOORS[l.to] - 0.001 && !l.pole) ||
        (dir < 0 && p.y <= FLOORS[l.pole ? l.to : l.from] + 0.001);
      if (floor >= 0 && (atEndpoint || horizontal)) {
        p.y = FLOORS[floor];
        p.floor = floor;
        p.climbing = null;
      }
    } else {
      let speed = horizontal * 3.65;
      for (const belt of this.room.conveyors)
        if (p.floor === belt.floor && p.x > belt.min && p.x < belt.max)
          speed += belt.speed;
      let nx = Math.max(-10.1, Math.min(10.1, p.x + speed * dt));
      for (const field of this.room.fields)
        if (field.floor === p.floor && this.fieldActive(field)) {
          if (p.x < field.x && nx > field.x - 0.44)
            nx = Math.min(nx, field.x - 0.44);
          else if (p.x >= field.x && nx < field.x + 0.44)
            nx = Math.max(nx, field.x + 0.44);
        }
      p.walking = Math.abs(nx - p.x) > 0.001;
      p.x = nx;
      if (horizontal) p.facing = horizontal;
    }
    for (const machine of this.room.lightning)
      if (
        this.lightningActive(machine) &&
        Math.abs(p.y - FLOORS[machine.floor]) < 1.8 &&
        Math.abs(p.x - machine.x) < 0.47
      )
        this.die("A shocking turn of events. Try the yellow switch.");
    for (const trap of this.room.traps)
      if (
        this.switches[trap.switch] &&
        Math.abs(p.y - FLOORS[trap.floor]) < 0.15 &&
        Math.abs(p.x - trap.x) < trap.width / 2 - 0.15
      )
        this.die("The floor had other plans. Watch the trapdoors.");
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.abs(p.y - FLOORS[e.floor]) < 1) {
        e.facing = Math.sign(p.x - e.x) || e.facing;
        e.x = Math.max(e.min, Math.min(e.max, e.x + e.facing * e.speed * dt));
      }
      if (
        this.room.traps.some(
          (t) =>
            t.floor === e.floor &&
            this.switches[t.switch] &&
            Math.abs(e.x - t.x) < t.width / 2,
        )
      ) {
        beginEnemyDeath(e, "fall", FLOORS[Math.max(0, e.floor - 1)]);
        this.emit("monster", {
          text: "The doctor’s own machinery makes an excellent accomplice.",
        });
      }
      if (
        e.alive &&
        this.room.lightning.some(
          (l) =>
            l.floor === e.floor &&
            this.lightningActive(l) &&
            Math.abs(l.x - e.x) < 0.47,
        )
      ) {
        beginEnemyDeath(e, "lightning", e.y);
        this.emit("monster", {
          text: "The doctor’s experiment has short-circuited.",
        });
      }
      if (
        e.alive &&
        Math.abs(p.y - FLOORS[e.floor]) < 0.75 &&
        Math.abs(p.x - e.x) < 0.65
      )
        this.die("You made a new acquaintance. A little too closely.");
    }
  }
}

export function validateSave(raw) {
  if (
    !raw ||
    raw.version !== 1 ||
    !Number.isInteger(raw.roomIndex) ||
    raw.roomIndex < 0 ||
    raw.roomIndex >= ROOMS.length
  )
    return null;
  if (
    !Array.isArray(raw.keys) ||
    !Array.isArray(raw.visited) ||
    !Number.isFinite(raw.elapsed) ||
    raw.elapsed < 0 ||
    !Number.isInteger(raw.returns) ||
    raw.returns < 0
  )
    return null;
  if (
    raw.keys.some((k) => !Object.hasOwn(KEY_NAMES, k)) ||
    raw.visited.some((r) => !Number.isInteger(r) || r < 0 || r >= ROOMS.length)
  )
    return null;
  return {
    ...raw,
    keys: [...new Set(raw.keys)],
    visited: [...new Set(raw.visited)],
  };
}
