export const DEATH_DURATION = 2.05;
export function beginEnemyDeath(
  enemy,
  cause,
  impactY = null,
  direction = enemy.facing || 1,
) {
  if (!enemy.alive) return false;
  enemy.alive = false;
  enemy.death = {
    cause,
    time: 0,
    duration: DEATH_DURATION,
    x: enemy.x,
    y: enemy.y,
    impactY: impactY ?? enemy.y - 0.2,
    direction,
  };
  return true;
}
export function advanceEnemyDeath(enemy, dt) {
  if (enemy.death)
    enemy.death.time = Math.min(enemy.death.duration, enemy.death.time + dt);
}
export function deathPose(death) {
  const t = death.time,
    fall = death.cause === "fall",
    electric = death.cause === "lightning",
    delay = electric ? 0.4 : fall ? 0.12 : 0;
  const motion = Math.max(0, t - delay),
    distance = Math.max(0, death.y - death.impactY);
  const fallTime = Math.sqrt((2 * distance) / 13),
    landed = fall && motion >= fallTime;
  const collapse = electric
    ? Math.min(1, motion / 0.5)
    : Math.min(1, motion / 0.42);
  return {
    x:
      death.x +
      (electric
        ? Math.sin(t * 95) * 0.055 * (t < 0.4 ? 1 : 0)
        : fall
          ? Math.sin(t * 9) * 0.08
          : death.direction * Math.min(0.5, motion * 1.7)),
    y: fall
      ? Math.max(death.impactY, death.y - 6.5 * motion * motion)
      : death.y + 0.22 * collapse,
    rotation: fall
      ? death.direction * Math.min(1.5, motion * 3)
      : -death.direction * collapse * 1.48,
    opacity: Math.max(0, Math.min(1, (death.duration - t) / 0.55)),
    shock: electric && t < 0.45,
    impact: fall
      ? Math.max(0, 1 - (motion - fallTime) / 0.7) * (landed ? 1 : 0)
      : Math.max(0, 1 - (motion - 0.25) / 0.7) * (motion > 0.25 ? 1 : 0),
    finished: t >= death.duration,
  };
}
