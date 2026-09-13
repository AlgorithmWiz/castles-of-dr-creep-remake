import { CASTLES } from "../src/catalog.js";
// Structural reachability only: ignores timing hazards and conveyor resistance.
// Useful for detecting lost ladders, broken doors and keys imported onto the wrong walkway.
export function analyze(c) {
  const reached = new Set(),
    keys = new Set(),
    opened = new Set(),
    roomIds = new Set();
  let exit = false;
  const node = (r, p) => `${r}:${p}`,
    support = (r, item) =>
      c.rooms[r].platforms
        .map((p, i) =>
          Math.abs(p.y - item.y) < 0.07 &&
          item.x >= p.min - 0.3 &&
          item.x <= p.max + 0.3
            ? node(r, i)
            : null,
        )
        .filter(Boolean),
    has = (r, item) => support(r, item).some((n) => reached.has(n));
  const add = (r, item) => support(r, item).forEach((n) => reached.add(n));
  add(c.startRoom, c.rooms[c.startRoom].doors[c.startDoor]);
  for (let iteration = 0; iteration < 1000; iteration++) {
    const before = reached.size + opened.size + keys.size;
    for (const r of c.rooms) {
      const ri = r.number;
      for (const [i, p] of r.platforms.entries())
        if (reached.has(node(ri, i))) {
          roomIds.add(ri);
          for (const [j, q] of r.platforms.entries())
            if (
              Math.abs(p.y - q.y) < 0.07 &&
              p.min <= q.max + 0.03 &&
              p.max >= q.min - 0.03
            )
              reached.add(node(ri, j));
        }
      for (const [kind, links] of [
        ["ladder", r.ladders],
        ["pole", r.poles],
      ])
        for (const l of links)
          for (const y of l.stops)
            if (has(ri, { x: l.x, y }))
              for (const dest of l.stops)
                if (kind === "ladder" || dest < y) add(ri, { x: l.x, y: dest });
      for (const k of r.keys) if (has(ri, k)) keys.add(k.id);
      for (const s of r.switches)
        if (
          s.door !== undefined &&
          has(ri, s) &&
          (s.kind === "bell" || keys.has(s.key))
        ) {
          const d = r.doors[s.door];
          opened.add(`${ri}:${s.door}`);
          if (d.target !== "win") opened.add(`${d.target}:${d.targetDoor}`);
        }
      for (const t of r.teleporters)
        if (has(ri, t)) for (const d of t.targets) add(ri, d);
      for (const d of r.doors)
        if (has(ri, d) && (d.initialOpen || opened.has(`${ri}:${d.index}`))) {
          if (d.target === "win") exit = true;
          else add(d.target, c.rooms[d.target].doors[d.targetDoor]);
        }
    }
    if (before === reached.size + opened.size + keys.size) break;
  }
  return {
    castle: c.id,
    exit,
    rooms: roomIds.size,
    total: c.rooms.length,
    keys: [...keys],
    missing: c.rooms
      .filter((r) => !roomIds.has(r.number))
      .map((r) => r.number + 1),
  };
}
if (process.argv[1]?.endsWith("analyze-routes.mjs"))
  console.log(JSON.stringify(CASTLES.map(analyze), null, 2));
