// Tüftelinsel – Hintergrund-Rechner: erzeugt Chunks und baut ihre Dreiecke, damit das Spiel flüssig bleibt
import { makeGen, CS, CH, idx, ckey } from './gen.js';
import { buildMesh, pidx } from './mesher.js';

let gen = null, wid = 0;
const data = new Map();     // ckey -> Uint8Array
let edits = new Map();      // ckey -> Map(index -> block)
const meshed = new Set();   // Chunks, die das Spiel gerade zeigt
const dirty = new Set();
let flushT = 0;

function getData(cx, cz) {
  const k = ckey(cx, cz);
  let d = data.get(k);
  if (!d) {
    d = gen.chunk(cx, cz);
    const e = edits.get(k);
    if (e) for (const [i, b] of e) d[i] = b;
    data.set(k, d);
  }
  return d;
}

function mesh(cx, cz) {
  const P = CS + 2;
  const pad = new Uint8Array(P * P * CH);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const d = getData(cx + dx, cz + dz);
    const xs = dx < 0 ? CS - 1 : 0, xe = dx > 0 ? 1 : CS;
    const zs = dz < 0 ? CS - 1 : 0, ze = dz > 0 ? 1 : CS;
    for (let y = 0; y < CH; y++) for (let z = zs; z < ze; z++) for (let x = xs; x < xe; x++) {
      pad[pidx(x + dx * CS, y, z + dz * CS)] = d[idx(x, y, z)];
    }
  }
  return buildMesh(pad);
}

const transfers = m => [m.s, m.c, m.w].flatMap(g => [g.pos.buffer, g.uv.buffer, g.col.buffer, g.idx.buffer]);

function setBlock(x, y, z, b) {
  const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
  const lx = x - cx * CS, lz = z - cz * CS;
  const k = ckey(cx, cz), i = idx(lx, y, lz);
  let e = edits.get(k); if (!e) edits.set(k, e = new Map());
  e.set(i, b);
  const d = data.get(k); if (d) d[i] = b;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (dx && !(dx < 0 ? lx === 0 : lx === CS - 1)) continue;
    if (dz && !(dz < 0 ? lz === 0 : lz === CS - 1)) continue;
    const kk = ckey(cx + dx, cz + dz);
    if (meshed.has(kk)) dirty.add(kk);
  }
  if (!flushT) flushT = setTimeout(flush, 0);
}

function flush() {
  flushT = 0;
  for (const k of dirty) {
    const [cx, cz] = k.split(',').map(Number);
    const m = mesh(cx, cz);
    postMessage({ t: 'mesh', wid, cx, cz, m }, transfers(m));
  }
  dirty.clear();
}

onmessage = e => {
  const m = e.data;
  switch (m.t) {
    case 'init':
      wid = m.wid; gen = makeGen(m.seed);
      data.clear(); meshed.clear(); dirty.clear();
      edits = new Map();
      for (const k in (m.edits || {})) { const a = m.edits[k], mp = new Map(); for (let i = 0; i < a.length; i += 2) mp.set(a[i], a[i + 1]); edits.set(k, mp); }
      break;
    case 'load': {
      if (m.wid !== wid || !gen) return;
      const k = ckey(m.cx, m.cz);
      const mm = mesh(m.cx, m.cz);
      meshed.add(k);
      const d = getData(m.cx, m.cz).slice();
      postMessage({ t: 'chunk', wid, cx: m.cx, cz: m.cz, data: d, m: mm }, [d.buffer, ...transfers(mm)]);
      break;
    }
    case 'unload': {
      if (m.wid !== wid) return;
      for (const k of m.keys) { meshed.delete(k); dirty.delete(k); }
      // Daten weit entfernter Chunks freigeben (werden bei Bedarf neu erzeugt)
      if (data.size > m.keep) {
        for (const k of [...data.keys()]) {
          if (meshed.has(k)) continue;
          const [cx, cz] = k.split(',').map(Number);
          let near = false;
          for (const mk of meshed) { const [mx, mz] = mk.split(',').map(Number); if (Math.abs(mx - cx) <= 1 && Math.abs(mz - cz) <= 1) { near = true; break; } }
          if (!near) data.delete(k);
        }
      }
      break;
    }
    case 'set':
      if (m.wid !== wid) return;
      for (let i = 0; i < m.list.length; i += 4) setBlock(m.list[i], m.list[i + 1], m.list[i + 2], m.list[i + 3]);
      break;
  }
};
