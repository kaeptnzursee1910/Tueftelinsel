// Tüftelinsel – Start, Spielschleife, Bauen und Abbauen, Steuerung und Mehrspieler-Ablauf
import * as THREE from '../lib/three.module.min.js';
import { World } from './world.js';
import { CH, SEA } from './gen.js';
import { B, BLOCKS, SOLID, PALETTE, DEFAULT_HOTBAR, validBlock } from './blocks.js';
import { blockIcon } from './textures.js';
import { Me, Others, COLORS } from './player.js';
import { Net } from './net.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Store } from './store.js';

const $ = id => document.getElementById(id);
const r2 = v => Math.round(v * 100) / 100;
const SKY = 0x9fd8ff, DEEP = 0x1d5a8a;
const REACH = 6;

export const Game = {
  settings: { name: '', sound: true, view: 5, autojump: true, hotbar: DEFAULT_HOTBAR.slice(), slot: 0 },
  S: null,            // Sitzung: {mode, phase, players, settings, chat, code, rec}
  world: null, me: null, others: null,
  playing: false,
  input: { keys: new Set(), mx: 0, my: 0, jump: false, down: false, lookDX: 0, lookDY: 0 },
  hold: { brk: false, place: false, t: 0 },
  touch: false,

  async boot() {
    this.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    document.body.classList.toggle('touch', this.touch);
    this.settings.view = this.touch ? 5 : 6;
    this.settings.autojump = this.touch;
    try { this.settings = Object.assign(this.settings, JSON.parse(localStorage.getItem('tf_block_settings') || '{}')); } catch (_) { }
    if (!Array.isArray(this.settings.hotbar) || this.settings.hotbar.length !== 9) this.settings.hotbar = DEFAULT_HOTBAR.slice();
    Audio.on = this.settings.sound;
    this.renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: !this.touch, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.touch ? 1.5 : 1.75));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 50, 80);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
    this.scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6a8a55, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.4); sun.position.set(0.4, 1, 0.3); this.scene.add(sun);
    const sunBall = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
    this.sunBall = sunBall; this.scene.add(sunBall);
    // Rahmen um den Block unter dem Fadenkreuz
    this.sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x15121f, transparent: true, opacity: 0.7 }));
    this.sel.visible = false; this.scene.add(this.sel);
    this.others = new Others(this.scene);

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
      else if (Net.isHost && Net.peer) Net.keepAlive(Net.peer);
    });
    window.addEventListener('pagehide', () => this.save());
    this.resize();
    this.setupInput();
    this.buildHotbar();
    this.buildBlockMenu();
    Net.onMsg = (m, from) => this.netMsg(m, from);
    Net.onDrop = id => this.netDrop(id);
    this.menuWorld();
    $('loading').hidden = true;

    // Einladungslink ?r=1234 (#k=… trägt die Zugangsdaten des Verbindungsservers)
    const inv = (new URLSearchParams(location.search).get('r') || '').replace(/\D/g, '').slice(0, 4);
    const km = /[#&]k=([A-Za-z0-9+/]+)/.exec(location.hash);
    if (km) { try { const [u, p] = JSON.parse(decodeURIComponent(escape(atob(km[1])))); if (u && p) Net.setKey(String(u), String(p)); } catch (_) { } }
    if (inv.length === 4 || km) history.replaceState(null, '', location.pathname);
    UI.main();
    if (inv.length === 4) UI.multi(inv);

    let last = performance.now(), acc = 0, netT = 0, saveT = 0;
    const frame = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      acc += dt;
      let n = 0;
      while (acc >= 1 / 60 && n < 4) { this.fixed(1 / 60); acc -= 1 / 60; n++; }
      if (n === 4) acc = 0;
      this.frame(dt);
      netT += dt;
      if (netT >= 0.05) { netT = 0; this.netTick(); }
      saveT += dt;
      if (saveT >= 30) { saveT = 0; this.save(); }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  saveSettings() { try { localStorage.setItem('tf_block_settings', JSON.stringify(this.settings)); } catch (_) { } },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  },

  applyView() {
    const v = this.settings.view;
    if (this.world) this.world.radius = v;
    this.scene.fog.near = v * 16 * 0.5; this.scene.fog.far = v * 16 * 0.92;
    this.camera.far = v * 16 + 60; this.camera.updateProjectionMatrix();
  },

  setWorld(seed, edits) {
    if (this.world) this.world.dispose();
    this.others.clear();
    this.world = new World(this.scene, seed, edits);
    this.applyView();
  },

  // Hintergrund des Hauptmenüs: eine Insel, um die die Kamera kreist
  menuWorld() {
    this.setWorld('Tüftelinsel-Hauptmenü', null);
    this.world.radius = Math.min(4, this.settings.view);
    this.menuSpawn = this.world.gen.findSpawn();
    this.demoT = 0; this.menuY = null;
  },

  // ---------- Sitzung starten ----------
  startSolo(rec) {
    this.S = { mode: 'solo', phase: 'play', rec, players: [{ id: 0, name: this.settings.name || 'Ich', color: 0 }], settings: { max: 1 }, chat: [] };
    this.myId = 0;
    this.enterWorld(rec.seed, rec.edits, rec.spawn, rec.me);
  },

  enterWorld(seed, edits, spawn, mine) {
    UI.close();
    this.setWorld(seed, edits);
    const S = this.S;
    if (!spawn) spawn = this.world.gen.findSpawn();
    S.spawn = spawn;
    if (S.rec && !S.rec.spawn) S.rec.spawn = spawn;
    const p = mine && mine.p ? mine.p : [spawn[0] + (Math.random() - 0.5) * 3, spawn[1], spawn[2] + (Math.random() - 0.5) * 3];
    this.me = new Me(this.world, p);
    if (mine) { this.me.yaw = mine.yaw || 0; this.me.pitch = mine.pitch || 0; this.me.fly = !!mine.fly; }
    for (const pl of S.players) if (pl.id !== this.myId) this.others.ensure(pl);
    this.playing = true;
    $('hud').hidden = false;
    this.selectSlot(this.settings.slot || 0);
    this.updateFly();
    if (!this.settings.seenHelp) { this.settings.seenHelp = true; this.saveSettings(); UI.help(true); }
    else if (!this.touch) this.lock();
  },

  goHome() {
    if (!this.me || !this.S) return;
    const s = this.S.spawn;
    this.me.pos.set(s[0], s[1], s[2]); this.me.vel.set(0, 0, 0);
  },

  async save() {
    const S = this.S;
    if (!S || !S.rec || S.mode === 'guest' || !this.world || !this.me) return;
    const rec = S.rec;
    rec.edits = this.world.editsObject();
    rec.me = { p: [r2(this.me.pos.x), r2(this.me.pos.y), r2(this.me.pos.z)], yaw: r2(this.me.yaw), pitch: r2(this.me.pitch), fly: this.me.fly };
    rec.played = Date.now();
    this.world.dirty = false;
    await Store.put(rec);
  },

  async leave() {
    await this.save();
    Net.close();
    this.playing = false; this.S = null; this.me = null;
    this.hold.brk = this.hold.place = false;
    $('hud').hidden = true; $('underwater').hidden = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.menuWorld();
    UI.main();
  },

  player(id) { return this.S && this.S.players.find(p => p.id === id); },

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

  // ---------- Schnellleiste und Block-Menü ----------
  buildHotbar() {
    const bar = $('hotbar');
    bar.innerHTML = '';
    this.settings.hotbar.forEach((b, i) => {
      const el = document.createElement('button');
      el.innerHTML = `<img alt="" src="${blockIcon(b)}"><small>${i + 1}</small>`;
      el.title = BLOCKS[b].name;
      el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.selectSlot(i); Audio.init(); Audio.click(); });
      bar.appendChild(el);
    });
    this.selectSlot(this.settings.slot || 0);
  },

  selectSlot(i) {
    this.settings.slot = (i + 9) % 9;
    const kids = $('hotbar').children;
    for (let k = 0; k < kids.length; k++) kids[k].classList.toggle('on', k === this.settings.slot);
    const b = this.current();
    const img = $('bPlace').querySelector('span');
    img.innerHTML = `<img alt="" src="${blockIcon(b)}" style="width:52px;height:52px;image-rendering:pixelated;display:block">`;
    if (this.playing) this.flashName(BLOCKS[b].name);
  },
  current() { return this.settings.hotbar[this.settings.slot]; },

  flashName(t) { const a = $('aim'); a.textContent = t; this._aimHold = performance.now() + 900; },

  buildBlockMenu() {
    const g = $('blockgrid');
    for (const b of PALETTE) {
      const el = document.createElement('button');
      el.innerHTML = `<img alt="" src="${blockIcon(b)}"><span>${BLOCKS[b].name}</span>`;
      el.addEventListener('click', () => {
        this.settings.hotbar[this.settings.slot] = b; this.saveSettings();
        this.buildHotbar(); this.closeBlocks(); Audio.pick();
      });
      g.appendChild(el);
    }
    $('blocks').addEventListener('click', e => { if (e.target === $('blocks') || e.target.closest('[data-close]')) this.closeBlocks(); });
  },
  openBlocks() {
    if (!this.playing) return;
    this.blocksOpen = true;
    this.hold.brk = this.hold.place = false;
    if (document.pointerLockElement) document.exitPointerLock();
    $('blocks').hidden = false;
  },
  closeBlocks() {
    this.blocksOpen = false; $('blocks').hidden = true;
    if (!this.touch && this.playing && !UI.open) this.lock();
  },
  lock() { const c = $('game'); if (c.requestPointerLock && !document.pointerLockElement) { try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (_) { } } },

  // ---------- Bauen und Abbauen ----------
  aim() {
    if (!this.me) return null;
    return this.world.raycast(this.me.eye(), this.me.dir(), REACH);
  },

  breakBlock() {
    const h = this.aim();
    if (!h) return false;
    if (BLOCKS[h.b].hard) { this.say('Urgestein lässt sich nicht abbauen.', true); return false; }
    const list = [h.x, h.y, h.z, this.world.afterBreak(h.x, h.y, h.z)];
    // Pflanzen auf dem Block fallen mit weg
    const up = this.world.get(h.x, h.y + 1, h.z);
    if (up > 0 && BLOCKS[up].soft) list.push(h.x, h.y + 1, h.z, B.AIR);
    this.applyLocal(list);
    if (list[3] === B.WATER) Audio.splash(); else Audio.dig();
    return true;
  },

  placeBlock() {
    const h = this.aim();
    if (!h) return false;
    const b = this.current();
    let x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz;
    if (BLOCKS[h.b].soft) { x = h.x; y = h.y; z = h.z; }
    if (y < 1 || y >= CH) { this.say('So hoch kann man nicht bauen.', true); return false; }
    const there = this.world.get(x, y, z);
    if (there < 0 || (there !== B.AIR && there !== B.WATER && !BLOCKS[there].soft)) return false;
    if (SOLID[b] && (this.me.overlaps(x, y, z) || this.others.blocks(x, y, z))) return false;
    if (BLOCKS[b].kind === 'cross') { const below = this.world.get(x, y - 1, z); if (!(below > 0 && SOLID[below])) return false; }
    this.applyLocal([x, y, z, b]);
    if (b === B.WATER) Audio.splash(); else Audio.place();
    return true;
  },

  pickBlock() {
    const h = this.aim(); if (!h) return;
    const i = this.settings.hotbar.indexOf(h.b);
    if (i >= 0) { this.selectSlot(i); return; }
    if (!PALETTE.includes(h.b)) return;
    this.settings.hotbar[this.settings.slot] = h.b; this.saveSettings(); this.buildHotbar(); Audio.pick();
  },

  applyLocal(list) {
    if (list.length === 4) this.world.set(list[0], list[1], list[2], list[3]); else this.world.setMany(list);
    if (!this.S || this.S.mode === 'solo') return;
    if (this.S.mode === 'guest') Net.send({ t: 'set', l: list });
    else Net.broadcast({ t: 'set', l: list });
  },

  // ---------- Eingabe ----------
  setupInput() {
    const I = this.input;
    const canvas = $('game');
    let lastSpace = 0;
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'e' && this.playing && !UI.open) { e.preventDefault(); if (this.blocksOpen) this.closeBlocks(); else this.openBlocks(); return; }
      if (k === 'tab') e.preventDefault();
      if (!this.playing || UI.open) return;
      if (this.blocksOpen) { if (k === 'escape') this.closeBlocks(); return; }
      if (e.repeat) return;
      I.keys.add(k);
      if (k === ' ') {
        const now = performance.now();
        if (now - lastSpace < 300) { this.toggleFly(); lastSpace = 0; } else lastSpace = now;
      }
      if (/^[1-9]$/.test(k)) this.selectSlot(+k - 1);
      if (k === 'escape') UI.pause();
      if (k === 't' && this.S.mode !== 'solo') { e.preventDefault(); UI.pause(true); }
    });
    window.addEventListener('keyup', e => I.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { I.keys.clear(); this.hold.brk = this.hold.place = false; });

    // Maus (PC): Zeiger einfangen, dann umschauen
    canvas.addEventListener('mousedown', e => {
      if (this.touch || !this.playing || UI.open) return;
      if (!document.pointerLockElement) { this.lock(); return; }
      Audio.init();
      if (e.button === 0) this.startHold('brk');
      if (e.button === 2) this.startHold('place');
      if (e.button === 1) { e.preventDefault(); this.pickBlock(); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.hold.brk = false; if (e.button === 2) this.hold.place = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (!document.pointerLockElement || !this.playing) return;
      I.lookDX += e.movementX * 0.0024; I.lookDY += e.movementY * 0.0024;
    });
    window.addEventListener('wheel', e => { if (this.playing && !UI.open && !this.blocksOpen && document.pointerLockElement) this.selectSlot(this.settings.slot + Math.sign(e.deltaY)); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const locked = !!document.pointerLockElement;
      $('lockhint').hidden = locked || this.touch || !this.playing || !!UI.open || this.blocksOpen;
      if (!locked) { this.hold.brk = this.hold.place = false; I.keys.clear(); }
      if (!locked && this.playing && !this.touch && !UI.open && !this.blocksOpen) UI.pause();
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
        I.lookDX += dx * 0.0065; I.lookDY += dy * 0.0065;
      }
    }, { passive: false });
    const lEnd = e => { for (const t of e.changedTouches) looks.delete(t.identifier); };
    canvas.addEventListener('touchend', lEnd); canvas.addEventListener('touchcancel', lEnd);

    const btn = (id, down, up) => {
      const b = $(id);
      b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); Audio.init(); b.classList.add('down'); down && down(); }, { passive: false });
      const end = e => { e.preventDefault(); b.classList.remove('down'); up && up(); };
      b.addEventListener('touchend', end); b.addEventListener('touchcancel', end);
      b.addEventListener('mousedown', e => { if (this.touch) return; e.stopPropagation(); down && down(); });
      b.addEventListener('mouseup', e => { if (this.touch) return; up && up(); });
    };
    btn('bPlace', () => this.startHold('place'), () => { this.hold.place = false; });
    btn('bBreak', () => this.startHold('brk'), () => { this.hold.brk = false; });
    btn('bJump', () => { I.jump = true; }, () => { I.jump = false; });
    btn('bDown', () => { I.down = true; }, () => { I.down = false; });
    btn('bFly', () => this.toggleFly());
    const tap = (id, fn) => $(id).addEventListener('click', e => { e.stopPropagation(); Audio.init(); fn(); });
    tap('bMenu', () => UI.pause());
    tap('bBlocks', () => this.openBlocks());
    $('lockhint').addEventListener('click', () => this.lock());
  },

  startHold(kind) {
    if (!this.playing || !this.me || UI.open || this.blocksOpen) return;
    this.hold[kind] = true;
    this.hold.t = 0.3;
    if (kind === 'brk') this.breakBlock(); else this.placeBlock();
  },

  toggleFly() {
    if (!this.me) return;
    this.me.fly = !this.me.fly;
    if (this.me.fly) { this.me.vel.y = 3; Audio.fly(); }
    this.updateFly();
  },
  updateFly() {
    const f = !!(this.me && this.me.fly);
    $('flyinfo').hidden = !f;
    $('bDown').hidden = !f;
    $('bFly').classList.toggle('lit', f);
    if (!f) this.input.down = false;
  },

  // ---------- Schleife ----------
  fixed(dt) {
    if (!this.playing || !this.me) return;
    const I = this.input, K = I.keys;
    const paused = !!UI.open || !!this.blocksOpen;
    let mx = paused ? 0 : I.mx, my = paused ? 0 : I.my;
    if (!paused) {
      if (K.has('w') || K.has('arrowup')) my = 1; if (K.has('s') || K.has('arrowdown')) my = -1;
      if (K.has('a') || K.has('arrowleft')) mx = -1; if (K.has('d') || K.has('arrowright')) mx = 1;
    }
    const up = !paused && (I.jump || K.has(' '));
    const down = !paused && (I.down || K.has('shift'));
    const wasFly = this.me.fly;
    const r = this.me.update(dt, mx, my, up, down, this.settings.autojump);
    if (wasFly !== this.me.fly) this.updateFly();
    if (r === 'fell') { this.goHome(); this.say('Du bist durch die Welt gefallen und wieder am Startplatz.'); }
  },

  frame(dt) {
    const w = this.world; if (!w) return;
    const I = this.input;
    if (this.playing && this.me) {
      const m = this.me;
      m.yaw -= I.lookDX; m.pitch = Math.max(-1.55, Math.min(1.55, m.pitch - I.lookDY));
      I.lookDX = 0; I.lookDY = 0;
      w.update(m.pos.x, m.pos.z);
      this.others.update(dt);
      const eye = m.eye();
      this.camera.position.copy(eye);
      this.camera.quaternion.setFromEuler(new THREE.Euler(m.pitch, m.yaw, 0, 'YXZ'));
      // gedrückt halten = weiter bauen/abbauen
      if (this.hold.brk || this.hold.place) {
        this.hold.t -= dt;
        if (this.hold.t <= 0) { this.hold.t = 0.22; if (this.hold.brk) this.breakBlock(); else this.placeBlock(); }
      }
      this.aimInfo();
      const under = m.headWater;
      $('underwater').hidden = !under;
      this.scene.fog.color.setHex(under ? DEEP : SKY);
      this.scene.background.setHex(under ? DEEP : SKY);
      const v = this.settings.view * 16;
      this.scene.fog.near = under ? 1 : v * 0.5; this.scene.fog.far = under ? 22 : v * 0.92;
      $('loadinfo').hidden = w.loadedAround(m.pos.x, m.pos.z);
      this.sunBall.position.set(eye.x - 160, eye.y + 170, eye.z - 200);
    } else {
      // Menü-Hintergrund: Kamera kreist über der Insel
      this.demoT += dt;
      const s = this.menuSpawn, a = this.demoT * 0.05;
      const cx = s[0] + Math.sin(a) * 28, cz = s[2] + Math.cos(a) * 28;
      const gh = Math.max(w.gen.height(Math.floor(cx), Math.floor(cz)), SEA);
      this.menuY = this.menuY == null ? gh + 12 : this.menuY + (Math.max(s[1] + 14, gh + 12) - this.menuY) * Math.min(1, dt * 0.8);
      this.camera.position.set(cx, this.menuY, cz);
      this.camera.lookAt(s[0], s[1] + 2, s[2]);
      w.update(s[0], s[2]);
      this.sunBall.position.set(cx - 160, 190, cz - 200);
      this.scene.fog.color.setHex(SKY); this.scene.background.setHex(SKY);
      this.scene.fog.near = w.radius * 16 * 0.5; this.scene.fog.far = w.radius * 16 * 0.92;
    }
    this.renderer.render(this.scene, this.camera);
  },

  aimInfo() {
    const h = this.aim();
    if (h) { this.sel.visible = true; this.sel.position.set(h.x + 0.5, h.y + 0.5, h.z + 0.5); }
    else this.sel.visible = false;
    const now = performance.now();
    if (now - (this._aimT || 0) < 150) return;
    this._aimT = now;
    if (now > (this._aimHold || 0)) $('aim').textContent = h ? BLOCKS[h.b].name : '';
    const p = this.me.pos;
    const n = this.S && this.S.mode !== 'solo' ? ' · 👥 ' + this.S.players.length : '';
    $('info').textContent = 'X ' + Math.floor(p.x) + ' · Y ' + Math.floor(p.y) + ' · Z ' + Math.floor(p.z) + n;
  },

  // ---------- Netz ----------
  myState() {
    const m = this.me;
    return { p: [r2(m.pos.x), r2(m.pos.y), r2(m.pos.z)], yaw: r2(m.yaw), pitch: r2(m.pitch), fly: m.fly ? 1 : 0 };
  },

  netTick() {
    if (!this.S || this.S.mode === 'solo' || !this.playing || !this.me) return;
    if (this.S.mode === 'guest') { Net.send({ t: 'st', s: this.myState() }); return; }
    const pl = [Object.assign({ id: this.myId }, this.myState())];
    for (const o of this.others.map.values()) if (o.last) pl.push(Object.assign({ id: o.id }, o.last));
    if (Net.conns.size) Net.broadcast({ t: 'pl', pl });
  },

  // vom Gastgeber geprüfte Blockänderungen
  cleanList(l) {
    const out = [];
    if (!Array.isArray(l) || l.length > 400) return out;
    for (let i = 0; i + 3 < l.length; i += 4) {
      const x = l[i], y = l[i + 1], z = l[i + 2], b = l[i + 3];
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z) || y < 1 || y >= CH || !validBlock(b)) continue;
      if (Math.abs(x) > 1e6 || Math.abs(z) > 1e6) continue;
      if (this.world.get(x, y, z) === B.BEDROCK) continue;
      out.push(x, y, z, b);
    }
    return out;
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
          const o = this.others.map.get(from); if (!o || !m.s) return;
          o.last = m.s; this.others.setState(from, m.s);
          return;
        }
        case 'set': {
          if (!this.playing) return;
          const l = this.cleanList(m.l);
          if (!l.length) return;
          this.world.setMany(l);
          Net.broadcast({ t: 'set', l }, from);
          return;
        }
        case 'chat': { const p = this.player(from); if (p) this.chatAdd({ id: from, name: p.name, color: p.color, text: String(m.text || '').slice(0, 200) }); return; }
      }
      return;
    }
    // Gast
    switch (m.t) {
      case 'lobby': S.players = m.players; S.settings = m.settings; S.code = m.code; if (S.phase === 'lobby') UI.lobby(); return;
      case 'edits': { const p = S.pend || (S.pend = {}); for (const k in m.e) p[k] = (p[k] || []).concat(m.e[k]); return; }
      case 'init': S.players = m.players; S.settings = m.settings; S.phase = 'play'; this.enterWorld(m.seed, S.pend || {}, m.spawn, null); S.pend = null; return;
      case 'players': {
        S.players = m.list;
        const ids = new Set(m.list.map(p => p.id));
        for (const p of m.list) if (p.id !== this.myId) this.others.ensure(p);
        for (const id of [...this.others.map.keys()]) if (!ids.has(id)) this.others.remove(id);
        return;
      }
      case 'set': if (this.playing && Array.isArray(m.l)) this.world.setMany(m.l); return;
      case 'pl': {
        if (!this.playing) return;
        for (const s of m.pl) if (s.id !== this.myId) { this.others.ensure(this.player(s.id) || { id: s.id, name: '?', color: s.id }); this.others.setState(s.id, s); }
        return;
      }
      case 'msg': this.say(m.text, true); return;
      case 'kick': this.kickReason = m.why; return;
      case 'chat': this.chatShow(m.e); return;
      case 'chatlog': S.chat = m.list; if (UI.open === 'lobby') UI.lobby(); return;
      case 'end': this.kickReason = 'Der Gastgeber hat die Runde beendet.'; return;
    }
  },

  netDrop(id) {
    const S = this.S; if (!S) return;
    if (S.mode === 'host') {
      const p = this.player(id);
      S.players = S.players.filter(x => x.id !== id);
      this.others.remove(id);
      if (p) this.chatAdd({ sys: true, text: p.name + ' hat die Runde verlassen.' });
      if (S.phase === 'lobby') { this.sendLobby(); UI.lobby(); }
      else Net.broadcast({ t: 'players', list: S.players });
      return;
    }
    const why = this.kickReason || 'Die Verbindung zum Gastgeber ist abgebrochen.';
    this.kickReason = null;
    this.leave().then(() => UI.error(why));
  },

  // Gastgeber
  host(rec) {
    UI.wait('Runde wird geöffnet …');
    Net.host((err, code) => {
      if (err) { UI.error(err, () => UI.multi()); return; }
      this.myId = 0;
      this.S = { mode: 'host', phase: 'lobby', code, rec, players: [{ id: 0, name: this.settings.name || 'Gastgeber', color: 0 }], settings: { max: 4, world: rec.name }, chat: [] };
      Net.limit = 4;
      UI.lobby();
    });
  },

  join(code) {
    UI.wait('Verbinde mit Runde ' + code + ' …');
    Net.join(code, (err, id) => {
      if (err) { UI.error(err, () => UI.multi(code)); return; }
      this.myId = id;
      this.S = { mode: 'guest', phase: 'lobby', code, players: [], settings: { max: 4 }, chat: [] };
      Net.send({ t: 'hello', name: this.settings.name || 'Gast' });
      UI.wait('Warte auf den Gastgeber …');
    });
  },

  sendLobby() { Net.broadcast({ t: 'lobby', players: this.S.players, settings: this.S.settings, code: this.S.code }); },
  setSetting(k, v) {
    const S = this.S; if (!S || S.mode !== 'host') return;
    if (k === 'max') S.settings.max = Math.max(Math.max(2, S.players.length), Math.min(4, v));
    this.sendLobby(); UI.lobby();
  },

  // Neuer Mitspieler: erst alle Änderungen in Paketen, dann der Startwert
  sendInit(id) {
    const S = this.S;
    const edits = this.playing ? this.world.editsObject() : (S.rec.edits || {});
    let pack = {}, n = 0;
    for (const k in edits) {
      const a = edits[k];
      for (let i = 0; i < a.length; i += 3000) {
        pack[k] = (pack[k] || []).concat(a.slice(i, i + 3000));
        n += Math.min(3000, a.length - i);
        if (n >= 3000) { Net.sendTo(id, { t: 'edits', e: pack }); pack = {}; n = 0; }
      }
    }
    if (n) Net.sendTo(id, { t: 'edits', e: pack });
    Net.sendTo(id, { t: 'init', seed: S.rec.seed, spawn: S.spawn || S.rec.spawn, players: S.players, settings: S.settings });
  },

  startHosted() {
    const S = this.S; if (!S || S.mode !== 'host') return;
    S.phase = 'play';
    this.enterWorld(S.rec.seed, S.rec.edits, S.rec.spawn, S.rec.me);
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
