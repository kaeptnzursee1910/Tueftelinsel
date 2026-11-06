// Tüftelinsel – alle Blocktexturen werden hier Pixel für Pixel gemalt (keine Bilddateien)
import { TILES, BLOCKS, FACE_TILE } from './blocks.js';
import { rng } from './noise.js';

const S = 16;
let atlas = null;

const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
const hex = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Ein Maler pro Kachel: px(x, y, farbe, alpha) setzt ein Pixel, r() ist ein fester Zufall
const PAINT = {
  bedrock(px, r) { speck(px, r, 0x3b3846, 40); for (let i = 0; i < 14; i++) blob(px, r, 0x1f1d27, 2); },
  stone(px, r) { speck(px, r, 0x8d8f99, 22); for (let i = 0; i < 6; i++) blob(px, r, 0x777985, 2); crack(px, r, 0x6a6c77, 3); },
  dirt(px, r) { speck(px, r, 0x8a5a36, 28); for (let i = 0; i < 10; i++) px(Math.floor(r() * S), Math.floor(r() * S), 0x6b4226); },
  grass_top(px, r) { speck(px, r, 0x5fbf4a, 30); for (let i = 0; i < 18; i++) px(Math.floor(r() * S), Math.floor(r() * S), r() < 0.5 ? 0x7fd65a : 0x4aa63c); },
  grass_side(px, r) {
    PAINT.dirt(px, r);
    for (let x = 0; x < S; x++) { const d = 3 + Math.floor(r() * 3); for (let y = 0; y < d; y++) px(x, y, jit(r, 0x5fbf4a, 20)); }
  },
  sand(px, r) { speck(px, r, 0xf0d99a, 16); for (let i = 0; i < 14; i++) px(Math.floor(r() * S), Math.floor(r() * S), r() < 0.5 ? 0xe2c47e : 0xfff0c0); },
  sandstone(px, r) { speck(px, r, 0xe4c482, 12); for (const y of [4, 9, 14]) for (let x = 0; x < S; x++) px(x, y, jit(r, 0xc9a764, 10)); },
  sandstone_top(px, r) { speck(px, r, 0xe8ca8a, 14); frame(px, 0xcdab68); },
  gravel(px, r) { speck(px, r, 0x9a958c, 20); for (let i = 0; i < 16; i++) blob(px, r, r() < 0.5 ? 0x6e6a63 : 0xbcb6aa, 1); },
  water(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, 0x2f86d6, 10), 0.72);
    for (let i = 0; i < 6; i++) { const y = Math.floor(r() * S), x = Math.floor(r() * S); for (let k = 0; k < 4; k++) px((x + k) % S, y, 0x7cc4f2, 0.8); }
  },
  palm_side(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, 0xa47c4e, 12));
    for (let y = 1; y < S; y += 4) for (let x = 0; x < S; x++) px(x, (y + (x > 7 ? 1 : 0)) % S, 0x7a5734);
    for (let y = 0; y < S; y++) { px(0, y, 0x80603c); px(S - 1, y, 0x80603c); }
  },
  palm_top(px, r) { rings(px, r, 0xc79f68, 0x93703f); },
  palm_leaves(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (r() < 0.78) px(x, y, jit(r, (x + y) % 5 === 0 ? 0x2f9e45 : 0x45b84f, 18));
    for (let i = 0; i < S; i++) px(i, i, 0x6fd06a);
  },
  wood_side(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, x % 4 === 0 ? 0x5c3d22 : 0x74502e, 10));
  },
  wood_top(px, r) { rings(px, r, 0xb88a55, 0x7c5631); },
  leaves(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (r() < 0.82) px(x, y, jit(r, r() < 0.3 ? 0x2a7d36 : 0x3a9a40, 16));
  },
  planks(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, 0xc8955a, 10));
    for (const y of [3, 7, 11, 15]) for (let x = 0; x < S; x++) px(x, y, 0x8e6235);
    for (let row = 0; row < 4; row++) { const x = (row * 7 + 3) % S; for (let y = row * 4; y < row * 4 + 3; y++) px(x, y, 0x9c6d3d); }
  },
  driftwood(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, y % 3 === 0 ? 0x9a9284 : 0xb8b0a0, 10));
    for (let i = 0; i < 4; i++) blob(px, r, 0x7d756a, 1);
  },
  coral(px, r) {
    speck(px, r, 0xf27a68, 20);
    for (let i = 0; i < 16; i++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); px(x, y, 0xb84a4a); px((x + 1) % S, y, 0xffb0a0); }
  },
  coral_b(px, r) {
    speck(px, r, 0x3fb4c8, 20);
    for (let i = 0; i < 16; i++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); px(x, y, 0x1f6f8a); px((x + 1) % S, y, 0x9ef0f0); }
  },
  shellstone(px, r) {
    speck(px, r, 0xeee6d6, 10);
    for (let i = 0; i < 7; i++) {
      const x = 1 + Math.floor(r() * 13), y = 1 + Math.floor(r() * 13), c = r() < 0.5 ? 0xe8b9a0 : 0xd0c2a8;
      px(x, y, c); px(x + 1, y, c); px(x, y + 1, c); px(x + 1, y + 1, 0xb59c84);
    }
  },
  brick(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, 0xc06a45, 14));
    for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x++) px(x, y, 0xd9c7a8);
    for (let row = 0; row < 4; row++) { const o = row % 2 ? 4 : 0; for (const x0 of [0, 8]) for (let y = row * 4 + 1; y < row * 4 + 4; y++) px((x0 + o) % S, y, 0xd9c7a8); }
  },
  basalt(px, r) { speck(px, r, 0x45434d, 14); for (let x = 0; x < S; x += 5) for (let y = 0; y < S; y++) px(x, y, 0x2f2d36); },
  glass(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, 0xd8f4ff, 0.18);
    frame(px, 0xe8fbff, 1); for (let i = 3; i < 8; i++) px(i, i - 1, 0xffffff, 0.9);
  },
  lantern(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - 7.5, y - 8);
      px(x, y, d < 5 ? mixc(0xfff3b0, 0xffb84a, d / 5) : jit(r, 0xffa63c, 10));
    }
    frame(px, 0x5a3b22); for (let y = 0; y < S; y++) px(7, y, 0x5a3b22); for (let x = 0; x < S; x++) px(x, 7, 0x5a3b22);
  },
  lantern_top(px, r) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, 0x6e4a2a, 8)); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) px(x, y, 0xffd56a); },
  thatch(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, 0xd6b354, 18));
    for (let i = 0; i < 26; i++) { const x = Math.floor(r() * S), y = Math.floor(r() * S); for (let k = 0; k < 4; k++) px(x, (y + k) % S, 0xa8852f); }
    for (const y of [5, 11]) for (let x = 0; x < S; x++) px(x, y, 0x8f6d25);
  },
  thatch_top(px, r) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, (x + y) % 3 ? 0xd6b354 : 0xb89236, 14)); },
  cloth_r(px, r) { cloth(px, r, 0xe0453f); }, cloth_b(px, r) { cloth(px, r, 0x3d6fe0); }, cloth_y(px, r) { cloth(px, r, 0xf2c53a); },
  cloth_g(px, r) { cloth(px, r, 0x46b155); }, cloth_w(px, r) { cloth(px, r, 0xf0ece4); }, cloth_p(px, r) { cloth(px, r, 0x9a5ad8); },
  crystal(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, mixc(0x46e0d6, 0x2a7fd8, ((x + y) % 8) / 8));
    for (let i = 0; i < S; i++) { px(i, (i * 2) % S, 0xc8fff8); px((S - 1 - i), (i + 5) % S, 0xa0f0ff); }
  },
  beachgrass(px, r) {
    for (let i = 0; i < 7; i++) {
      let x = 2 + Math.floor(r() * 12); const h = 6 + Math.floor(r() * 9), c = r() < 0.5 ? 0x8fc45a : 0xb7c96a;
      for (let k = 0; k < h; k++) { px(Math.max(0, Math.min(S - 1, x)), S - 1 - k, c); if (r() < 0.25) x += r() < 0.5 ? -1 : 1; }
    }
  },
  hibiscus(px, r) {
    for (let y = 8; y < S; y++) px(7, y, 0x3f8f3a);
    px(6, 11, 0x52a848); px(5, 10, 0x52a848); px(8, 12, 0x52a848); px(9, 11, 0x52a848);
    for (let y = 2; y < 9; y++) for (let x = 4; x < 12; x++) { const d = Math.hypot(x - 7.5, y - 5); if (d < 3.6) px(x, y, d < 1.2 ? 0xffe066 : 0xe8325a); }
  },
  mossrock(px, r) { PAINT.stone(px, r); for (let i = 0; i < 9; i++) blob(px, r, r() < 0.5 ? 0x5a9a48 : 0x4a8a3c, 2); },
  tiles(px, r) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, ((x >> 2) + (y >> 2)) % 2 ? jit(r, 0x3fa7c8, 6) : jit(r, 0xf2efe6, 6));
  },
};

