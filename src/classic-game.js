import { KEY_INFO, castleById } from "./catalog.js";
import { beginEnemyDeath, advanceEnemyDeath } from "./enemy-death.js";
import { crossedLanding } from "./walkway.js";

const EPS = 0.055;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export class ClassicGame {
  constructor(castle, onEvent = () => {}) {
    this.castle = castle;
    this.rooms = castle.rooms;
    this.onEvent = onEvent;
    this.started = false;
    this.paused = false;
    this.won = false;
    this.elapsed = 0;
    this.returns = 0;
    this.keys = new Set();
    this.visited = new Set();
    this.opened = new Set();
    this.states = {};
    this.loadRoom(castle.startRoom, castle.startDoor);
  }
  get room() {
    return this.rooms[this.roomIndex];
  }
  emit(type, detail = {}) {
    this.onEvent({ type, ...detail });
  }
  freshState(room) {
    return {
      switches: Object.fromEntries(
        room.switches.map((s) => [
          s.id,
          s.kind === "field" ? 0 : (s.initial ?? false),
        ]),
      ),
      power: Object.fromEntries(room.lightning.map((l) => [l.id, l.initialOn])),
      enemies: room.enemies.map((e) => ({
        ...e,
        alive: true,
        active: !e.dormant,
        facing: e.wakeDirection ?? 1,
        walking: false,
        climbing: null,
        death: null,
      })),
      teleports: Object.fromEntries(
        room.teleporters.map((t) => [t.id, t.initial]),
      ),
      guns: room.guns.map((g) => ({
        ...g,
        y: clamp(g.headY, g.yBottom, g.yTop),
        cooldown: 1.4,
        charge: 0,
        controlled: 0,
      })),
    };
  }
  loadRoom(index, doorOrArrival = 0) {
    if (!this.rooms[index]) throw Error("Unknown castle room");
    this.roomIndex = index;
    const room = this.room,
      door =
        typeof doorOrArrival === "number" ? room.doors[doorOrArrival] : null,
      entry = door || doorOrArrival || room.entry;
    this.spawn = { x: entry.x ?? room.entry.x, y: entry.y ?? room.entry.y };
    this.player = {
      ...this.spawn,
      facing: 1,
      walking: false,
      climbing: null,
      invincible: 1.2,
    };
    this.state = this.states[index] ||= this.freshState(room);
    this.switches = this.state.switches;
    this.enemies = this.state.enemies;
    this.guns = this.state.guns;
    this.projectiles = [];
    this.pressure = new Set();
    this.deathTimer = 0;
    this.selectionCooldown = 0;
    this.trapCooldown = 0;
    if (this.started) this.visited.add(index);
    this.emit("room", { index });
  }
  start(saved) {
    this.started = true;
    this.paused = false;
    this.won = false;
    this.elapsed = saved?.elapsed || 0;
    this.returns = saved?.returns || 0;
    this.keys = new Set(saved?.keys || []);
    this.visited = new Set(saved?.visited || []);
    this.opened = new Set(saved?.opened || []);
    this.states = {};
    for (const [i, record] of Object.entries(saved?.states || {})) {
      const state = this.freshState(this.rooms[i]);
      for (const s of this.rooms[i].switches)
        if (Object.hasOwn(record.switches || {}, s.id))
          state.switches[s.id] = record.switches[s.id];
      for (const l of this.rooms[i].lightning)
        if (typeof record.power?.[l.id] === "boolean")
          state.power[l.id] = record.power[l.id];
      for (const e of state.enemies)
        if (record.dead?.includes(e.id)) {
          e.alive = false;
          e.active = true;
        }
      for (const t of this.rooms[i].teleporters)
        state.teleports[t.id] = clamp(
          record.teleports?.[t.id] ?? t.initial,
          0,
          t.targets.length - 1,
        );
      this.states[i] = state;
    }
    const roomIndex = saved?.roomIndex ?? this.castle.startRoom;
    this.loadRoom(roomIndex, saved?.spawn ?? this.castle.startDoor);
    this.emit("start");
  }
  snapshot() {
    const states = {};
    for (const [i, s] of Object.entries(this.states))
      states[i] = {
        switches: { ...s.switches },
        power: { ...s.power },
        dead: s.enemies.filter((e) => !e.alive).map((e) => e.id),
        teleports: { ...s.teleports },
      };
    return {
      version: 2,
      castleId: this.castle.id,
      roomIndex: this.roomIndex,
      spawn: { ...this.spawn },
      keys: [...this.keys],
      visited: [...this.visited],
      opened: [...this.opened],
      states,
      elapsed: this.elapsed,
      returns: this.returns,
    };
  }
  doorOpen(door, roomIndex = this.roomIndex) {
    return door.initialOpen || this.opened.has(`${roomIndex}:${door.index}`);
  }
  openDoor(index) {
    const d = this.room.doors[index];
    if (!d) return;
    this.opened.add(`${this.roomIndex}:${index}`);
    if (d.target !== "win") this.opened.add(`${d.target}:${d.targetDoor}`);
    this.emit("switch", {
      kind: "bell",
      text:
        d.target === "win"
          ? "The castle exit is open."
          : `Door ${index + 1} is open. It leads to room ${d.target + 1}.`,
    });
  }
  fieldActive(f) {
    return this.switches[f.switch] <= 0;
  }
  lightningActive(l) {
    return !!this.state.power[l.id];
  }
  beltSpeed(b) {
    const mode = this.switches[b.switch];
    return mode & 1 ? (mode & 2 ? 1 : -1) * 4.4 : 0;
  }
  supports(x, y) {
    return this.room.platforms.filter(
      (p) => Math.abs(p.y - y) < EPS && x >= p.min - 0.02 && x <= p.max + 0.02,
    );
  }
  floorBelow(x, y) {
    return (
      this.room.platforms
        .filter((p) => p.y < y - 0.15 && x >= p.min && x <= p.max)
        .sort((a, b) => b.y - a.y)[0]?.y ?? -1.2
    );
  }
  nearby() {
    const p = this.player;
    if (!this.started || this.won || this.deathTimer || p.climbing) return null;
    const candidates = [
      ...this.room.keys
        .filter((k) => !this.keys.has(k.id))
        .map((k) => ({ ...k, type: "key", label: `Take the ${k.id} key` })),
      ...this.room.switches.map((s) => ({ ...s, type: "switch" })),
      ...this.room.teleporters.map((t) => ({
        ...t,
        type: "teleporter",
        label: `Transmit to ${t.targets[this.state.teleports[t.id]]?.name || "receiver"} · ↑ ↓ select`,
      })),
      ...this.room.doors.map((d) => ({
        ...d,
        type: "door",
        label: this.doorOpen(d) ? d.label : `Door ${d.index + 1} · closed`,
      })),
    ];
    return (
      candidates
        .filter(
          (c) =>
            Math.abs(c.x - p.x) < (c.type === "door" ? 0.92 : 0.7) &&
            Math.abs(c.y - p.y) < 0.22,
        )
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0] || null
    );
  }
  interact() {
    if (this.paused || !this.started || this.won) return;
    const item = this.nearby();
    if (!item) return;
    if (item.type === "key") {
      this.keys.add(item.id);
      this.emit("key", {
        id: item.id,
        text: `${KEY_INFO[item.id].name} key recovered.`,
      });
    }
    if (item.type === "door") {
      if (!this.doorOpen(item)) {
        const lock = this.room.switches.find(
          (s) => s.kind === "lock" && s.door === item.index,
        );
        this.emit("notice", {
          text: lock
            ? `Find and use the ${lock.key} lock that controls this door.`
            : this.room.switches.some(
                  (s) => s.kind === "bell" && s.door === item.index,
                )
              ? "Find this door’s bell. It may be on another walkway."
              : "This door must be opened from the other side.",
        });
        return;
      }
      if (item.target === "win") {
        this.won = true;
        this.emit("win");
      } else this.loadRoom(item.target, item.targetDoor);
    }
    if (item.type === "teleporter") {
      const target = item.targets[this.state.teleports[item.id]];
      if (!target) return;
      Object.assign(this.player, {
        x: target.x,
        y: target.y,
        climbing: null,
        invincible: 0.6,
      });
      this.emit("teleport", {
        text: `Transmitted to the ${target.name.toLowerCase()} receiver.`,
      });
    }
    if (item.type === "switch") {
      // Several source records can share one physical control (including the
      // six-machine circuit that exceeds a single record's four references).
      const group = this.room.switches.filter(
        (s) => s.kind === item.kind && s.x === item.x && s.y === item.y,
      );
      if (item.kind === "power") {
        this.activate({
          ...item,
          machines: [...new Set(group.flatMap((s) => s.machines))],
        });
        for (const s of group)
          if (s.id !== item.id) this.switches[s.id] = !this.switches[s.id];
      } else for (const s of group) this.activate(s);
    }
  }
  activate(s, automatic = false) {
    if (s.kind === "bell") {
      this.openDoor(s.door);
      return;
    }
    if (s.kind === "lock") {
      if (this.keys.has(s.key)) this.openDoor(s.door);
      else this.emit("notice", { text: `This lock needs the ${s.key} key.` });
      return;
    }
    if (s.kind === "gun") {
      const gun = this.guns.find((g) => g.id === s.gun);
      this.fire(gun);
      gun.controlled = 1;
      return;
    }
    if (s.kind === "power") {
      this.switches[s.id] = !this.switches[s.id];
      for (const id of s.machines) this.state.power[id] = !this.state.power[id];
    }
    if (s.kind === "field") this.switches[s.id] = 8;
    if (s.kind === "trap") {
      if (!automatic && this.trapCooldown > 0) return;
      this.switches[s.id] = !this.switches[s.id];
      this.trapCooldown = 0.35;
    }
    if (s.kind === "conveyor") {
      const m = this.switches[s.id];
      this.switches[s.id] = m & 1 ? m ^ 3 : m | 1;
    }
    this.emit("switch", {
      kind: s.kind,
      text:
        s.kind === "field"
          ? "Force field lowered for eight seconds."
          : s.kind === "trap"
            ? this.switches[s.id]
              ? "Trapdoor opening."
              : "Trapdoor closing."
            : s.kind === "conveyor"
              ? "Conveyor motion changed."
              : "Lightning circuit switched.",
    });
  }
  killEnemy(e, cause, direction) {
    if (
      beginEnemyDeath(
        e,
        cause,
        cause === "fall" ? this.floorBelow(e.x, e.y) : e.y,
        direction,
      )
    )
      this.emit("monster", {
        cause,
        enemy: e.id,
        text:
          cause === "fall"
            ? "A long way down. The trap has claimed its guest."
            : cause === "lightning"
              ? "The doctor’s experiment has short-circuited."
              : "A direct hit. The doctor’s ray gun has found a new target.",
      });
  }
  die(text) {
    if (this.player.invincible > 0 || this.deathTimer) return;
    this.returns++;
    this.deathTimer = 1.4;
    this.player.walking = false;
    this.emit("death", { text });
  }
  retry(reset = true) {
    const index = this.roomIndex,
      spawn = this.spawn;
    if (reset) delete this.states[index];
    this.loadRoom(index, spawn);
    this.emit("notice", {
      text: reset
        ? "Room machinery reset. Your keys and opened doors are safe."
        : "Back at the room entrance. Your discoveries are safe.",
    });
  }
  recall() {
    if (!this.started || this.won) return;
    this.returns++;
    this.loadRoom(this.castle.startRoom, this.castle.startDoor);
    this.emit("notice", {
      text: "Back at the castle entrance. Keys, opened doors and machinery are preserved.",
    });
  }
  move(entity, dt, horizontal, vertical, speed, poles = true) {
    entity.walking = false;
    if (entity.climbing) {
      const l = entity.climbing,
        dir = l.pole ? Math.min(0, vertical) : vertical;
      const oldY = entity.y;
      entity.y = clamp(
        entity.y + dir * (l.pole ? 4.2 : 2.6) * dt,
        l.yBottom,
        l.yTop,
      );
      entity.walking = Math.abs(entity.y - oldY) > 0.001;
      const endpoint =
        (entity.y === l.yTop && dir > 0) || (entity.y === l.yBottom && dir < 0);
      const stop = endpoint
        ? entity.y
        : crossedLanding(l.stops, oldY, entity.y, dir, horizontal);
      if (stop !== undefined && (endpoint || horizontal)) {
        const landings = this.room.platforms.filter(
          (p) =>
            Math.abs(p.y - stop) < EPS &&
            l.x >= p.min - 0.28 &&
            l.x <= p.max + 0.28,
        );
        const landing = landings.find((p) =>
          horizontal > 0 ? p.max > l.x : horizontal < 0 ? p.min < l.x : true,
        );
        if (landing || endpoint) {
          const surface = landing || landings[0];
          if (surface) {
            entity.y = stop;
            entity.x = clamp(l.x, surface.min + 0.2, surface.max - 0.2);
            entity.climbing = null;
          }
        }
      }
      return;
    }
    if (vertical) {
      const ladder = this.room.ladders.find(
        (l) =>
          Math.abs(l.x - entity.x) < 0.55 &&
          entity.y >= l.yBottom - EPS &&
          entity.y <= l.yTop + EPS &&
          (vertical > 0 ? entity.y < l.yTop - EPS : entity.y > l.yBottom + EPS),
      );
      const pole =
        vertical < 0 &&
        poles &&
        this.room.poles.find(
          (l) =>
            Math.abs(l.x - entity.x) < 0.55 &&
            entity.y > l.yBottom + EPS &&
            entity.y <= l.yTop + EPS,
        );
      if (ladder || pole) {
        const l = ladder || pole;
        entity.x = l.x;
        entity.climbing = { ...l, pole: !ladder };
        this.move(entity, dt, 0, vertical, speed, poles);
        return;
      }
    }
    let velocity = horizontal * speed;
    for (const b of this.room.conveyors)
      if (
        Math.abs(entity.y - b.y) < EPS &&
        entity.x > b.min &&
        entity.x < b.max
      )
        velocity += this.beltSpeed(b);
    if (!velocity) return;
    let nx = clamp(entity.x + velocity * dt, -10.6, 10.6);
    const segments = this.room.platforms
        .filter((p) => Math.abs(p.y - entity.y) < EPS)
        .sort((a, b) => a.min - b.min),
      merged = [];
    for (const s of segments) {
      const last = merged.at(-1);
      if (last && s.min <= last.max + 0.025)
        last.max = Math.max(last.max, s.max);
      else merged.push({ min: s.min, max: s.max });
    }
    const segment = merged.find(
      (s) => entity.x >= s.min - 0.12 && entity.x <= s.max + 0.12,
    );
    if (segment) nx = clamp(nx, segment.min + 0.2, segment.max - 0.2);
    else return;
    for (const f of this.room.fields)
      if (
        this.fieldActive(f) &&
        entity.y >= f.y - 0.1 &&
        entity.y < f.y + f.height
      ) {
        if (entity.x < f.x) nx = Math.min(nx, f.x - 0.29);
        else nx = Math.max(nx, f.x + 0.29);
      }
    entity.walking = Math.abs(nx - entity.x) > 0.001;
    entity.x = nx;
    if (horizontal) entity.facing = horizontal;
  }
  fire(gun) {
    if (!gun || gun.cooldown > 0.25) return;
    gun.cooldown = 1.6;
    gun.charge = 0;
    this.projectiles.push({
      id: `shot-${this.elapsed}-${gun.id}`,
      x: gun.x + gun.direction * 0.48,
      y: gun.y,
      direction: gun.direction,
      age: 0,
    });
    this.emit("shot");
  }
  chase(e, dt) {
    const p = this.player;
    if (e.climbing) {
      const l = e.climbing;
      const dir = l.pole ? -1 : l.intent || Math.sign(p.y - e.y);
      const landing = l.stops.find(
        (y) =>
          Math.abs(y - p.y) < EPS &&
          dir * (y - e.y) > 0 &&
          Math.abs(y - e.y) <= (l.pole ? 4.2 : 2.6) * dt + 0.001,
      );
      this.move(
        e,
        dt,
        landing === undefined ? 0 : Math.sign(p.x - e.x) || 1,
        dir,
        e.speed,
      );
      return;
    }
    if (e.kind === "creature" && Math.abs(p.y - e.y) > 0.25) {
      const dir = Math.sign(p.y - e.y);
      const links = [
        ...this.room.ladders.map((l) => ({ ...l, pole: false })),
        ...this.room.poles.map((l) => ({ ...l, pole: true })),
      ].filter(
        (l) =>
          (!l.pole || dir < 0) &&
          l.stops.some((y) => Math.abs(y - e.y) < EPS) &&
          l.stops.some((y) => dir * (y - e.y) > 0.2),
      );
      const target = links
        .filter((l) =>
          this.room.platforms.some(
            (s) =>
              Math.abs(s.y - e.y) < EPS &&
              l.x >= s.min - 0.28 &&
              l.x <= s.max + 0.28 &&
              this.connected(e.x, clamp(l.x, s.min, s.max), e.y),
          ),
        )
        .sort((a, b) => Math.abs(a.x - e.x) - Math.abs(b.x - e.x))[0];
      if (target) {
        if (Math.abs(target.x - e.x) < 0.55) {
          this.move(e, dt, 0, dir, e.speed);
          if (e.climbing) e.climbing.intent = dir;
        } else this.move(e, dt, Math.sign(target.x - e.x), 0, e.speed);
        return;
      }
    }
    this.move(
      e,
      dt,
      Math.abs(p.x - e.x) < 0.06 ? 0 : Math.sign(p.x - e.x),
      0,
      e.speed,
      false,
    );
  }
  connected(x1, x2, y) {
    const min = Math.min(x1, x2),
      max = Math.max(x1, x2);
    let reach = min;
    for (const s of this.room.platforms
      .filter((p) => Math.abs(p.y - y) < EPS)
      .sort((a, b) => a.min - b.min)) {
      if (s.min <= reach + 0.03 && s.max >= reach)
        reach = Math.max(reach, s.max);
    }
    return reach >= max;
  }
  hazards(entity, isPlayer = false) {
    for (const trap of this.room.traps)
      if (
        !entity.climbing &&
        this.switches[trap.switch] &&
        Math.abs(entity.y - trap.y) < 0.12 &&
        Math.abs(entity.x - trap.x) < trap.width / 2 - 0.3
      ) {
        isPlayer
          ? this.die("Mind the gap. That trapdoor was open.")
          : this.killEnemy(entity, "fall");
        return;
      }
    for (const l of this.room.lightning)
      if (
        this.lightningActive(l) &&
        Math.abs(entity.x - l.x) < 0.34 &&
        entity.y < l.orbY + 0.05 &&
        entity.y + 1.1 > l.y + 0.1
      ) {
        isPlayer
          ? this.die("An electrifying mistake. Find the lightning switch.")
          : this.killEnemy(entity, "lightning");
        return;
      }
  }
  update(dt, input = {}) {
    if (!this.started || this.paused || this.won) return;
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    for (const e of this.enemies) advanceEnemyDeath(e, dt);
    if (this.deathTimer > 0) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.retry(false);
      return;
    }
    const p = this.player;
    p.invincible = Math.max(0, p.invincible - dt);
    this.selectionCooldown = Math.max(0, this.selectionCooldown - dt);
    this.trapCooldown = Math.max(0, this.trapCooldown - dt);
    for (const s of this.room.switches)
      if (s.kind === "field")
        this.switches[s.id] = Math.max(0, this.switches[s.id] - dt);
    const h = (input.right ? 1 : 0) - (input.left ? 1 : 0),
      v = (input.up ? 1 : 0) - (input.down ? 1 : 0),
      near = this.nearby();
    let operating = false;
    const gripping =
      p.climbing ||
      (v &&
        [
          ...this.room.ladders.filter((l) =>
            v > 0 ? p.y < l.yTop - EPS : p.y > l.yBottom + EPS,
          ),
          ...(v < 0
            ? this.room.poles.filter((l) => p.y > l.yBottom + EPS)
            : []),
        ].some(
          (l) =>
            p.y >= l.yBottom - EPS &&
            p.y <= l.yTop + EPS &&
            Math.abs(l.x - p.x) < 0.55 &&
            Math.abs(l.x - p.x) <= Math.abs((near?.x ?? Infinity) - p.x) + 0.01,
        ));
    if (!gripping && v && !h && near?.type === "teleporter") {
      operating = true;
      if (this.selectionCooldown === 0) {
        const n = near.targets.length;
        this.state.teleports[near.id] =
          (this.state.teleports[near.id] + (v > 0 ? 1 : n - 1)) % n;
        this.selectionCooldown = 0.28;
      }
    }
    if (!gripping && v && !h && near?.kind === "gun") {
      operating = true;
      const gun = this.guns.find((g) => g.id === near.gun);
      gun.y = clamp(gun.y + v * 2.2 * dt, gun.yBottom, gun.yTop);
      gun.controlled = 0.5;
    }
    if (!operating) this.move(p, dt, h, v, 3.65);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (
        !e.active &&
        (e.kind === "creature"
          ? (p.x - e.trigger.x) * (e.wakeDirection ?? 1) >= 0
          : Math.abs(p.x - e.trigger.x) < 0.65) &&
        Math.abs(p.y - e.trigger.y) < 0.3
      ) {
        e.active = true;
        e.wake = 0.7;
        this.emit("wake", {
          text:
            e.kind === "mummy"
              ? "The ankh awakens its ancient guardian."
              : "Something is rising from the coffin.",
        });
      }
      if (!e.active) continue;
      if (e.wake > 0) e.wake -= dt;
      else this.chase(e, dt);
      this.hazards(e);
      if (e.alive && Math.abs(e.x - p.x) < 0.48 && Math.abs(e.y - p.y) < 0.65)
        this.die("The residents would prefer that you stay.");
    }
    const presses = new Set();
    for (const s of this.room.switches.filter((s) => s.automatic)) {
      for (const [id, entity] of [
        ["player", p],
        ...this.enemies
          .filter((e) => e.alive && e.active)
          .map((e) => [e.id, e]),
      ])
        if (
          !entity.climbing &&
          Math.abs(entity.x - s.x) < 0.36 &&
          Math.abs(entity.y - s.y) < 0.15
        ) {
          const key = `${s.id}:${id}`;
          presses.add(key);
          if (!this.pressure.has(key)) this.activate(s, true);
        }
    }
    this.pressure = presses;
    this.hazards(p, true);
    for (const g of this.guns) {
      g.cooldown = Math.max(0, g.cooldown - dt);
      g.controlled = Math.max(0, g.controlled - dt);
      if (!g.controlled) {
        const target = clamp(p.y + 0.62, g.yBottom, g.yTop);
        g.y += clamp(target - g.y, -0.68 * dt, 0.68 * dt);
        if (
          Math.abs(g.y - (p.y + 0.62)) < 0.16 &&
          Math.sign(p.x - g.x) === g.direction
        ) {
          g.charge += dt;
          if (g.charge > 0.45) this.fire(g);
        } else g.charge = 0;
      }
    }
    for (const shot of this.projectiles) {
      const old = shot.x;
      shot.x += shot.direction * 9 * dt;
      shot.age += dt;
      const hits = (e) =>
        shot.y > e.y + 0.1 &&
        shot.y < e.y + 1.18 &&
        Math.min(old, shot.x) - 0.22 < e.x &&
        Math.max(old, shot.x) + 0.22 > e.x;
      for (const e of this.enemies)
        if (e.alive && e.active && hits(e)) {
          this.killEnemy(e, "ray", shot.direction);
          shot.dead = true;
        }
      if (!shot.dead && hits(p)) {
        this.die("Caught in the ray gun’s sights.");
        shot.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter(
      (s) => !s.dead && Math.abs(s.x) < 12 && s.age < 4,
    );
  }
}

