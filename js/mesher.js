// Tüftelinsel – aus den Blöcken eines Chunks Dreiecke bauen (nur sichtbare Seiten, mit Eckenschatten)
import { CS, CH } from './gen.js';
import { KIND, OPAQUE, GLOW, FACE_TILE, B } from './blocks.js';

const P = CS + 2; // aufgefüllter Bereich mit einem Rand aus den Nachbar-Chunks
export const pidx = (x, y, z) => (y * P + (z + 1)) * P + (x + 1);

// Seiten: Normale n, Achsen u und v (u × v = n), Ursprung o
const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0], o: [1, 0, 1], shade: 0.8 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], o: [0, 0, 0], shade: 0.8 },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1], o: [0, 1, 1], shade: 1.0 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], o: [0, 0, 0], shade: 0.55 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 1], shade: 0.7 },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0], o: [1, 0, 0], shade: 0.7 },
];
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO = [0.45, 0.65, 0.83, 1];
const TS = 1 / 16, EPS = 0.0008;

class Buf {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  out() {
    return {
      pos: new Float32Array(this.pos), uv: new Float32Array(this.uv), col: new Float32Array(this.col),
      idx: this.n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
    };
  }
}

function tileUV(t) {
  const tx = t % 16, ty = Math.floor(t / 16);
  return [tx * TS + EPS, (tx + 1) * TS - EPS, 1 - (ty + 1) * TS + EPS, 1 - ty * TS - EPS];
}

// pad: Uint8Array der Größe P*P*CH
export function buildMesh(pad) {
  const solid = new Buf(), cut = new Buf(), water = new Buf();
  const get = (x, y, z) => (y < 0 ? B.BEDROCK : y >= CH ? 0 : pad[pidx(x, y, z)]);
  for (let y = 0; y < CH; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const b = pad[pidx(x, y, z)];
    const k = KIND[b];
    if (!k) continue;
    if (k === 4) { cross(cut, x, y, z, b); continue; }
    const buf = k === 1 ? solid : k === 2 ? cut : water;
    const glow = GLOW[b];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nb = get(x + F.n[0], y + F.n[1], z + F.n[2]);
      if (OPAQUE[nb]) continue;
      if (nb === b && k !== 1) continue;            // Glas an Glas, Wasser an Wasser
      if (k === 3 && KIND[nb] === 2) continue;     // Wasser an Glas/Laub
      const [u0, u1, v0, v1] = tileUV(FACE_TILE[b * 6 + f]);
      const base = buf.n;
      const ao = [];
      // Wasseroberfläche etwas tiefer
      const wTop = k === 3 && get(x, y + 1, z) !== b ? 0.875 : 1;
      for (let c = 0; c < 4; c++) {
        const [a, bb] = CORNERS[c];
        let px = x + F.o[0] + F.u[0] * a + F.v[0] * bb;
        let py = y + F.o[1] + F.u[1] * a + F.v[1] * bb;
        let pz = z + F.o[2] + F.u[2] * a + F.v[2] * bb;
        if (wTop < 1 && py > y) py = y + wTop;
        buf.pos.push(px, py, pz);
        buf.uv.push(a ? u1 : u0, bb ? v1 : v0);
        let l = 1;
        if (k !== 3 && !glow) {
          const lx = x + F.n[0], ly = y + F.n[1], lz = z + F.n[2];
          const su = a ? 1 : -1, sv = bb ? 1 : -1;
          const s1 = OPAQUE[get(lx + F.u[0] * su, ly + F.u[1] * su, lz + F.u[2] * su)];
          const s2 = OPAQUE[get(lx + F.v[0] * sv, ly + F.v[1] * sv, lz + F.v[2] * sv)];
          const cc = OPAQUE[get(lx + F.u[0] * su + F.v[0] * sv, ly + F.u[1] * su + F.v[1] * sv, lz + F.u[2] * su + F.v[2] * sv)];
          const lv = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
          ao.push(lv);
          l = AO[lv] * F.shade;
        } else { ao.push(3); l = glow ? 1 : F.shade; }
        buf.col.push(l, l, l);
      }
      buf.n += 4;
      if (ao[0] + ao[2] < ao[1] + ao[3]) buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return { s: solid.out(), c: cut.out(), w: water.out() };
}

function cross(buf, x, y, z, b) {
  const [u0, u1, v0, v1] = tileUV(FACE_TILE[b * 6]);
  const d = 0.15;
  const quads = [
    [[x + d, y, z + d], [x + 1 - d, y, z + 1 - d]],
    [[x + 1 - d, y, z + d], [x + d, y, z + 1 - d]],
  ];
  for (const [p, q] of quads) {
    const base = buf.n;
    buf.pos.push(p[0], y, p[2], q[0], y, q[2], q[0], y + 1, q[2], p[0], y + 1, p[2]);
    buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    for (let i = 0; i < 4; i++) buf.col.push(0.92, 0.92, 0.92);
    buf.n += 4;
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
