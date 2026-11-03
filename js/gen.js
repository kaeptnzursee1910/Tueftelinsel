// Tüftelinsel – Inselwelt aus einem Startwert erzeugen. Jedes Gerät rechnet die gleiche Welt selbst aus.
import { makeNoise2, hash2, hashString } from './noise.js';
import { B } from './blocks.js';

export const CS = 16;   // Chunk-Breite (x und z)
export const CH = 64;   // Welthöhe
export const SEA = 20;  // Meeresspiegel (oberste Wasserschicht)
export const idx = (x, y, z) => (y * CS + z) * CS + x;
export const ckey = (cx, cz) => cx + ',' + cz;

export function seedNumber(seed) { return /^-?\d+$/.test(String(seed).trim()) ? (parseInt(seed, 10) >>> 0) : hashString(seed); }

export function makeGen(seed) {
  const s = seedNumber(seed);
  const n1 = makeNoise2(s), n2 = makeNoise2(s + 1013), n3 = makeNoise2(s + 2027), n4 = makeNoise2(s + 3011);
  const fbm = (n, x, z, oct) => { let v = 0, a = 1, f = 1, t = 0; for (let i = 0; i < oct; i++) { v += a * n(x * f, z * f); t += a; a *= 0.5; f *= 2; } return v / t; };

  // Geländehöhe der obersten festen Schicht
  function height(x, z) {
    const d = Math.hypot(x, z);
    const e = fbm(n1, x * 0.004, z * 0.004, 4) * 1.3 - 0.2 + 0.62 * Math.max(0, 1 - d / 150);
    let h;
    if (e < 0) h = SEA + 0.5 + e * 30;
    else {
      const hill = fbm(n2, x * 0.022, z * 0.022, 3);
      const ridge = 1 - Math.abs(fbm(n3, x * 0.009, z * 0.009, 3));
      const m = Math.max(0, e - 0.3);
      h = SEA + 0.5 + e * 10 + hill * 3.5 * Math.min(1, e * 3) + m * ridge * ridge * 55;
    }
    return Math.max(3, Math.min(CH - 8, Math.floor(h)));
  }

  function surface(x, z, h) {
    if (h <= SEA + 1) return h < SEA - 4 && n4(x * 0.05, z * 0.05) > 0.35 ? B.GRAVEL : B.SAND;
    if (h > 46) return n4(x * 0.08, z * 0.08) > 0.2 ? B.MOSSROCK : B.STONE;
    return B.GRASS;
  }

  // 0 nichts, 1 Palme, 2 Laubbaum
  function treeAt(x, z, h, top) {
    if (top === B.SAND && h === SEA + 1 && hash2(x, z, s) < 0.012) return 1;
    if (top === B.GRASS) {
      const r = hash2(x, z, s);
      if (h < SEA + 6) return r < 0.012 ? 1 : 0;
      return r < 0.014 ? 2 : 0;
    }
    return 0;
  }

  function chunk(cx, cz) {
    const data = new Uint8Array(CS * CS * CH);
    const x0 = cx * CS, z0 = cz * CS;
    const set = (x, y, z, b, force) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 1 || y >= CH) return;
      const i = idx(lx, y, lz);
      if (force || data[i] === B.AIR || data[i] === B.BEACHGRASS || data[i] === B.HIBISCUS) data[i] = b;
    };
    for (let lz = 0; lz < CS; lz++) for (let lx = 0; lx < CS; lx++) {
      const x = x0 + lx, z = z0 + lz;
      const h = height(x, z), top = surface(x, z, h);
      data[idx(lx, 0, lz)] = B.BEDROCK;
      const under = top === B.GRASS ? B.DIRT : top === B.SAND ? B.SAND : top === B.GRAVEL ? B.SAND : B.STONE;
      for (let y = 1; y <= h; y++) {
        const dep = h - y;
        let b;
        if (dep === 0) b = top;
        else if (dep <= 3) b = under;
        else if (dep <= 5 && top === B.SAND) b = B.SANDSTONE;
        else b = y < 9 ? B.BASALT : B.STONE;
        data[idx(lx, y, lz)] = b;
      }
      for (let y = h + 1; y <= SEA; y++) data[idx(lx, y, lz)] = B.WATER;
      // Korallen im flachen Wasser
      if (h < SEA - 2 && h > SEA - 10) {
        const r = hash2(x, z, s + 7);
        if (r < 0.05) { const c = r < 0.025 ? B.CORAL : B.CORAL_B; data[idx(lx, h + 1, lz)] = c; if (r < 0.012 && h + 2 < SEA) data[idx(lx, h + 2, lz)] = c; }
      }
      // Gras und Blumen
      if (top === B.GRASS && h + 1 < CH) {
        const r = hash2(x, z, s + 3);
        if (r < 0.1) data[idx(lx, h + 1, lz)] = B.BEACHGRASS;
        else if (r < 0.118) data[idx(lx, h + 1, lz)] = B.HIBISCUS;
      } else if (top === B.SAND && h > SEA && hash2(x, z, s + 3) < 0.04) data[idx(lx, h + 1, lz)] = B.BEACHGRASS;
      // Treibholz am Strand
      if (top === B.SAND && h === SEA + 1 && hash2(x, z, s + 11) < 0.006) data[idx(lx, h + 1, lz)] = B.DRIFTWOOD;
    }
    // Bäume (auch die aus Nachbarspalten, die in diesen Chunk ragen)
    for (let x = x0 - 3; x < x0 + CS + 3; x++) for (let z = z0 - 3; z < z0 + CS + 3; z++) {
      const h = height(x, z), top = surface(x, z, h);
      const t = treeAt(x, z, h, top);
      if (!t) continue;
      const r = hash2(x, z, s + 5);
      if (t === 1) {
        const th = 5 + Math.floor(r * 3), ty = h + th;
        for (let y = h + 1; y <= ty; y++) set(x, y, z, B.PALM, true);
        set(x, ty + 1, z, B.PALM_LEAVES);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          set(x + dx, ty + 1, z + dz, B.PALM_LEAVES);
          set(x + dx * 2, ty, z + dz * 2, B.PALM_LEAVES);
          set(x + dx * 3, ty - 1, z + dz * 3, B.PALM_LEAVES);
        }
        for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { set(x + dx, ty, z + dz, B.PALM_LEAVES); set(x + dx * 2, ty - 1, z + dz * 2, B.PALM_LEAVES); }
      } else {
        const th = 4 + Math.floor(r * 2), ty = h + th;
        for (let dy = -2; dy <= 1; dy++) {
          const rad = dy <= -1 ? 2 : 1;
          for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
            if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy === 1 || hash2(x + dx, z + dz, s + dy * 31) < 0.5)) continue;
            set(x + dx, ty + dy, z + dz, B.LEAVES);
          }
        }
        for (let y = h + 1; y <= ty - 1; y++) set(x, y, z, B.WOOD, true);
      }
    }
    return data;
  }

  // Startplatz: das nächste trockene Stück Land in der Nähe der Mitte
  function findSpawn() {
    for (let r = 0; r < 400; r += 4) {
      const steps = Math.max(1, Math.round(r * 1.5));
      for (let k = 0; k < steps; k++) {
        const a = k / steps * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        const h = height(x, z);
        if (h >= SEA + 2 && h < 40 && !treeAt(x, z, h, surface(x, z, h))) return [x + 0.5, h + 1, z + 0.5];
      }
    }
    return [0.5, CH - 4, 0.5];
  }

  return { height, chunk, findSpawn };
}
