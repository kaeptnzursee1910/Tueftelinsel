// Tüftelinsel – Welten auf diesem Gerät speichern (IndexedDB), als Datei exportieren und wieder laden
const DB = 'tueftelinsel', ST = 'welten';
let dbp = null;
const mem = new Map(); // Ersatz, falls der Browser keine Datenbank erlaubt (z. B. privates Fenster)

function db() {
  if (dbp) return dbp;
  dbp = new Promise(res => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    } catch (_) { res(null); }
  });
  return dbp;
}

function req(mode, fn) {
  return db().then(d => new Promise(res => {
    if (!d) { res(fn(null)); return; }
    try {
      const tx = d.transaction(ST, mode), st = tx.objectStore(ST);
      const r = fn(st);
      if (r && 'onsuccess' in r) { r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
      else tx.oncomplete = () => res(r);
    } catch (e) { console.warn(e); res(null); }
  }));
}

export const Store = {
  async list() {
    const all = await req('readonly', st => st ? st.getAll() : [...mem.values()]);
    return (all || []).map(w => ({ id: w.id, name: w.name, seed: w.seed, played: w.played, created: w.created, edits: w.count || 0 }))
      .sort((a, b) => (b.played || 0) - (a.played || 0));
  },
  get(id) { return req('readonly', st => st ? st.get(id) : mem.get(id) || null); },
  put(w) { w.count = Object.values(w.edits || {}).reduce((n, a) => n + a.length / 2, 0); return req('readwrite', st => { if (st) return st.put(w); mem.set(w.id, w); return true; }); },
  del(id) { return req('readwrite', st => { if (st) return st.delete(id); mem.delete(id); return true; }); },

  newWorld(name, seed) {
    const id = 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    return { id, name: name || 'Neue Insel', seed: seed || String(Math.floor(Math.random() * 1e9)), created: Date.now(), played: Date.now(), edits: {}, spawn: null, me: null };
  },

  exportWorld(w) {
    const data = JSON.stringify({ format: 'tueftelinsel-welt', v: 1, name: w.name, seed: w.seed, created: w.created, edits: w.edits, spawn: w.spawn, me: w.me });
    const blob = new Blob([data], { type: 'application/json' });
    const fname = (w.name || 'insel').replace(/[^\wäöüÄÖÜß -]+/g, '').trim().replace(/\s+/g, '-') + '.tueftelinsel.json';
    const file = typeof File === 'function' ? new File([blob], fname, { type: 'application/json' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: w.name }).catch(() => { }); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },

  async importFile(file) {
    const text = await file.text();
    const o = JSON.parse(text);
    if (!o || o.format !== 'tueftelinsel-welt' || !o.seed) throw new Error('Das ist keine Tüftelinsel-Welt.');
    const w = this.newWorld(String(o.name || 'Importierte Insel').slice(0, 30), String(o.seed));
    w.edits = o.edits && typeof o.edits === 'object' ? o.edits : {};
    w.spawn = Array.isArray(o.spawn) ? o.spawn : null;
    w.me = o.me || null;
    await this.put(w);
    return w;
  },
};