export function validateClassicSave(raw) {
  if (!raw || raw.version !== 2) return null;
  const castle = castleById(raw.castleId);
  if (
    !castle?.original ||
    !Number.isInteger(raw.roomIndex) ||
    !castle.rooms[raw.roomIndex]
  )
    return null;
  if (
    !Number.isFinite(raw.elapsed) ||
    raw.elapsed < 0 ||
    !Number.isInteger(raw.returns) ||
    raw.returns < 0 ||
    !Array.isArray(raw.keys) ||
    raw.keys.some((k) => !castle.keyIds.includes(k)) ||
    !Array.isArray(raw.visited) ||
    raw.visited.some((i) => !Number.isInteger(i) || !castle.rooms[i])
  )
    return null;
  if (
    !raw.spawn ||
    !Number.isFinite(raw.spawn.x) ||
    Math.abs(raw.spawn.x) > 12 ||
    !Number.isFinite(raw.spawn.y) ||
    raw.spawn.y < -0.5 ||
    raw.spawn.y > 12
  )
    return null;
  if (
    !castle.rooms[raw.roomIndex].platforms.some(
      (p) =>
        Math.abs(p.y - raw.spawn.y) < EPS &&
        raw.spawn.x >= p.min &&
        raw.spawn.x <= p.max,
    )
  )
    return null;
  if (
    !Array.isArray(raw.opened) ||
    raw.opened.some((k) => {
      const m = /^(\d+):(\d+)$/.exec(k);
      return !m || !castle.rooms[+m[1]]?.doors[+m[2]];
    })
  )
    return null;
  if (
    !raw.states ||
    typeof raw.states !== "object" ||
    Array.isArray(raw.states)
  )
    return null;
  for (const [index, state] of Object.entries(raw.states)) {
    if (!/^\d+$/.test(index)) return null;
    const room = castle.rooms[index];
    if (!room || !state || typeof state !== "object" || Array.isArray(state))
      return null;
    for (const field of ["switches", "power", "teleports"])
      if (
        !state[field] ||
        typeof state[field] !== "object" ||
        Array.isArray(state[field])
      )
        return null;
    for (const [id, v] of Object.entries(state.switches)) {
      const s = room.switches.find((s) => s.id === id);
      if (!s) return null;
      if (s.kind === "field") {
        if (!Number.isFinite(v) || v < 0 || v > 8) return null;
      } else if (s.kind === "conveyor") {
        if (!Number.isInteger(v) || v < 0 || v > 3) return null;
      } else if (typeof v !== "boolean") return null;
    }
    for (const [id, v] of Object.entries(state.power))
      if (!room.lightning.some((l) => l.id === id) || typeof v !== "boolean")
        return null;
    if (
      !Array.isArray(state.dead) ||
      state.dead.some((id) => !room.enemies.some((e) => e.id === id))
    )
      return null;
    for (const [id, v] of Object.entries(state.teleports)) {
      const t = room.teleporters.find((t) => t.id === id);
      if (!t || !Number.isInteger(v) || v < 0 || v >= t.targets.length)
        return null;
    }
  }
  return raw;
}
