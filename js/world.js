// Tüftelinsel – die Spielwelt: Physik (Rapier) und Grafik (Three.js) der Bauteile und Verbindungen.
// Der Gastgeber rechnet die echte Physik. Bei Gästen sind alle Teile "kinematisch" und folgen den Paketen.
import * as THREE from '../lib/three.module.min.js';
import { R } from './rapier.js';
import { PARTS, colliderDescs, partMesh, toon } from './parts.js';
import { buildMap, WATER } from './map.js';

export const GRAV = 14;
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const Q = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
const arr3 = v => [v.x, v.y, v.z];
const arr4 = q => [q.x, q.y, q.z, q.w];
const r2 = x => Math.round(x * 100) / 100;
const r3 = x => Math.round(x * 1000) / 1000;
const rv = v => ({ x: v[0], y: v[1], z: v[2] });
const rq = q => ({ x: q[0], y: q[1], z: q[2], w: q[3] });

export const JOINT_NAMES = { weld: 'Schweißnaht', hinge: 'Scharnier', wheel: 'Radachse', rope: 'Seil', spring: 'Feder' };

export class World {
  constructor(scene, host) {
    this.scene = scene;
    this.host = host;
    this.pw = new R.World({ x: 0, y: -GRAV, z: 0 });
    this.pw.timestep = 1 / 60;
    const m = buildMap(scene, this.pw);
    this.ground = m.ground; this.water = m.water; this.statics = m.statics;
    this.parts = new Map();
    this.joints = new Map();
    this.byCollider = new Map();     // Collider-Nummer -> Teil
    this.avatarColliders = new Set();
    this.nextId = 1;
    this.events = [];                // nur Gastgeber: Änderungen für die Gäste
    this.undo = new Map();           // Spieler -> Liste seiner Aktionen
    this.grabs = new Map();          // Spieler -> {id, lp, target, tq}
    this.drivers = new Map();        // Spieler -> {seat, x, y, th}
    this.limit = 40; this.total = 150;
    this.jg = new THREE.Group(); scene.add(this.jg);
    this._t = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.time = 0;
  }

  emit(e) { if (this.host) this.events.push(e); }

  // ---------- Teile ----------
  addPart(rec) {
    if (this.parts.has(rec.id)) this.removePart(rec.id, true);
    const d = PARTS[rec.type]; if (!d) return null;
    const desc = this.host ? (rec.frozen ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic()) : R.RigidBodyDesc.kinematicPositionBased();
    desc.setTranslation(rec.p[0], rec.p[1], rec.p[2]).setRotation(rq(rec.q)).setLinearDamping(0.05).setAngularDamping(0.25);
    if (rec.type === 'balloon') desc.setLinearDamping(0.9).setAngularDamping(1.5);
    if (rec.type === 'ball' || rec.type === 'wheel') desc.setCcdEnabled(true);
    const body = this.pw.createRigidBody(desc);
    const part = { id: rec.id, type: rec.type, owner: rec.owner || 0, sq: rec.sq || null, frozen: !!rec.frozen, on: !!rec.on, body, colliders: [], tp: rec.p.slice(), tq: rec.q.slice(), sentSleep: false };
    for (const cd of colliderDescs(rec.type, rec.sq)) {
      const c = this.pw.createCollider(cd, body);
      part.colliders.push(c);
      this.byCollider.set(c.handle, part);
    }
    part.mesh = partMesh(rec.type, rec.sq);
    part.mesh.position.set(rec.p[0], rec.p[1], rec.p[2]);
    part.mesh.quaternion.set(rec.q[0], rec.q[1], rec.q[2], rec.q[3]);
    part.flame = part.mesh.getObjectByName('flame') || null;
    this.scene.add(part.mesh);
    this.parts.set(rec.id, part);
    this.nextId = Math.max(this.nextId, rec.id + 1);
    this.emit({ e: 'add', r: this.partRec(part) });
    return part;
  }

  partRec(p) {
    const t = p.body.translation(), q = p.body.rotation();
    return { id: p.id, type: p.type, owner: p.owner, sq: p.sq, frozen: p.frozen, on: p.on, p: [r2(t.x), r2(t.y), r2(t.z)], q: [r3(q.x), r3(q.y), r3(q.z), r3(q.w)] };
  }

