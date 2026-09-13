import originals from "./data/original-castles.js";
import { ROOMS } from "./levels.js";
import { LESSONS } from "./tutorial.js";

export const PALETTE = [
  0x202820, 0xe0e4d8, 0xce6657, 0x73c9cf, 0xb988c8, 0x85ad6a, 0x6e88ce,
  0xead079, 0xc99657, 0x9c754c, 0xe49b83, 0x596562, 0x87918a, 0xb0cd87,
  0x94abc9, 0xb6beb0,
];
export const KEY_INFO = {
  bronze: { name: "Brass", color: 0xf2b95f },
  silver: { name: "Silver", color: 0x9deaff },
  gold: { name: "Gold", color: 0xffdb6f },
  white: { name: "White", color: PALETTE[1] },
  red: { name: "Red", color: PALETTE[2] },
  cyan: { name: "Cyan", color: PALETTE[3] },
  purple: { name: "Purple", color: PALETTE[4] },
  green: { name: "Green", color: PALETTE[5] },
  blue: { name: "Blue", color: PALETTE[6] },
  yellow: { name: "Yellow", color: PALETTE[7] },
};
const colors = [
  "",
  "white",
  "red",
  "cyan",
  "purple",
  "green",
  "blue",
  "yellow",
];
const X = (x) => +((x - 96) * 0.135).toFixed(5);
const Y = (y) => +((192 - y) * 0.06).toFixed(5);
const titleCase = (s) =>
  s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const descriptions = {
  tutorial: "The doctor’s thirteen lessons in survival.",
  sylvania: "The familiar first estate. Sixteen rooms of misdirection.",
  callanwolde: "Twenty-four rooms woven into a labyrinth.",
  tannenbaum: "A branching puzzle with all seven coloured keys.",
  alternation: "A castle that rewards changing your approach.",
  freedonia: "Five rooms. A deceptively compact challenge.",
  carpathia: "A sprawling estate of monsters and machinery.",
  parthenia: "A tangle of passages, poles, and hidden routes.",
  teasdale: "Two keys, sixteen rooms, and no easy shortcuts.",
  rittenhouse: "The doctor’s most interconnected estate.",
  romania: "Careful observation is your best companion.",
  doublecross: "Expect the route to turn back on itself.",
  baskerville: "The inhabitants have been expecting visitors.",
  lovecraft: "The final estate. Every trick in the doctor’s book.",
};

