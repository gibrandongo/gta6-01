// Small shared helpers: colour parsing and number clamping.

export function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
