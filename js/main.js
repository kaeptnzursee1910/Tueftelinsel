// Tüftelinsel – Start, Spielschleife, Werkzeuge, Steuerung und Mehrspieler-Ablauf
import * as THREE from '../lib/three.module.min.js';
import { initPhysics } from './rapier.js';
import { World } from './world.js';
import { PARTS, SPAWN_ORDER, partHalfHeight } from './parts.js';
import { Me, Others, COLORS } from './player.js';
import { Net } from './net.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const $ = id => document.getElementById(id);
const arr3 = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
const arr4 = q => [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)];
const UP = new THREE.Vector3(0, 1, 0);

export const TOOLS = [
  { k: 'grab', icon: '✋', name: 'Greifstrahl', hint: 'Teil packen und bewegen. ❄️ friert es in der Luft fest.', alt: 'Einfrieren' },
  { k: 'weld', icon: '🔥', name: 'Schweißgerät', hint: 'Erst ein Teil, dann ein zweites (oder den Boden) antippen.', two: true, alt: 'Abbrechen' },
  { k: 'hinge', icon: '🚪', name: 'Scharnier', hint: 'Achse zeigt aus der ersten Fläche heraus. Dann das zweite Teil.', two: true, alt: 'Abbrechen' },
  { k: 'rope', icon: '🪢', name: 'Seil', hint: 'Anfang und Ende des Seils antippen.', two: true, alt: 'Abbrechen' },
  { k: 'spring', icon: '🌀', name: 'Feder', hint: 'Anfang und Ende der Feder antippen.', two: true, alt: 'Abbrechen' },
  { k: 'wheel', icon: '⚙️', name: 'Rad', hint: 'Auf die Seite eines Teils tippen. Ein Fahrersitz treibt die Räder an.', alt: '' },
  { k: 'thruster', icon: '🚀', name: 'Schubdüse', hint: 'Auf eine Fläche tippen. 👆 Benutzen schaltet sie an und aus.', alt: '' },
  { k: 'balloon', icon: '🎈', name: 'Ballon', hint: 'Ein Teil antippen: Ein Ballon zieht es am Seil nach oben.', alt: '' },
  { k: 'eraser', icon: '🧽', name: 'Radierer', hint: 'Teil antippen zum Löschen. Zweite Taste: nur Verbindungen lösen.', alt: 'Lösen' },
];

