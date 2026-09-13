import { CASTLES } from "../src/catalog.js";
const errors = [],
  odd = [];
for (const c of CASTLES)
  for (const r of c.rooms) {
    const id = `${c.id}/${r.number}`;
    for (const d of r.doors) {
      if (d.target !== "win" && !c.rooms[d.target]?.doors[d.targetDoor])
        errors.push(`${id} bad door ${d.index}`);
      if (
        !r.platforms.some(
          (p) => Math.abs(p.y - d.y) < 0.06 && d.x >= p.min && d.x <= p.max,
        )
      )
        errors.push(`${id} unsupported door ${d.index}`);
    }
    for (const s of r.switches) {
      if (s.door !== undefined && !r.doors[s.door])
        errors.push(`${id} bad control ${s.id}`);
      for (const m of s.machines || [])
        if (!r.lightning.some((l) => l.id === m))
          errors.push(`${id} bad power ${s.id}:${m}`);
    }
    for (const l of [...r.ladders, ...r.poles])
      if (l.stops.length < 2)
        odd.push(`${id} ${l.id} stops:${l.stops} source:${l.source}`);
    for (const item of [
      ...r.keys,
      ...r.switches,
      ...r.enemies,
      ...r.teleporters,
      ...r.receivers,
    ])
      if (
        !r.platforms.some(
          (p) =>
            Math.abs(p.y - item.y) < 0.06 &&
            item.x >= p.min - 0.3 &&
            item.x <= p.max + 0.3,
        )
      )
        odd.push(`${id} unsupported ${item.id} (${item.x},${item.y})`);
    for (const g of r.guns)
      if (g.yBottom > g.yTop) errors.push(`${id} bad rail ${g.id}`);
  }
console.log(JSON.stringify({ errors, odd }, null, 2));