function convertRoom(raw, castle) {
  const o = raw.objects,
    platforms = (o.platforms || []).map(([len, x, y], i) => ({
      id: `platform-${i}`,
      min: X(x),
      max: X(x + len * 4),
      y: Y(y),
      source: [len, x, y],
    }));
  const supporting = (x, pref) => {
    const nearby = platforms.filter(
      (p) => x >= p.min - 0.3 && x <= p.max + 0.3,
    );
    return (
      (nearby.length ? nearby : platforms).sort(
        (a, b) => Math.abs(a.y - Y(pref)) - Math.abs(b.y - Y(pref)),
      )[0]?.y ?? Y(pref)
    );
  };
  const point = (x, y, dx = 4, dy = 24) => ({
    x: X(x + dx),
    y: supporting(X(x + dx), y + dy),
  });
  const room = {
    id: `${castle.id}-${raw.id}`,
    number: raw.id,
    name:
      castle.id === "tutorial"
        ? titleCase(o.texts?.[0]?.text || `Lesson ${raw.id + 1}`)
        : `${castle.name} · Room ${String(raw.id + 1).padStart(2, "0")}`,
    original: true,
    map: raw.map,
    color: raw.color,
    tint: PALETTE[raw.color],
    subtitle: `${castle.name} · Original room ${String(raw.id + 1).padStart(2, "0")}`,
    objective: "Find the way through",
    description:
      "Follow the original passages, open doors with their bells or coloured locks, and find the castle exit.",
    hint: "Check the map for connected rooms. Doorbells can be far from their doors; doors with no bell or lock must be opened from the other side.",
    platforms,
    ladders: [],
    poles: [],
    keys: [],
    switches: [],
    fields: [],
    lightning: [],
    traps: [],
    conveyors: [],
    enemies: [],
    teleporters: [],
    receivers: [],
    guns: [],
    doors: [],
    notes: (o.texts || []).map((t) => t.text),
  };
  for (const [kind, list] of [
    ["ladders", o.ladders || []],
    ["poles", o.poles || []],
  ])
    list.forEach(([len, x, y], i) => {
      const cx = X(x + 2),
        bottom = Y(y + (len - (kind === "ladders" ? 1 : 0)) * 8),
        top = Y(y);
      const stops = [
        ...new Set(
          platforms
            .filter(
              (p) =>
                cx >= p.min - 0.28 &&
                cx <= p.max + 0.28 &&
                p.y >= bottom - 0.03 &&
                p.y <= top + 0.03,
            )
            .map((p) => p.y),
        ),
      ].sort((a, b) => a - b);
      room[kind].push({
        id: `${kind}-${i}`,
        x: cx,
        yBottom: stops.length ? stops[0] : bottom,
        yTop: stops.length > 1 ? stops.at(-1) : top,
        stops,
        source: [len, x, y],
      });
    });
  (o.doors || []).forEach((d, i) =>
    room.doors.push({
      id: `door-${i}`,
      index: i,
      x: X(d[0] + 10),
      y: Y(d[1] + 32),
      target: d[7] ? "win" : d[3],
      targetDoor: d[4],
      initialOpen: !!(d[2] & 128),
      direction: d[2] & 3,
      mapX: d[5],
      mapY: d[6],
      label: d[7]
        ? "Leave the castle"
        : `Enter room ${String(d[3] + 1).padStart(2, "0")}`,
      source: d,
    }),
  );
  (o.bells || []).forEach((d, i) =>
    room.switches.push({
      id: `bell-${i}`,
      kind: "bell",
      ...point(d[0], d[1]),
      door: d[2],
      label: `Ring bell · door ${d[2] + 1}`,
      source: d,
    }),
  );
  (o.locks || []).forEach((d, i) =>
    room.switches.push({
      id: `lock-${i}`,
      kind: "lock",
      ...point(d[3], d[4]),
      key: colors[d[0]],
      door: d[2],
      label: `Use the ${colors[d[0]]} key`,
      source: d,
    }),
  );
  (o.keys || []).forEach((d, i) =>
    room.keys.push({
      id: colors[d[0]],
      uid: `key-${i}`,
      ...point(d[2], d[3]),
      source: d,
    }),
  );
  (o.lightning || []).forEach((d, i) => {
    if (d[0] & 128)
      room.switches.push({
        id: `power-${i}`,
        kind: "power",
        ...point(d[1], d[2]),
        machines: d
          .slice(4)
          .filter((n) => n !== 255)
          .map((n) => `lightning-${n / 8}`),
        initial: !!(d[0] & 64),
        label: "Toggle lightning machines",
        source: d,
      });
    else {
      const x = X(d[1] + 4),
        orbY = Y(d[2] + d[3] * 8 + 8),
        base = supporting(x, d[2] + d[3] * 8 + 40);
      room.lightning.push({
        id: `lightning-${i}`,
        x,
        y: base,
        orbY,
        mountY: Y(d[2]),
        initialOn: !!(d[0] & 64),
        source: d,
      });
    }
  });
  (o.fields || []).forEach((d, i) => {
    const id = `field-${i}`;
    room.switches.push({
      id,
      kind: "field",
      ...point(d[0], d[1]),
      label: "Lower force field · 8 seconds",
    });
    room.fields.push({
      id,
      x: X(d[2] + 4),
      y: Y(d[3] + 24),
      height: 1.44,
      switch: id,
      source: d,
    });
  });
  (o.traps || []).forEach((d, i) => {
    const id = `trap-${i}`;
    room.switches.push({
      id,
      kind: "trap",
      ...point(d[3], d[4]),
      initial: !!(d[0] & 1),
      automatic: true,
      label: "Trapdoor pressure control",
    });
    room.traps.push({
      id,
      x: X(d[1] + 6),
      y: Y(d[2]),
      // Original trap graphic is three four-unit columns, not a door's width.
      width: 12 * 0.135,
      switch: id,
      source: d,
    });
  });
  (o.conveyors || []).forEach((d, i) => {
    const id = `conveyor-${i}`;
    room.switches.push({
      id,
      kind: "conveyor",
      ...point(d[3], d[4], 6, 16),
      initial: d[0] & 3,
      label: "Cycle conveyor direction",
    });
    room.conveyors.push({
      id,
      min: X(d[1]),
      max: X(d[1] + 32),
      y: Y(d[2]),
      speed: d[0] & 1 ? (d[0] & 2 ? 1 : -1) * 4.4 : 0,
      switch: id,
      source: d,
    });
  });
  (o.mummies || []).forEach((d, i) =>
    room.enemies.push({
      id: `mummy-${i}`,
      kind: "mummy",
      ...point(d[3], d[4], 8, 24),
      trigger: point(d[1], d[2]),
      dormant: d[0] === 1,
      speed: 1.18,
      source: d,
    }),
  );
  (o.creatures || []).forEach((d, i) =>
    room.enemies.push({
      id: `creature-${i}`,
      kind: "creature",
      ...point(d[1], d[2], 8, 24),
      trigger: point(d[1], d[2], 8, 24),
      dormant: !(d[0] & 2),
      wakeDirection: d[0] & 1 ? -1 : 1,
      speed: 1.55,
      source: d,
    }),
  );
  (o.guns || []).forEach((d, i) => {
    const id = `gun-${i}`;
    room.switches.push({
      id,
      kind: "gun",
      ...point(d[5], d[6]),
      gun: id,
      label: "Ray gun · ↑ ↓ aim · E fire",
    });
    room.guns.push({
      id,
      x: X(d[1] + 2),
      yTop: Y(d[2]) - 0.36,
      yBottom: Y(d[2] + Math.max(0, d[3] * 8 - 11)) - 0.36,
      headY: Y(d[4]) - 0.36,
      direction: d[0] & 1 ? -1 : 1,
      source: d,
    });
  });
  (o.teleporters || []).forEach((d, i) => {
    const targets = d.targets.map(([x, y], j) => ({
      ...point(x, y, 4, 24),
      color: PALETTE[j + 2],
      name:
        [
          "Red",
          "Cyan",
          "Purple",
          "Green",
          "Blue",
          "Yellow",
          "Orange",
          "Brown",
          "Coral",
        ][j] || `Receiver ${j + 1}`,
      id: `receiver-${i}-${j}`,
    }));
    room.receivers.push(...targets);
    room.teleporters.push({
      id: `teleporter-${i}`,
      ...point(d.booth[0], d.booth[1], 8, 24),
      targets,
      initial: d.booth[2] % Math.max(1, targets.length),
      label: "Transmit · ↑ ↓ select destination",
      source: d,
    });
  });
  room.entry = room.doors[0]
    ? { x: room.doors[0].x, y: room.doors[0].y }
    : { x: platforms[0].min + 0.7, y: platforms[0].y };
  if (castle.id === "tutorial") {
    room.objective = room.name;
    room.description = LESSONS[raw.id];
    room.hint = room.description;
  }
  return room;
}

export const BLACKTHORN = {
  id: "blackthorn",
  name: "Blackthorn",
  original: false,
  description: "The six-room remake that started your expedition.",
  rooms: ROOMS,
  keyIds: ["bronze", "silver", "gold"],
  startRoom: 0,
  startDoor: 0,
};
export const CASTLES = originals.map((raw, index) => {
  const c = {
    ...raw,
    original: true,
    order: index,
    description: descriptions[raw.id],
  };
  c.rooms = raw.rooms.map((r) => convertRoom(r, c));
  c.keyIds = [...new Set(c.rooms.flatMap((r) => r.keys.map((k) => k.id)))].sort(
    (a, b) => colors.indexOf(a) - colors.indexOf(b),
  );
  return c;
});
export const ALL_CASTLES = [...CASTLES, BLACKTHORN];
export const castleById = (id) => ALL_CASTLES.find((c) => c.id === id);
export const TOTAL_ORIGINAL_ROOMS = CASTLES.reduce(
  (sum, c) => sum + c.rooms.length,
  0,
);