export const Game = {
  settings: { name: '', sound: true },
  S: null,            // Sitzung: {mode, phase, players, settings, chat, code}
  world: null, me: null, others: null,
  playing: false,
  tool: 'grab', first: null, hold: null, rotMode: false,
  input: { keys: new Set(), mx: 0, my: 0, jump: false, lookDX: 0, lookDY: 0 },
  touch: false,

  async boot() {
    this.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    document.body.classList.toggle('touch', this.touch);
    try { this.settings = Object.assign(this.settings, JSON.parse(localStorage.getItem('tf_settings') || '{}')); } catch (_) { }
    Audio.on = this.settings.sound;
    await initPhysics();
    this.renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0x9fd8ff, 90, 280);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.08, 700);
    this.scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6a8a55, 1.25));
    const sun = this.sun = new THREE.DirectionalLight(0xfff2d6, 1.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 200;
    sun.shadow.bias = -0.0008;
    this.scene.add(sun, sun.target);
    // Sonne als Kugel
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
    sunBall.position.set(-260, 260, -300); this.scene.add(sunBall);
    this.marker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd23c, depthTest: false }));
    this.marker.renderOrder = 5; this.marker.visible = false; this.scene.add(this.marker);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0.75 }));
    this.beam.visible = false; this.scene.add(this.beam);

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Net.isHost && Net.peer) Net.keepAlive(Net.peer); });
    this.resize();
    this.setupInput();
    this.buildToolbar();
    this.buildSpawnMenu();
    Net.onMsg = (m, from) => this.netMsg(m, from);
    Net.onDrop = id => this.netDrop(id);
    this.newWorld(true);
    this.demoParts();
    $('loading').hidden = true;

    // Einladungslink ?r=1234 (#k=… trägt die Zugangsdaten des Verbindungsservers)
    const inv = (new URLSearchParams(location.search).get('r') || '').replace(/\D/g, '').slice(0, 4);
    const km = /[#&]k=([A-Za-z0-9+/]+)/.exec(location.hash);
    if (km) { try { const [u, p] = JSON.parse(decodeURIComponent(escape(atob(km[1])))); if (u && p) Net.setKey(String(u), String(p)); } catch (_) { } }
    if (inv.length === 4 || km) history.replaceState(null, '', location.pathname);
    UI.main();
    if (inv.length === 4) UI.multi(inv);

    let last = performance.now(), acc = 0, netT = 0;
    const frame = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      acc += dt;
      let n = 0;
      while (acc >= 1 / 60 && n < 4) { this.fixed(1 / 60); acc -= 1 / 60; n++; }
      if (n === 4) acc = 0;
      this.frame(dt);
      netT += dt;
      if (netT >= 0.05) { netT = 0; this.netTick(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  saveSettings() { try { localStorage.setItem('tf_settings', JSON.stringify(this.settings)); } catch (_) { } },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  },

  newWorld(host) {
    if (this.world) { if (this.others) for (const id of [...this.others.map.keys()]) this.others.remove(id); this.world.dispose(); }
    this.world = new World(this.scene, host);
    this.others = new Others(this.world, this.scene);
    this.me = null;
  },

  // Ein paar Teile für den Hintergrund des Hauptmenüs
  demoParts() {
    const w = this.world;
    let id = 1;
    const add = (type, p, q) => w.addPart({ id: id++, type, p, q: q || [0, 0, 0, 1], owner: -1 });
    for (let i = 0; i < 5; i++) for (let k = 0; k < 4 - i % 2; k++) add('box', [-6 + k * 1.05 + (i % 2) * 0.5, 3 + i * 1.02, -8]);
    for (let i = 0; i < 12; i++) add('domino', [4 + i * 0.9, 3.4, -4], [0, Math.sin(-0.3), 0, Math.cos(-0.3)]);
    add('ball', [8, 6, -10]); add('barrel', [-2, 4, -3]); add('ramp', [0, 3.6, -14]);
    w.events.length = 0;
    this.demoT = 0;
  },

  // ---------- Sitzung starten ----------
  startSolo() {
    this.S = { mode: 'solo', phase: 'play', players: [{ id: 0, name: this.settings.name || 'Ich', color: 0 }], settings: { max: 1, limit: 150 }, chat: [] };
    this.myId = 0;
    this.enterWorld(true, null);
  },

  enterWorld(host, state) {
    UI.close();
    this.newWorld(host);
    const w = this.world;
    w.limit = this.S.settings.limit; w.total = this.S.mode === 'solo' ? 150 : 160;
    if (state) w.loadState(state);
    this.me = new Me(w, this.scene);
    for (const p of this.S.players) if (p.id !== this.myId) this.others.ensure(p);
    this.playing = true;
    this.hold = null; this.first = null; this.marker.visible = false;
    $('hud').hidden = false;
    this.selectTool('grab');
    this.updateCount();
    if (!this.settings.seenHelp) { this.settings.seenHelp = true; this.saveSettings(); UI.help(true); }
  },

  leave() {
    Net.close();
    this.playing = false; this.S = null;
    $('hud').hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.newWorld(true);
    this.demoParts();
    UI.main();
  },

  isHost() { return !this.S || this.S.mode !== 'guest'; },
  player(id) { return this.S && this.S.players.find(p => p.id === id); },

  // ---------- Befehle ----------
  cmd(c) {
    if (!this.playing) return;
    if (this.isHost()) { const err = this.world.exec(c, this.myId); if (err) this.say(err, true); }
    else Net.send({ t: 'cmd', c });
    setTimeout(() => this.updateCount(), 150);
  },

  updateCount() {
    if (!this.playing) return;
    const n = this.world.countOf(this.myId);
    $('count').textContent = 'Teile: ' + n + ' / ' + this.world.limit;
  },

  say(text, bad, who) {
    const d = document.createElement('div');
    if (who) { const b = document.createElement('b'); b.textContent = who.name + ':'; b.style.color = '#' + COLORS[who.color % COLORS.length].toString(16).padStart(6, '0'); d.appendChild(b); }
    d.appendChild(document.createTextNode(text));
    if (bad) d.style.color = '#ffb3a8';
    $('msgs').appendChild(d);
    while ($('msgs').children.length > 5) $('msgs').firstChild.remove();
    setTimeout(() => d.remove(), 6200);
    if (bad) Audio.error();
  },

  // ---------- Werkzeuge ----------
  buildToolbar() {
    const bar = $('tools');
    TOOLS.forEach((t, i) => {
      const b = document.createElement('button');
      b.innerHTML = t.icon + '<small>' + (i + 1) + '</small>'; b.title = t.name; b.dataset.tool = t.k;
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.selectTool(t.k); });
      bar.appendChild(b);
    });
  },

  selectTool(k) {
    if (this.hold) this.release();
    this.tool = k; this.first = null; this.marker.visible = false; this.rotMode = false;
    const t = TOOLS.find(x => x.k === k);
    for (const b of $('tools').children) b.classList.toggle('on', b.dataset.tool === k);
    $('toolname').textContent = t.icon + ' ' + t.name;
    $('toolhint').textContent = t.hint;
    $('bAct').querySelector('span').textContent = t.icon;
    this.updateAltLabel();
  },

  updateAltLabel() {
    const t = TOOLS.find(x => x.k === this.tool);
    const alt = $('bAlt');
    let label = t.alt, icon = '❄️';
    if (this.tool === 'grab') { label = this.hold ? 'Einfrieren' : 'Einfrieren / Auftauen'; icon = '❄️'; }
    else if (t.two) { label = 'Abbrechen'; icon = '✕'; }
    else if (this.tool === 'eraser') { label = 'Verbindungen lösen'; icon = '✂️'; }
    alt.hidden = !label;
    alt.querySelector('span').textContent = icon; alt.querySelector('em').textContent = label;
    $('grabctl').hidden = !this.hold;
    $('bRot').classList.toggle('down', this.rotMode);
  },

  aim(max) {
    const eye = this.me.eye(), dir = this.me.dir();
    return this.world.raycast(eye, dir, max || 60);
  },

  actDown() {
    if (!this.playing || !this.me) return;
    Audio.init();
    if (this.me.seat) return;
    const t = this.tool;
    if (t === 'grab') {
      if (this.hold) { this.release(); return; }
      const h = this.aim(60);
      if (!h || !h.part) { Audio.error(); return; }
      const p = h.part;
      const pq = p.mesh.quaternion.clone();
      const lp = h.point.clone().sub(p.mesh.position).applyQuaternion(pq.clone().invert());
      const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, this.me.yaw);
      this.hold = { id: p.id, lp, dist: h.dist, qRel: qYaw.invert().multiply(pq), part: p };
      this.me.ignore = p;
      this.cmd({ c: 'grab', id: p.id });
      Audio.grab();
      this.updateAltLabel();
      return;
    }
    const h = this.aim(60);
    if (!h) { Audio.error(); return; }
    const P = h.point, N = h.normal;
    if (t === 'eraser') { if (h.part) { this.cmd({ c: 'rm', id: h.id }); Audio.remove(); } else Audio.error(); return; }
    if (t === 'wheel') { if (!h.part) { this.say('Räder kann man nur an Bauteile setzen.', true); return; } this.cmd({ c: 'wheel', a: h.id, p: arr3(P), n: arr3(N) }); Audio.spawn(); return; }
    if (t === 'thruster') { this.cmd({ c: 'thruster', a: h.id, p: arr3(P), n: arr3(N) }); Audio.spawn(); return; }
    if (t === 'balloon') { this.cmd({ c: 'balloon', a: h.id, p: arr3(P) }); Audio.spawn(); return; }
    // Werkzeuge mit zwei Punkten
    if (!this.first) {
      if (!h.part && t !== 'rope' && t !== 'spring') { this.say('Tippe zuerst ein Bauteil an.', true); return; }
      this.first = { id: h.id, p: P.clone(), n: N.clone() };
      this.marker.position.copy(P); this.marker.visible = true;
      Audio.pick();
      $('toolhint').textContent = 'Jetzt das zweite Teil (oder den Boden) antippen.';
      return;
    }
    const f = this.first;
    if (f.id === h.id) { this.say('Wähle ein anderes Teil.', true); return; }
    this.cmd({ c: 'joint', kind: t, a: f.id, b: h.id, pa: arr3(f.p), pb: arr3(P), n: arr3(f.n) });
    Audio.weld();
    this.first = null; this.marker.visible = false;
    $('toolhint').textContent = TOOLS.find(x => x.k === t).hint;
  },

  actUp() { if (!this.touch && this.hold) this.release(); },

  release(freeze) {
    const h = this.hold; if (!h) return;
    this.hold = null; this.me.ignore = null; this.rotMode = false;
    if (this.isHost()) this.world.grabs.delete(this.myId);
    if (freeze) { this.cmd({ c: 'freeze', id: h.id, v: true }); Audio.freeze(); }
    else Audio.drop();
    this.updateAltLabel();
  },

  altDown() {
    if (!this.playing || !this.me) return;
    Audio.init();
    const t = TOOLS.find(x => x.k === this.tool);
    if (this.tool === 'grab') {
      if (this.hold) { this.release(true); return; }
      const h = this.aim(60);
      if (h && h.part) { this.cmd({ c: 'freeze', id: h.id, v: !h.part.frozen }); Audio.freeze(); }
      return;
    }
    if (t.two) { this.first = null; this.marker.visible = false; $('toolhint').textContent = t.hint; return; }
    if (this.tool === 'eraser') { const h = this.aim(60); if (h && h.part) { this.cmd({ c: 'unjoin', id: h.id }); Audio.remove(); } }
  },

  use() {
    if (!this.playing || !this.me) return;
    Audio.init();
    if (this.me.seat) { this.me.leaveSeat(); $('seatinfo').hidden = true; return; }
    const h = this.aim(7);
    if (!h || !h.part) return;
    if (h.part.type === 'seat') {
      for (const o of this.others.map.values()) if (o.seat === h.id) { this.say('Da sitzt schon jemand.', true); return; }
      if (this.hold) this.release();
      this.me.sit(h.id); $('seatinfo').hidden = false; Audio.pick();
      return;
    }
    if (h.part.type === 'thruster') { this.cmd({ c: 'use', id: h.id }); Audio.click(); }
  },

  spawn(type) {
    if (!this.playing) return;
    const eye = this.me.eye(), dir = this.me.dir();
    const h = this.world.raycast(eye, dir, 14);
    const hh = partHalfHeight(type);
    let p;
    if (h) { p = h.point.clone().addScaledVector(h.normal, hh + 0.08); if (h.normal.y < 0.5) p.y += 0.05; else p.y = Math.max(p.y, h.point.y + hh + 0.08); }
    else p = eye.clone().addScaledVector(dir, 4);
    // nicht in mir selbst erscheinen
    const d = Math.hypot(p.x - this.me.pos.x, p.z - this.me.pos.z);
    if (d < 1.4) { const f = new THREE.Vector3(dir.x, 0, dir.z).normalize(); p.addScaledVector(f, 1.6 - d); }
    const q = type === 'thruster' || type === 'balloon' ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(UP, this.me.yaw);
    this.cmd({ c: 'spawn', type, p: arr3(p), q: arr4(q) });
    Audio.spawn();
  },

  buildSpawnMenu() {
    const g = $('spawngrid');
    for (const k of SPAWN_ORDER) {
      const d = PARTS[k];
      const b = document.createElement('button');
      b.innerHTML = `<span class="ic">${d.icon}</span><span class="nm">${d.name}</span>`;
      b.addEventListener('click', () => { this.closeSpawn(); this.spawn(k); });
      g.appendChild(b);
    }
    $('spawn').addEventListener('click', e => { if (e.target === $('spawn') || e.target.closest('[data-close]')) this.closeSpawn(); });
  },
  openSpawn() {
    if (!this.playing) return;
    this.spawnOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    $('spawn').hidden = false;
  },
  closeSpawn() {
    this.spawnOpen = false; $('spawn').hidden = true;
    if (!this.touch && this.playing && !UI.open) this.lock();
  },
  lock() { const c = $('game'); if (c.requestPointerLock && !document.pointerLockElement) { try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (_) { } } },

  // ---------- Eingabe ----------
  setupInput() {
    const I = this.input;
    const canvas = $('game');
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'tab') { e.preventDefault(); if (this.spawnOpen) this.closeSpawn(); else if (this.playing && !UI.open) this.openSpawn(); return; }
      if (!this.playing || UI.open || this.spawnOpen) return;
      if (e.repeat) return;
      I.keys.add(k);
      if (k === 'e') this.use();
      if (k === 'z' || k === 'u') { this.cmd({ c: 'undo' }); Audio.click(); }
      if (k === 'f') this.altDown();
      if (k === 'q') { const i = TOOLS.findIndex(t => t.k === this.tool); this.selectTool(TOOLS[(i + 1) % TOOLS.length].k); }
      if (/^[1-9]$/.test(k)) this.selectTool(TOOLS[+k - 1].k);
      if (k === 'escape') UI.pause();
    });
    window.addEventListener('keyup', e => I.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => I.keys.clear());

    // Maus (PC): Zeiger einfangen, dann umschauen
    canvas.addEventListener('mousedown', e => {
      if (this.touch || !this.playing || UI.open) return;
      if (!document.pointerLockElement) { this.lock(); return; }
      if (e.button === 0) this.actDown();
      if (e.button === 2) this.altDown();
    });
    window.addEventListener('mouseup', e => { if (!this.touch && e.button === 0 && document.pointerLockElement) this.actUp(); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (!document.pointerLockElement || !this.playing) return;
      if (I.keys.has('r') && this.hold) this.rotateHeld(e.movementX * 0.006, e.movementY * 0.006);
      else { I.lookDX += e.movementX * 0.0024; I.lookDY += e.movementY * 0.0024; }
    });
    window.addEventListener('wheel', e => { if (this.hold) this.hold.dist = Math.max(1.5, Math.min(40, this.hold.dist - Math.sign(e.deltaY) * 0.8)); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const locked = !!document.pointerLockElement;
      $('lockhint').hidden = locked || this.touch || !this.playing || UI.open || this.spawnOpen;
      if (!locked && this.playing && !this.touch && !UI.open && !this.spawnOpen) UI.pause();
    });

    // Touch: linker Bereich = Stick, Rest des Bildes = umschauen
    const stick = $('stick'), knob = stick.querySelector('i');
    let sId = null, sx = 0, sy = 0;
    stick.addEventListener('touchstart', e => {
      e.preventDefault(); Audio.init();
      if (sId !== null) return;
      const t = e.changedTouches[0]; sId = t.identifier;
      const r = stick.getBoundingClientRect();
      sx = t.clientX; sy = t.clientY;
      knob.style.left = (t.clientX - r.left) + 'px'; knob.style.top = (t.clientY - r.top) + 'px';
      stick.classList.add('on');
    }, { passive: false });
    stick.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === sId) {
        let dx = (t.clientX - sx) / 55, dy = (t.clientY - sy) / 55;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        I.mx = dx; I.my = -dy;
        knob.style.setProperty('--kx', dx * 40 + 'px'); knob.style.setProperty('--ky', dy * 40 + 'px');
      }
    }, { passive: false });
    const sEnd = e => {
      for (const t of e.changedTouches) if (t.identifier === sId) { sId = null; I.mx = 0; I.my = 0; stick.classList.remove('on'); knob.style.setProperty('--kx', '0px'); knob.style.setProperty('--ky', '0px'); }
    };
    stick.addEventListener('touchend', sEnd); stick.addEventListener('touchcancel', sEnd);

    const looks = new Map();
    canvas.addEventListener('touchstart', e => { e.preventDefault(); Audio.init(); for (const t of e.changedTouches) looks.set(t.identifier, [t.clientX, t.clientY]); }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = looks.get(t.identifier); if (!p) continue;
        const dx = t.clientX - p[0], dy = t.clientY - p[1];
        looks.set(t.identifier, [t.clientX, t.clientY]);
        if (this.rotMode && this.hold) this.rotateHeld(dx * 0.012, dy * 0.012);
        else { I.lookDX += dx * 0.0065; I.lookDY += dy * 0.0065; }
      }
    }, { passive: false });
    const lEnd = e => { for (const t of e.changedTouches) looks.delete(t.identifier); };
    canvas.addEventListener('touchend', lEnd); canvas.addEventListener('touchcancel', lEnd);

    const btn = (id, down, up) => {
      const b = $(id);
      b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); b.classList.add('down'); down && down(); }, { passive: false });
      const end = e => { e.preventDefault(); b.classList.remove('down'); up && up(); };
      b.addEventListener('touchend', end); b.addEventListener('touchcancel', end);
      b.addEventListener('mousedown', e => { if (this.touch) return; e.stopPropagation(); down && down(); });
      b.addEventListener('mouseup', e => { if (this.touch) return; up && up(); });
    };
    btn('bAct', () => this.actDown(), () => this.actUp());
    btn('bAlt', () => this.altDown());
    btn('bJump', () => { I.jump = true; }, () => { I.jump = false; });
    btn('bUse', () => this.use());
    let farT = null;
    const rep = (fn) => () => { fn(); clearInterval(farT); farT = setInterval(fn, 60); };
    btn('bFar', rep(() => { if (this.hold) this.hold.dist = Math.min(40, this.hold.dist + 0.4); }), () => clearInterval(farT));
    btn('bNear', rep(() => { if (this.hold) this.hold.dist = Math.max(1.5, this.hold.dist - 0.4); }), () => clearInterval(farT));
    btn('bRot', () => { this.rotMode = !this.rotMode; this.updateAltLabel(); });
    const tap = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); Audio.init(); fn(); });
    tap('bMenu', () => UI.pause());
    tap('bSpawn', () => this.openSpawn());
    tap('bUndo', () => { this.cmd({ c: 'undo' }); Audio.click(); });
    $('lockhint').addEventListener('click', () => this.lock());
  },

  rotateHeld(dx, dy) {
    const h = this.hold; if (!h) return;
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, this.me.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(qYaw);
    const tq = qYaw.clone().multiply(h.qRel);
    const r = new THREE.Quaternion().setFromAxisAngle(UP, dx).multiply(new THREE.Quaternion().setFromAxisAngle(right, dy));
    tq.premultiply(r);
    h.qRel = qYaw.invert().multiply(tq).normalize();
  },

  // ---------- Schleife ----------
  fixed(dt) {
    const w = this.world; if (!w) return;
    if (this.playing && this.me) {
      const I = this.input, K = I.keys;
      let mx = I.mx, my = I.my;
      if (K.has('w') || K.has('arrowup')) my = 1; if (K.has('s') || K.has('arrowdown')) my = -1;
      if (K.has('a') || K.has('arrowleft')) mx = -1; if (K.has('d') || K.has('arrowright')) mx = 1;
      const jump = I.jump || K.has(' ');
      this.drive = this.me.seat ? { x: mx, y: my, th: jump ? 1 : 0 } : null;
      this.me.update(dt, this.me.seat ? 0 : mx, this.me.seat ? 0 : my, jump);
      if (this.isHost()) {
        if (this.drive) w.drivers.set(this.myId, Object.assign({ seat: this.me.seat }, this.drive)); else w.drivers.delete(this.myId);
        const g = this.grabState();
        if (g) w.grabs.set(this.myId, g); else w.grabs.delete(this.myId);
      }
    }
    w.step(dt);
  },

  grabState() {
    const h = this.hold; if (!h) return null;
    if (!this.world.parts.has(h.id)) { this.hold = null; this.me.ignore = null; this.updateAltLabel(); return null; }
    const eye = this.me.eye(), dir = this.me.dir();
    const target = eye.addScaledVector(dir, h.dist);
    const tq = new THREE.Quaternion().setFromAxisAngle(UP, this.me.yaw).multiply(h.qRel);
    h.want = { p: target.clone().sub(h.lp.clone().applyQuaternion(tq)), q: tq };
    return { id: h.id, lp: arr3(h.lp), target: arr3(target), tq: arr4(tq) };
  },

  frame(dt) {
    const w = this.world; if (!w) return;
    const I = this.input;
    if (this.playing && this.me) {
      this.me.yaw -= I.lookDX; this.me.pitch = Math.max(-1.5, Math.min(1.5, this.me.pitch - I.lookDY));
      I.lookDX = 0; I.lookDY = 0;
      if (!this.isHost()) this.grabState();
      w.sync(dt, this.hold);
      this.others.update(dt);
      const eye = this.me.eye();
      this.camera.position.copy(eye);
      this.camera.quaternion.setFromEuler(new THREE.Euler(this.me.pitch, this.me.yaw, 0, 'YXZ'));
      // Strahl und Fadenkreuz
      const h = this.hold;
      if (h && w.parts.has(h.id)) {
        const p = w.parts.get(h.id);
        const end = h.lp.clone().applyQuaternion(p.mesh.quaternion).add(p.mesh.position);
        const start = eye.clone().add(new THREE.Vector3(0.25, -0.3, 0).applyQuaternion(this.camera.quaternion));
        const len = start.distanceTo(end);
        this.beam.visible = true; this.beam.position.copy(start); this.beam.scale.set(1, len, 1);
        this.beam.quaternion.setFromUnitVectors(UP, end.sub(start).divideScalar(len || 1));
      } else this.beam.visible = false;
      this.aimInfo();
      if (this.first) this.marker.visible = true;
      this.sun.position.set(eye.x + 40, eye.y + 70, eye.z + 25); this.sun.target.position.copy(eye);
    } else {
      // Menü-Hintergrund: Kamera kreist über dem Bauplatz
      this.demoT = (this.demoT || 0) + dt;
      w.sync(dt, null);
      this.others.update(dt);
      const a = this.demoT * 0.08;
      this.camera.position.set(Math.sin(a) * 26, 11, Math.cos(a) * 26 - 6);
      this.camera.lookAt(0, 2, -6);
      this.sun.position.set(40, 70, 25); this.sun.target.position.set(0, 0, 0);
      if (this.demoT > 4 && !this._demoKick) { this._demoKick = true; const d = [...w.parts.values()].find(x => x.type === 'domino'); if (d) d.body.applyImpulse({ x: 0.6, y: 0, z: 0 }, true); }
      if (this.demoT > 40) { this._demoKick = false; this.newWorld(true); this.demoParts(); }
    }
    this.renderer.render(this.scene, this.camera);
  },

  aimInfo() {
    const now = performance.now();
    if (now - (this._aimT || 0) < 100) return;
    this._aimT = now;
    const h = this.me.seat ? null : this.aim(this.tool === 'grab' || this.tool === 'eraser' ? 60 : 60);
    let txt = '';
    if (h && h.part) {
      const d = PARTS[h.part.type];
      const o = this.player(h.part.owner);
      txt = d.name + (o && this.S.mode !== 'solo' ? ' · ' + o.name : '') + (h.part.frozen ? ' · eingefroren' : '');
      if (h.dist < 7 && h.part.type === 'seat') txt += ' · 👆 Einsteigen';
      if (h.dist < 7 && h.part.type === 'thruster') txt += ' · 👆 ' + (h.part.on ? 'Ausschalten' : 'Einschalten');
    }
    $('aim').textContent = txt;
    $('cross').classList.toggle('on', !!(h && h.part));
  },

  // ---------- Netz ----------
  myState() {
    const m = this.me;
    const g = this.hold && this.hold.want ? { id: this.hold.id, target: arr3(this.hold.want.p.clone().add(this.hold.lp.clone().applyQuaternion(this.hold.want.q))), lp: arr3(this.hold.lp), tq: arr4(this.hold.want.q) } : null;
    return { p: arr3(m.pos), yaw: +m.yaw.toFixed(3), pitch: +m.pitch.toFixed(3), seat: m.seat || 0, grab: g, drive: this.drive || null };
  },

  netTick() {
    if (!this.S || this.S.mode === 'solo') { if (this.world) this.world.events.length = 0; return; }
    if (!this.playing || !this.me) return;
    if (this.S.mode === 'guest') { Net.send({ t: 'st', s: this.myState() }); return; }
    // Gastgeber: Änderungen + bewegte Teile + alle Spieler an alle
    const w = this.world;
    const pl = [Object.assign({ id: this.myId }, this.myState())];
    for (const o of this.others.map.values()) if (o.last) pl.push(Object.assign({ id: o.id }, o.last));
    const ev = w.events.splice(0);
    if (Net.conns.size) Net.broadcast({ t: 'snap', ev, s: w.snapshot(), pl });
  },

  netMsg(m, from) {
    const S = this.S;
    if (!S) return;
    if (S.mode === 'host') {
      switch (m.t) {
        case 'hello': {
          if (S.players.length >= S.settings.max) { Net.sendTo(from, { t: 'kick', why: 'Die Runde ist voll (' + S.settings.max + ' Spieler).' }); setTimeout(() => Net.kick(from), 300); return; }
          const used = new Set(S.players.map(p => p.color));
          let color = 0; while (used.has(color)) color++;
          const p = { id: from, name: String(m.name || 'Gast').slice(0, 16), color };
          S.players.push(p);
          this.chatAdd({ sys: true, text: p.name + ' ist dabei.' });
          if (S.phase === 'lobby') { this.sendLobby(); UI.lobby(); }
          else { this.sendInit(from); this.others.ensure(p); Net.broadcast({ t: 'players', list: S.players }, from); }
          Net.sendTo(from, { t: 'chatlog', list: S.chat.slice(-40) });
          return;
        }
        case 'st': {
          const o = this.others.map.get(from); if (!o) return;
          o.last = m.s; this.others.setState(from, m.s);
          const w = this.world;
          if (m.s.grab) w.grabs.set(from, m.s.grab); else w.grabs.delete(from);
          if (m.s.seat && m.s.drive) w.drivers.set(from, Object.assign({ seat: m.s.seat }, m.s.drive)); else w.drivers.delete(from);
          return;
        }
        case 'cmd': {
          if (!this.playing) return;
          const err = this.world.exec(m.c, from);
          if (err) Net.sendTo(from, { t: 'msg', text: err });
          return;
        }
        case 'chat': { const p = this.player(from); if (p) this.chatAdd({ id: from, name: p.name, color: p.color, text: String(m.text || '').slice(0, 200) }); return; }
      }
      return;
    }
    // Gast
    switch (m.t) {
      case 'lobby': S.players = m.players; S.settings = m.settings; S.code = m.code; if (S.phase === 'lobby') UI.lobby(); return;
      case 'init': S.players = m.players; S.settings = m.settings; S.phase = 'play'; this.enterWorld(false, m.state); return;
      case 'players': {
        S.players = m.list;
        const ids = new Set(m.list.map(p => p.id));
        for (const p of m.list) if (p.id !== this.myId) this.others.ensure(p);
        for (const id of [...this.others.map.keys()]) if (!ids.has(id)) this.others.remove(id);
        return;
      }
      case 'snap': {
        if (!this.playing) return;
        const w = this.world;
        for (const e of m.ev) w.applyEvent(e);
        if (m.ev.length) this.updateCount();
        w.applySnapshot(m.s);
        for (const s of m.pl) if (s.id !== this.myId) { this.others.ensure(this.player(s.id) || { id: s.id, name: '?', color: s.id }); this.others.setState(s.id, s); }
        return;
      }
      case 'msg': this.say(m.text, true); return;
      case 'kick': this.kickReason = m.why; return;
      case 'chat': this.chatShow(m.e); return;
      case 'chatlog': S.chat = m.list; if (UI.open === 'lobby') UI.lobby(); return;
      case 'left': this.others.remove(m.id); return;
      case 'end': this.kickReason = 'Der Gastgeber hat die Runde beendet.'; return;
    }
  },

  netDrop(id) {
    const S = this.S; if (!S) return;
    if (S.mode === 'host') {
      const p = this.player(id);
      S.players = S.players.filter(x => x.id !== id);
      this.others.remove(id);
      this.world.grabs.delete(id); this.world.drivers.delete(id);
      if (p) this.chatAdd({ sys: true, text: p.name + ' hat die Runde verlassen.' });
      if (S.phase === 'lobby') { this.sendLobby(); UI.lobby(); }
      else Net.broadcast({ t: 'players', list: S.players });
      return;
    }
    const why = this.kickReason || 'Die Verbindung zum Gastgeber ist abgebrochen.';
    this.kickReason = null;
    this.leave();
    UI.error(why);
  },

  // Gastgeber
  host() {
    UI.wait('Runde wird geöffnet …');
    Net.host((err, code) => {
      if (err) { UI.error(err, () => UI.multi()); return; }
      this.myId = 0;
      this.S = { mode: 'host', phase: 'lobby', code, players: [{ id: 0, name: this.settings.name || 'Gastgeber', color: 0 }], settings: { max: 4, limit: 40 }, chat: [] };
      Net.limit = 4;
      UI.lobby();
    });
  },

  join(code) {
    UI.wait('Verbinde mit Runde ' + code + ' …');
    Net.join(code, (err, id) => {
      if (err) { UI.error(err, () => UI.multi(code)); return; }
      this.myId = id;
      this.S = { mode: 'guest', phase: 'lobby', code, players: [], settings: { max: 4, limit: 40 }, chat: [] };
      Net.send({ t: 'hello', name: this.settings.name || 'Gast' });
      UI.wait('Warte auf den Gastgeber …');
    });
  },

  sendLobby() { Net.broadcast({ t: 'lobby', players: this.S.players, settings: this.S.settings, code: this.S.code }); },
  setSetting(k, v) {
    const S = this.S; if (!S || S.mode !== 'host') return;
    if (k === 'max') S.settings.max = Math.max(Math.max(2, S.players.length), Math.min(4, v));
    if (k === 'limit') S.settings.limit = Math.max(10, Math.min(60, v));
    if (this.playing) this.world.limit = S.settings.limit;
    this.sendLobby(); UI.lobby();
  },

  sendInit(id) {
    const S = this.S;
    Net.sendTo(id, { t: 'init', players: S.players, settings: S.settings, state: this.world.fullState() });
  },

  startHosted() {
    const S = this.S; if (!S || S.mode !== 'host') return;
    S.phase = 'play';
    this.enterWorld(true, null);
    for (const p of S.players) if (p.id !== 0) this.sendInit(p.id);
  },

  chatAdd(e) {
    const S = this.S; if (!S) return;
    S.chat.push(e); if (S.chat.length > 100) S.chat.shift();
    if (S.mode === 'host') Net.broadcast({ t: 'chat', e });
    this.chatShow(e, true);
  },
  chatShow(e, already) {
    const S = this.S; if (!S) return;
    if (!already) { S.chat.push(e); if (S.chat.length > 100) S.chat.shift(); }
    if (this.playing) { if (e.sys) this.say(e.text); else this.say(e.text, false, e); }
    if (UI.open === 'lobby' || UI.open === 'pause') UI.refreshChat();
  },
  sendChat(text) {
    text = (text || '').trim(); if (!text || !this.S) return;
    if (this.S.mode === 'host') { const p = this.player(0); this.chatAdd({ id: 0, name: p.name, color: p.color, text }); }
    else Net.send({ t: 'chat', text });
  },

  invite() {
    const S = this.S; if (!S || !S.code) return;
    const k = Net.getKey();
    const url = location.origin + location.pathname + '?r=' + S.code + (k && k.user && k.pass ? '#k=' + btoa(unescape(encodeURIComponent(JSON.stringify([k.user, k.pass])))).replace(/=+$/, '') : '');
    const text = 'Komm auf meine Tüftelinsel! Code ' + S.code;
    if (navigator.share) { navigator.share({ title: 'Tüftelinsel', text, url }).catch(() => { }); return; }
    const done = () => UI.toast('Link kopiert');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text + '\n' + url).then(done, () => window.prompt('Link kopieren:', url));
    else window.prompt('Link kopieren:', url);
  },
};

window.TF = Game; // für Tests in der Konsole
Game.boot().catch(e => {
  console.error(e);
  const l = $('loading'); l.hidden = false;
  l.querySelector('p').textContent = 'Das Spiel konnte nicht starten: ' + (e && e.message || e);
});
