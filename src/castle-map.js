const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export function castleMap(castle, game) {
  if (!castle.original)
    return `<div class="map-grid">${castle.rooms.map((room, i) => `<div class="map-room ${game.roomIndex === i ? "current" : ""}"><span>ROOM ${String(i + 1).padStart(2, "0")}</span><strong>${game.visited.has(i) ? esc(room.name) : "Uncharted room"}</strong><small>${game.roomIndex === i ? "◇ YOU ARE HERE" : game.visited.has(i) ? "EXPLORED" : "UNEXPLORED"}</small></div>`).join("")}</div>`;
  const boxes = castle.rooms.map((room) => ({
    x: room.map.x * 2,
    y: room.map.y,
    w: room.map.width * 8,
    h: room.map.height * 8,
  }));
  const minX = Math.min(...boxes.map((b) => b.x)) - 5,
    minY = Math.min(...boxes.map((b) => b.y)) - 5,
    maxX = Math.max(...boxes.map((b) => b.x + b.w)) + 5,
    maxY = Math.max(...boxes.map((b) => b.y + b.h)) + 5;
  const paths = [],
    seen = new Set();
  for (const room of castle.rooms)
    for (const d of room.doors) {
      if (d.target === "win") continue;
      const k = [room.number, d.target].sort((a, b) => a - b).join(":");
      if (seen.has(k)) continue;
      seen.add(k);
      const a = boxes[room.number],
        b = boxes[d.target];
      paths.push(
        `<path d="M${a.x + a.w / 2},${a.y + a.h / 2} L${b.x + b.w / 2},${b.y + b.h / 2}"/>`,
      );
    }
  return `<svg class="estate-map" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" role="img" aria-label="${esc(castle.name)} original castle map, ${castle.rooms.length} rooms. You are in room ${game.roomIndex + 1}."><g class="map-passages">${paths.join("")}</g>${boxes.map((b, i) => `<g class="estate-room ${game.visited.has(i) ? "visited" : ""} ${game.roomIndex === i ? "current" : ""}"><title>Room ${i + 1}${game.roomIndex === i ? " · You are here" : game.visited.has(i) ? " · Explored" : " · Unexplored"}</title><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="1"/><text x="${b.x + b.w / 2}" y="${b.y + b.h / 2}" font-size="${Math.min(6, b.w * 0.36, b.h * 0.4)}">${i + 1}</text></g>`).join("")}</svg>`;
}
