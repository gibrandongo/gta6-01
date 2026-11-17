// Shared helpers for Solmar Bay: a seeded random stream (so the city is the same every
// visit) and small math helpers used by every system in the game.

export function createRandom(seed) {
  let state = (seed >>> 0) || 1;
  function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  }
  function range(min, max) {
    return min + next() * (max - min);
  }
  function int(min, max) {
    return Math.floor(range(min, max + 1));
  }
  function pick(list) {
    return list[Math.floor(next() * list.length)];
  }
  function chance(p) {
    return next() < p;
  }
  return { next, range, int, pick, chance };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// Clamp a blend factor to the 0..1 range.
export function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed turn from angle a to angle b, in radians.
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDelta(a, b) * clamp01(t);
}

export function distance2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function formatMoney(cash) {
  const sign = cash < 0 ? '-' : '';
  const whole = Math.abs(Math.floor(cash));
  return sign + '$' + String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatClock(minutesOfDay) {
  const h = Math.floor(minutesOfDay / 60) % 24;
  const m = Math.floor(minutesOfDay % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
