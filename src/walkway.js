// The walking surface stays continuous around the rear of a climbing hatch.
// Only the foreground stone is cut away; these are not fall hazards.
export function climbingOpenings(room, from, to, y) {
  const holes = [];
  for (const [kind, links] of [
    ["ladder", room.ladders],
    ["pole", room.poles],
  ]) {
    for (const l of links || []) {
      const bottom = l.yBottom ?? Math.min(l.from, l.to) * 3.6;
      const top = l.yTop ?? Math.max(l.from, l.to) * 3.6;
      if (y <= bottom + 0.055 || y > top + 0.055) continue;
      const radius = kind === "ladder" ? 0.59 : 0.46;
      const min = Math.max(from, l.x - radius),
        max = Math.min(to, l.x + radius);
      if (max > min) holes.push({ min, max });
    }
  }
  const merged = [];
  for (const hole of holes.sort((a, b) => a.min - b.min)) {
    const last = merged.at(-1);
    if (last && hole.min <= last.max) last.max = Math.max(last.max, hole.max);
    else merged.push({ ...hole });
  }
  return merged;
}

// Catch crossed landings even when a slow frame carries a pole rider past one.
export function crossedLanding(stops, oldY, newY, direction, sideways) {
  const crossed = stops.filter((y) =>
    direction > 0
      ? y > oldY && y <= newY
      : y < oldY && y >= newY,
  );
  if (crossed.length)
    return direction > 0 ? Math.min(...crossed) : Math.max(...crossed);
  if (sideways && !direction)
    return stops.find((y) => Math.abs(y - newY) < 0.12);
}