function jit(r, c, a) { const [R, G, B] = hex(c); const d = (r() - 0.5) * a; return [R + d, G + d, B + d]; }
function mixc(a, b, t) { return mix(hex(a), hex(b), Math.max(0, Math.min(1, t))); }
function speck(px, r, c, a) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(x, y, jit(r, c, a)); }
function blob(px, r, c, s) { const x = Math.floor(r() * S), y = Math.floor(r() * S); for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) px((x + dx) % S, (y + dy) % S, jit(r, c, 10)); }
function crack(px, r, c, n) { for (let i = 0; i < n; i++) { let x = Math.floor(r() * S), y = Math.floor(r() * S); for (let k = 0; k < 5; k++) { px(x, y, c); x = (x + (r() < 0.5 ? 1 : 0)) % S; y = (y + 1) % S; } } }
function frame(px, c, a) { for (let i = 0; i < S; i++) { px(i, 0, c, a); px(i, S - 1, c, a); px(0, i, c, a); px(S - 1, i, c, a); } }
function rings(px, r, light, dark) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const d = Math.hypot(x - 7.5, y - 7.5); px(x, y, Math.floor(d) % 3 === 0 ? jit(r, dark, 8) : jit(r, light, 8)); }
  frame(px, dark);
}
function cloth(px, r, c) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const [R, G, B] = hex(c); const k = (x + y) % 2 ? 1 : 0.9; px(x, y, jit(r, (clamp(R * k) << 16) | (clamp(G * k) << 8) | clamp(B * k), 8)); }
}