  removePart(id, quiet) {
    const p = this.parts.get(id); if (!p) return;
    for (const j of [...this.joints.values()]) if (j.a === id || j.b === id) this.removeJoint(j.id, true);
    for (const c of p.colliders) this.byCollider.delete(c.handle);
    this.pw.removeRigidBody(p.body);
    this.scene.remove(p.mesh);
    this.parts.delete(id);
    for (const [pid, g] of this.grabs) if (g.id === id) this.grabs.delete(pid);
    if (!quiet || this.host) this.emit({ e: 'rm', id });
  }

  setFrozen(id, v) {
    const p = this.parts.get(id); if (!p || p.frozen === v) return;
    p.frozen = v;
    if (this.host) {
      p.body.setBodyType(v ? R.RigidBodyType.Fixed : R.RigidBodyType.Dynamic, true);
      if (!v) p.body.wakeUp();
      const r = this.partRec(p);
      this.emit({ e: 'fz', id, v, p: r.p, q: r.q });
    }
    this.flash(p, v ? 0x9fe7ff : 0xffffff);
  }

  setOn(id, v) {
    const p = this.parts.get(id); if (!p) return;
    p.on = v; this.emit({ e: 'on', id, v });
  }

  flash(p, color) {
    p.mesh.traverse(o => { if (o.isMesh && o.material && o.material.emissive) { o.material = o.material.clone(); o.material.emissive.setHex(color === 0xffffff ? 0 : color); o.material.emissiveIntensity = 0.35; } });
  }

  // Weltpunkt -> Punkt im Teil (0 = Boden/Welt)
  toLocal(id, w) {
    if (!id) return w.slice();
    const p = this.parts.get(id); const t = p.body.translation(), q = p.body.rotation();
    const v = V(w).sub(this._t.set(t.x, t.y, t.z)).applyQuaternion(this._q.set(q.x, q.y, q.z, q.w).invert());
    return arr3(v);
  }
  toWorld(id, l, out) {
    out = out || new THREE.Vector3();
    if (!id) return out.set(l[0], l[1], l[2]);
    const p = this.parts.get(id); if (!p) return out.set(l[0], l[1], l[2]);
    const t = p.mesh.position, q = p.mesh.quaternion;
    return out.set(l[0], l[1], l[2]).applyQuaternion(q).add(t);
  }
  bodyOf(id) { return id ? this.parts.get(id).body : this.ground; }
  rotOf(id) { if (!id) return new THREE.Quaternion(); const q = this.parts.get(id).body.rotation(); return new THREE.Quaternion(q.x, q.y, q.z, q.w); }

