// The same public movement / interaction methods used by the browser. No warps,
// invulnerability changes, unlocked-door injection, or disabled hazards.
export function playAction(g, a, dt = 1 / 60) {
  const result = executeAction(g, a, dt);
  if (!result && a.allowDeath && g.deathTimer > 0) {
    for (let i = 0; i < 200 && g.deathTimer > 0; i++) g.update(dt);
    return g.deathTimer <= 0;
  }
  return result;
}
function executeAction(g, a, dt = 1 / 60) {
  const room = g.roomIndex;
  const tick = (input, step = dt) => {
    g.update(step, input);
    return !g.deathTimer && g.roomIndex === room;
  };
  if (a.kind === "reset") {
    g.retry();
    return true;
  }
  if (a.kind === "return") {
    g.retry(false);
    return true;
  }
  if (a.kind === "recall") {
    g.recall();
    return true;
  }
  if (a.kind === "wait") {
    for (let t = 0; t < a.seconds; t += dt) if (!tick({})) return false;
    return true;
  }
  let stuck = 0;
  for (let i = 0; Math.abs(g.player.x - a.x) > 0.025; i++) {
    if (i > 600 || g.player.climbing) return false;
    if (stuck > 8) {
      if (Math.abs(g.player.x - a.x) < 0.55) break;
      return false;
    }
    const delta = a.x - g.player.x,
      old = g.player.x;
    if (
      !tick(
        { right: delta > 0, left: delta < 0 },
        Math.min(dt, Math.abs(delta) / 8.1),
      )
    )
      return false;
    stuck =
      Math.abs(a.x - g.player.x) >= Math.abs(a.x - old) - 0.0001
        ? stuck + 1
        : 0;
  }
  if (a.kind === "peek") {
    const dir = Math.sign(a.y - g.player.y);
    for (let i = 0; i < 900 && Math.abs(g.player.y - a.y) > 0.02; i++) {
      const oldY = g.player.y;
      if (
        !tick(
          { up: dir > 0, down: dir < 0 },
          Math.min(dt, Math.abs(a.y - g.player.y) / 4.2),
        )
      )
        return false;
      if (i > 1 && Math.abs(oldY - g.player.y) < 0.00001) return false;
    }
    for (let i = 0; i < 6; i++) if (!tick({})) return false;
    return true;
  }
  if (a.kind === "climb") {
    const dir = Math.sign(a.y - g.player.y);
    for (
      let i = 0;
      Math.abs(g.player.y - a.y) > 0.025 || g.player.climbing;
      i++
    ) {
      if (i > 900) return false;
      const old = g.player.y;
      const landing = Math.abs(old - a.y) <= 4.2 * dt + 0.002;
      const surface = g.room.platforms.find(
        (p) =>
          Math.abs(p.y - a.y) < 0.06 &&
          a.x >= p.min - 0.28 &&
          a.x <= p.max + 0.28,
      );
      if (
        !tick({
          up: dir > 0,
          down: dir < 0,
          right: landing && surface?.max > a.x,
          left: landing && surface?.max <= a.x,
        })
      )
        return false;
      if (i > 2 && old === g.player.y) return false;
    }
  }
  if (a.kind === "use") {
    if (a.target && g.nearby()?.id !== a.target) return false;
    g.interact();
  }
  if (a.kind === "teleport") {
    for (let t = 0; t < 0.3; t += dt) if (!tick({})) return false;
    for (let i = 0; i < a.turns; i++) {
      if (!tick({ up: true })) return false;
      for (let t = 0; t < 0.3; t += dt) if (!tick({})) return false;
    }
    g.interact();
  }
  return !g.deathTimer;
}