export function getAtlas() {
  if (atlas) return atlas;
  const cv = document.createElement('canvas'); cv.width = cv.height = S * 16;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(cv.width, cv.height);
  TILES.forEach((name, t) => {
    const ox = (t % 16) * S, oy = Math.floor(t / 16) * S;
    const r = rng(1000 + t * 77);
    const px = (x, y, c, a) => {
      if (x < 0 || y < 0 || x >= S || y >= S) return;
      const rgb = Array.isArray(c) ? c : hex(c);
      const i = ((oy + y) * cv.width + ox + x) * 4;
      img.data[i] = clamp(rgb[0]); img.data[i + 1] = clamp(rgb[1]); img.data[i + 2] = clamp(rgb[2]); img.data[i + 3] = clamp((a == null ? 1 : a) * 255);
    };
    (PAINT[name] || (p => speck(p, r, 0xff00ff, 0)))(px, r);
  });
  ctx.putImageData(img, 0, 0);
  atlas = cv;
  return cv;
}

// Kleines Würfelbild für Schnellleiste und Block-Menü
const iconCache = new Map();
export function blockIcon(b) {
  if (iconCache.has(b)) return iconCache.get(b);
  const at = getAtlas();
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const d = BLOCKS[b];
  const tile = f => { const t = FACE_TILE[b * 6 + f]; return [(t % 16) * S, Math.floor(t / 16) * S]; };
  if (d.kind === 'cross') {
    const [sx, sy] = tile(0);
    c.drawImage(at, sx, sy, S, S, 8, 8, 48, 48);
  } else {
    const face = (f, m, dark) => {
      const [sx, sy] = tile(f);
      c.setTransform(...m);
      c.drawImage(at, sx, sy, S, S, 0, 0, S, S);
      if (dark) { c.fillStyle = 'rgba(0,0,0,' + dark + ')'; c.fillRect(0, 0, S, S); }
    };
    const k = 1 / S;
    face(2, [28 * k, 14 * k, -28 * k, 14 * k, 32, 4], 0);
    face(4, [28 * k, 14 * k, 0, 30 * k, 4, 18], 0.18);
    face(0, [28 * k, -14 * k, 0, 30 * k, 32, 32], 0.34);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }
  const url = cv.toDataURL();
  iconCache.set(b, url);
  return url;
}