  // ---------- Verbindungen ----------
  addJoint(rec) {
    if (this.joints.has(rec.id)) return;
    if ((rec.a && !this.parts.has(rec.a)) || (rec.b && !this.parts.has(rec.b))) return;
    const j = Object.assign({}, rec, { rj: [] });
    if (this.host) {
      const b1 = this.bodyOf(rec.a), b2 = this.bodyOf(rec.b);
      const mk = (data, contacts) => { const x = this.pw.createImpulseJoint(data, b1, b2, true); x.setContactsEnabled(!!contacts); j.rj.push(x); return x; };
      switch (rec.kind) {
        case 'weld': mk(R.JointData.fixed(rv(rec.la), rq(rec.fa), rv(rec.lb), rq(rec.fb))); break;
        case 'hinge': mk(R.JointData.spherical(rv(rec.la), rv(rec.lb))); mk(R.JointData.spherical(rv(rec.la2), rv(rec.lb2))); break;
        case 'wheel': mk(R.JointData.revolute(rv(rec.la), rv(rec.lb), rv(rec.axis))); break;
        case 'rope': mk(R.JointData.rope(rec.len, rv(rec.la), rv(rec.lb)), true); break;
        case 'spring': mk(R.JointData.spring(rec.len, rec.k || 30, rec.damp || 2.5, rv(rec.la), rv(rec.lb)), true); break;
      }
      for (const id of [rec.a, rec.b]) if (id) this.parts.get(id).body.wakeUp();
    }
    if (rec.kind === 'rope' || rec.kind === 'spring') {
      const geo = new THREE.CylinderGeometry(rec.kind === 'rope' ? 0.04 : 0.07, rec.kind === 'rope' ? 0.04 : 0.07, 1, 6);
      geo.translate(0, 0.5, 0);
      j.vis = new THREE.Mesh(geo, toon(rec.kind === 'rope' ? 0xf4e3c1 : 0x6fc3df));
      if (rec.kind === 'spring') { // Windungen
        for (let i = 1; i < 10; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 4, 10), toon(0x3d7fa8)); ring.rotation.x = Math.PI / 2; ring.position.y = i / 10; j.vis.add(ring); }
      }
      this.jg.add(j.vis);
    } else if (rec.kind === 'hinge' || rec.kind === 'weld') {
      j.vis = new THREE.Mesh(new THREE.SphereGeometry(rec.kind === 'hinge' ? 0.09 : 0.06, 8, 6), toon(rec.kind === 'hinge' ? 0xf2c94c : 0xff8a3c));
      this.jg.add(j.vis);
    }
    this.joints.set(rec.id, j);
    this.nextId = Math.max(this.nextId, rec.id + 1);
    const { rj, vis, ...pub } = j;
    this.emit({ e: 'j', r: pub });
    return j;
  }

  removeJoint(id, quiet) {
    const j = this.joints.get(id); if (!j) return;
    for (const x of j.rj) { try { this.pw.removeImpulseJoint(x, true); } catch (_) { } }
    if (j.vis) { this.jg.remove(j.vis); }
    this.joints.delete(id);
    this.emit({ e: 'rmj', id });
  }

  jointRecs() { return [...this.joints.values()].map(({ rj, vis, ...pub }) => pub); }

  // Alle Teile, die über Verbindungen zusammenhängen
  assembly(id) {
    const seen = new Set([id]), list = [id];
    for (let i = 0; i < list.length; i++) {
      for (const j of this.joints.values()) {
        if (j.kind === 'rope' || j.kind === 'spring') continue;
        const o = j.a === list[i] ? j.b : j.b === list[i] ? j.a : 0;
        if (o && !seen.has(o)) { seen.add(o); list.push(o); }
      }
    }
    return seen;
  }

  // ---------- Befehle (nur Gastgeber) ----------
  newId() { return this.nextId++; }
  pushUndo(pid, k, id) { if (!this.undo.has(pid)) this.undo.set(pid, []); const u = this.undo.get(pid); u.push([k, id]); if (u.length > 200) u.shift(); }
  countOf(pid) { let n = 0; for (const p of this.parts.values()) if (p.owner === pid) n++; return n; }
  canSpawn(pid, n) {
    if (this.parts.size + (n || 1) > this.total) return 'Die Insel ist voll (' + this.total + ' Teile). Lösche zuerst etwas.';
    if (this.countOf(pid) + (n || 1) > this.limit) return 'Du hast dein Limit von ' + this.limit + ' Teilen erreicht.';
    return null;
  }

  exec(c, pid) {
    const P = id => this.parts.get(id);
    switch (c.c) {
      case 'spawn': {
        if (!PARTS[c.type]) return;
        const err = this.canSpawn(pid); if (err) return err;
        const id = this.newId();
        this.addPart({ id, type: c.type, owner: pid, p: c.p, q: c.q });
        this.pushUndo(pid, 'p', id);
        return;
      }
      case 'rm': if (P(c.id)) this.removePart(c.id); return;
      case 'unjoin': for (const j of [...this.joints.values()]) if (j.a === c.id || j.b === c.id) this.removeJoint(j.id); return;
      case 'freeze': this.setFrozen(c.id, !!c.v); return;
      case 'grab': if (P(c.id)) { this.setFrozen(c.id, false); P(c.id).body.wakeUp(); } return;
      case 'use': {
        const p = P(c.id); if (!p) return;
        if (p.type === 'thruster') { this.setOn(p.id, !p.on); this.setFrozen(p.id, false); for (const id of this.assembly(p.id)) P(id) && P(id).body.wakeUp(); }
        return;
      }
      case 'joint': return this.makeJoint(c, pid);
      case 'wheel': return this.makeWheel(c, pid);
      case 'thruster': return this.makeThruster(c, pid);
      case 'balloon': return this.makeBalloon(c, pid);
      case 'undo': {
        const u = this.undo.get(pid) || [];
        while (u.length) {
          const [k, id] = u.pop();
          if (k === 'p' && P(id)) { this.removePart(id); return; }
          if (k === 'j' && this.joints.has(id)) { this.removeJoint(id); return; }
        }
        return 'Nichts zum Rückgängigmachen.';
      }
      case 'clear': {
        for (const id of [...this.parts.keys()]) if ((c.all && pid === 0) || this.parts.get(id).owner === pid) this.removePart(id);
        return;
      }
    }
  }

  makeJoint(c, pid) {
    const { kind, a, b } = c;
    if (a === b) return 'Wähle zwei verschiedene Teile.';
    if ((a && !this.parts.has(a)) || (b && !this.parts.has(b))) return;
    if (!a && !b) return;
    const pa = c.pa, pb = c.pb;
    const rec = { id: this.newId(), kind, a, b, owner: pid };
    if (kind === 'weld') {
      const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
      rec.la = this.toLocal(a, mid); rec.lb = this.toLocal(b, mid);
      rec.fa = arr4(this.rotOf(a).invert()); rec.fb = arr4(this.rotOf(b).invert());
    } else if (kind === 'hinge') {
      const n = V(c.n).normalize();
      const w1 = V(pa).addScaledVector(n, 0.25), w2 = V(pa).addScaledVector(n, -0.25);
      rec.la = this.toLocal(a, arr3(w1)); rec.lb = this.toLocal(b, arr3(w1));
      rec.la2 = this.toLocal(a, arr3(w2)); rec.lb2 = this.toLocal(b, arr3(w2));
    } else if (kind === 'rope' || kind === 'spring') {
      rec.la = this.toLocal(a, pa); rec.lb = this.toLocal(b, pb);
      rec.len = Math.max(0.3, V(pa).distanceTo(V(pb)) * (kind === 'rope' ? 1.02 : 1));
      if (kind === 'spring') {
        const m = (a ? this.parts.get(a).body.mass() : 0) + (b ? this.parts.get(b).body.mass() : 0);
        rec.k = Math.max(15, m * 40); rec.damp = Math.max(1, m * 3);
      }
    } else return;
    this.addJoint(rec);
    this.pushUndo(pid, 'j', rec.id);
  }

  // Rad an eine Fläche: das Rad bekommt dieselbe Grunddrehung wie das Teil, die Form wird zur Achse gedreht
  makeWheel(c, pid) {
    const a = c.a; if (!a || !this.parts.has(a)) return 'Räder kann man nur an Bauteile setzen.';
    const err = this.canSpawn(pid); if (err) return err;
    const n = V(c.n).normalize();
    const qa = this.rotOf(a);
    const axisL = n.clone().applyQuaternion(qa.clone().invert()).normalize();
    const sq = arr4(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), axisL));
    const center = V(c.p).addScaledVector(n, PARTS.wheel.h / 2 + 0.1);
    const id = this.newId();
    this.addPart({ id, type: 'wheel', owner: pid, p: arr3(center), q: arr4(qa), sq });
    const rec = { id: this.newId(), kind: 'wheel', a, b: id, owner: pid, la: this.toLocal(a, arr3(center)), lb: [0, 0, 0], axis: arr3(axisL) };
    this.addJoint(rec);
    this.pushUndo(pid, 'p', id);
  }

  makeThruster(c, pid) {
    const err = this.canSpawn(pid); if (err) return err;
    const n = V(c.n).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().negate());
    const center = V(c.p).addScaledVector(n, PARTS.thruster.h / 2 + 0.03);
    const id = this.newId();
    this.addPart({ id, type: 'thruster', owner: pid, p: arr3(center), q: arr4(q) });
    if (c.a && this.parts.has(c.a)) {
      this.makeJoint({ kind: 'weld', a: c.a, b: id, pa: c.p, pb: c.p }, pid);
      (this.undo.get(pid) || []).pop();
    } else this.setFrozen(id, false);
    this.pushUndo(pid, 'p', id);
  }

  makeBalloon(c, pid) {
    const err = this.canSpawn(pid); if (err) return err;
    const r = PARTS.balloon.r;
    const top = V(c.p).add(new THREE.Vector3(0, 3 + r, 0));
    const id = this.newId();
    this.addPart({ id, type: 'balloon', owner: pid, p: arr3(top), q: [0, 0, 0, 1] });
    const rec = { id: this.newId(), kind: 'rope', a: c.a || 0, b: id, owner: pid, la: this.toLocal(c.a || 0, c.p), lb: [0, -r, 0], len: 3 };
    this.addJoint(rec);
    this.pushUndo(pid, 'p', id);
  }

  // ---------- Simulation ----------
  step(dt) {
    this.time += dt;
    if (this.host) this.hostForces(dt);
    this.pw.step();
  }

  hostForces(dt) {
    const tmp = this._t, q = this._q;
    // Fahrer: Räder antreiben, Düsen zünden
    const wheelDrive = new Map(), thrustOn = new Set();
    for (const [pid, d] of this.drivers) {
      const seat = this.parts.get(d.seat); if (!seat) continue;
      const asm = this.assembly(seat.id);
      const sq = seat.body.rotation(); q.set(sq.x, sq.y, sq.z, sq.w);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      const spin = right.clone().negate();
      const st = seat.body.translation(); const sp = new THREE.Vector3(st.x, st.y, st.z);
      for (const j of this.joints.values()) {
        if (j.kind !== 'wheel' || !asm.has(j.a)) continue;
        const w = this.parts.get(j.b); if (!w) continue;
        const pr = this.parts.get(j.a).body.rotation();
        const axisW = V(j.axis).applyQuaternion(new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w));
        const dir = axisW.dot(spin);
        if (Math.abs(dir) < 0.3) continue;
        const wt = w.body.translation();
        const side = Math.sign(new THREE.Vector3(wt.x, wt.y, wt.z).sub(sp).dot(right)) || 0;
        const speed = d.y * 16 - side * d.x * 10;
        wheelDrive.set(j.id, Math.sign(dir) * speed);
      }
      if (d.th) for (const id of asm) { const p = this.parts.get(id); if (p && p.type === 'thruster') thrustOn.add(id); }
      for (const id of asm) { const p = this.parts.get(id); if (p && !p.frozen) p.body.wakeUp(); }
    }
    for (const j of this.joints.values()) {
      if (j.kind !== 'wheel') continue;
      const v = wheelDrive.get(j.id);
      const want = v === undefined ? null : v;
      if (want === j._motor) continue;
      j._motor = want;
      if (want === null) j.rj[0].configureMotorVelocity(0, 0);
      else j.rj[0].configureMotorVelocity(want, want === 0 ? 8 : 25);
    }
    // Greifstrahlen
    for (const [pid, g] of this.grabs) {
      const p = this.parts.get(g.id); if (!p || p.frozen || !g.target) continue;
      const t = p.body.translation(), r = p.body.rotation();
      const tq = Q(g.tq);
      const want = V(g.target).sub(V(g.lp).applyQuaternion(tq));
      const lin = want.sub(tmp.set(t.x, t.y, t.z)).multiplyScalar(14);
      if (lin.length() > 45) lin.setLength(45);
      p.body.setLinvel({ x: lin.x, y: lin.y, z: lin.z }, true);
      const cur = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const dq = tq.clone().multiply(cur.invert());
      if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
      dq.normalize();
      const cw = Math.min(1, dq.w), ang = 2 * Math.acos(cw), s = Math.sqrt(Math.max(0, 1 - cw * cw));
      const av = s < 1e-4 ? new THREE.Vector3() : new THREE.Vector3(dq.x / s, dq.y / s, dq.z / s).multiplyScalar(ang * 10);
      if (av.length() > 20) av.setLength(20);
      p.body.setAngvel({ x: av.x, y: av.y, z: av.z }, true);
    }
    // Düsen, Ballons, Wasser
    for (const p of this.parts.values()) {
      if (p.frozen) continue;
      const b = p.body;
      const d = PARTS[p.type];
      const fire = p.type === 'thruster' && (p.on || thrustOn.has(p.id));
      p.fire = fire;
      if (fire) {
        const r = b.rotation(); const dir = tmp.set(0, 1, 0).applyQuaternion(q.set(r.x, r.y, r.z, r.w)).multiplyScalar(32 * dt);
        b.applyImpulse({ x: dir.x, y: dir.y, z: dir.z }, true);
      }
      if (d.lift) b.applyImpulse({ x: 0, y: d.lift * dt, z: 0 }, true);
      if (b.isSleeping()) continue;
      const t = b.translation();
      if (t.y < WATER + 0.4) {
        const depth = Math.min(1, (WATER + 0.4 - t.y) / 0.8);
        const m = b.mass();
        b.applyImpulse({ x: 0, y: m * GRAV * d.float * depth * dt, z: 0 }, true);
        const v = b.linvel(); const k = Math.max(0, 1 - 1.6 * dt * depth);
        b.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
        const w = b.angvel(); b.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
      }
      if (t.y < -40) this.removePart(p.id);
    }
  }

  // ---------- Netz ----------
  snapshot() {
    const out = [];
    for (const p of this.parts.values()) {
      if (p.frozen) continue;
      const sl = p.body.isSleeping();
      if (sl && p.sentSleep) continue;
      p.sentSleep = sl;
      const t = p.body.translation(), q = p.body.rotation();
      out.push(p.id, r2(t.x), r2(t.y), r2(t.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), p.fire ? 1 : 0);
    }
    return out;
  }

  applySnapshot(s) {
    for (let i = 0; i < s.length; i += 9) {
      const p = this.parts.get(s[i]); if (!p) continue;
      p.tp = [s[i + 1], s[i + 2], s[i + 3]];
      p.tq = [s[i + 4], s[i + 5], s[i + 6], s[i + 7]];
      p.fire = !!s[i + 8];
    }
  }

  applyEvent(e) {
    switch (e.e) {
      case 'add': this.addPart(e.r); break;
      case 'rm': this.removePart(e.id); break;
      case 'j': this.addJoint(e.r); break;
      case 'rmj': this.removeJoint(e.id); break;
      case 'fz': { const p = this.parts.get(e.id); if (p) { p.tp = e.p; p.tq = e.q; this.setFrozen(e.id, e.v); } break; }
      case 'on': this.setOn(e.id, e.v); break;
    }
  }

  fullState() { return { parts: [...this.parts.values()].map(p => this.partRec(p)), joints: this.jointRecs(), nextId: this.nextId }; }
  loadState(s) {
    for (const r of s.parts) this.addPart(r);
    for (const j of s.joints) this.addJoint(j);
    this.nextId = s.nextId || this.nextId;
  }

  // Grafik nachführen. held: Teil, das ich selbst gerade halte (beim Gast sofort vorhersagen)
  sync(dt, held) {
    const k = Math.min(1, dt * 16);
    for (const p of this.parts.values()) {
      if (this.host) {
        const t = p.body.translation(), q = p.body.rotation();
        p.mesh.position.set(t.x, t.y, t.z); p.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      } else {
        if (held && held.id === p.id && held.want) {
          p.mesh.position.lerp(held.want.p, Math.min(1, dt * 25)); p.mesh.quaternion.slerp(held.want.q, Math.min(1, dt * 25));
        } else {
          p.mesh.position.lerp(this._t.set(p.tp[0], p.tp[1], p.tp[2]), k);
          p.mesh.quaternion.slerp(this._q.set(p.tq[0], p.tq[1], p.tq[2], p.tq[3]), k);
        }
        const m = p.mesh;
        p.body.setNextKinematicTranslation({ x: m.position.x, y: m.position.y, z: m.position.z });
        p.body.setNextKinematicRotation({ x: m.quaternion.x, y: m.quaternion.y, z: m.quaternion.z, w: m.quaternion.w });
      }
      if (p.flame) {
        p.flame.visible = !!p.fire;
        if (p.fire) p.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
      }
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const j of this.joints.values()) {
      if (!j.vis) continue;
      if (j.kind === 'weld' || j.kind === 'hinge') { this.toWorld(j.a || j.b, j.a ? j.la : j.lb, j.vis.position); continue; }
      this.toWorld(j.a, j.la, a); this.toWorld(j.b, j.lb, b);
      const len = a.distanceTo(b);
      j.vis.position.copy(a);
      j.vis.scale.set(1, Math.max(0.01, len), 1);
      if (len > 1e-4) j.vis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).divideScalar(len));
    }
  }

  // Strahl aus der Kamera: was liegt im Visier?
  raycast(origin, dir, max, ignoreBody) {
    const ray = new R.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.pw.castRayAndGetNormal(ray, max, true, undefined, undefined, undefined, ignoreBody || undefined, c => !this.avatarColliders.has(c.handle));
    if (!hit) return null;
    const part = this.byCollider.get(hit.collider.handle) || null;
    const point = new THREE.Vector3(origin.x + dir.x * hit.timeOfImpact, origin.y + dir.y * hit.timeOfImpact, origin.z + dir.z * hit.timeOfImpact);
    return { part, id: part ? part.id : 0, point, normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z), dist: hit.timeOfImpact };
  }

  dispose() {
    for (const p of this.parts.values()) this.scene.remove(p.mesh);
    this.scene.remove(this.jg); this.scene.remove(this.statics);
    this.pw.free();
  }
}
