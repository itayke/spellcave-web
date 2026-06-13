// Minimal color helper replacing the bits of Phaser.Display.Color the engine relied on.
// GameConstants colors are now plain CSS hex strings ('#rrggbb'); this parses/blends them.

// Parse '#rgb' or '#rrggbb' (with or without leading '#') into { r, g, b } 0..255.
export function parseHex(hex) {
  let s = String(hex).trim().replace(/^#/, '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

// { r, g, b } -> '#rrggbb'
export function toCss({ r, g, b }) {
  const h = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// 24-bit integer (equivalent of Phaser Color's `.color`).
export function toInt(hex) {
  const { r, g, b } = parseHex(hex);
  return (r << 16) | (g << 8) | b;
}

// Linear interpolate between two hex colors. amt 0 -> a, 1 -> b. Returns a CSS hex string.
export function lerp(a, b, amt) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const t = Math.max(0, Math.min(1, amt));
  return toCss({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

export default { parseHex, toCss, toInt, lerp };