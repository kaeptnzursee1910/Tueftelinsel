// Tüftelinsel – Menüs: Start, Welten, Mehrspieler, Lobby mit Chat, Pause, Steuerung, Verbindungseinstellungen
import { Game } from './main.js';
import { Net } from './net.js';
import { Audio } from './audio.js';
import { COLORS } from './player.js';
import { Store } from './store.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hex = c => '#' + COLORS[c % COLORS.length].toString(16).padStart(6, '0');
const VIEWS = [3, 4, 5, 6, 8, 10];
const ago = t => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'gerade eben'; if (m < 60) return 'vor ' + m + ' Min.';
  const h = Math.round(m / 60); if (h < 24) return 'vor ' + h + ' Std.';
  return new Date(t).toLocaleDateString('de-DE');
};

export const UI = {
  open: null,
  el: null,

  show(name, html) {
    this.el = $('menu');
    this.open = name;
    this.el.innerHTML = html;
    if (document.pointerLockElement) document.exitPointerLock();
    $('lockhint').hidden = true;
    this.el.onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      Audio.init(); Audio.click();
      const da = b.dataset.act, ci = da.indexOf(':');
      const act = ci < 0 ? da : da.slice(0, ci), arg = ci < 0 ? undefined : da.slice(ci + 1);
      this.acts[act] && this.acts[act].call(this, arg, b);
    };
    const af = this.el.querySelector('[autofocus]'); if (af && !Game.touch) af.focus();
  },
  close() { this.open = null; if (this.el) this.el.innerHTML = ''; },

  toast(text) { if (Game.playing) Game.say(text); else { const e = this.el && this.el.querySelector('#err'); if (e) { e.textContent = text; e.hidden = false; e.style.color = 'var(--ok)'; } } },

  viewLabel() { return 'Sichtweite: ' + Game.settings.view; },

  main() {
    this.show('main', `<div class="panel main">
      <div class="logo">Tüftelinsel</div>
      <div class="tag">Bauen, buddeln, Inseln erkunden</div>
      <nav class="list">
        <button data-act="solo" autofocus>Allein spielen</button>
        <button data-act="multi">Mehrspieler</button>
        <button data-act="help">Steuerung</button>
        <button data-act="view">${this.viewLabel()}</button>
        <button data-act="sound">${Game.settings.sound ? 'Ton: an' : 'Ton: aus'}</button>
      </nav></div>`);
  },

  // Welt auswählen (allein oder als Gastgeber)
  async worlds(mode) {
    this._wmode = mode;
    const list = await Store.list();
    const host = mode === 'host';
    this.show('worlds', `<div class="panel narrow"><header><h2>${host ? 'Welt für die Runde' : 'Deine Inseln'}</h2><button class="backbtn" data-act="${host ? 'multi' : 'main'}">‹ Zurück</button></header>
      ${list.length ? `<ul class="worlds">${list.map(w => `<li><div class="wn"><b>${esc(w.name)}</b><small>${esc(ago(w.played))} · ${w.edits} Blöcke verändert</small></div>
        <button data-act="play:${esc(w.id)}" class="hot">${host ? 'Öffnen' : 'Spielen'}</button>
        <button data-act="export:${esc(w.id)}" title="Als Datei sichern">💾</button>
        <button data-act="delask:${esc(w.id)}" title="Löschen">🗑️</button></li>`).join('')}</ul>`
        : '<p class="note">Noch keine Insel gespeichert. Leg unten deine erste an!</p>'}
      <h3>Neue Insel</h3>
      <div class="newworld">
        <label class="field"><span>Name</span><input id="wname" maxlength="30" placeholder="Meine Insel" autocomplete="off"></label>
        <label class="field"><span>Startwert (leer = Zufall)</span><input id="wseed" maxlength="24" placeholder="z. B. Kokosnuss" autocomplete="off"></label>
        <button data-act="create">Erschaffen</button>
      </div>
      <p class="note"><button class="link" data-act="import">Insel aus Datei laden</button> · Gleicher Startwert = gleiche Insel</p>
      <p class="error" id="err" hidden></p></div>`);
  },

  delAsk(id) {
    Store.get(id).then(w => {
      if (!w) return;
      this.show('del', `<div class="panel narrow"><h2>Insel löschen?</h2><p class="note"><b>${esc(w.name)}</b> wird von diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen. Tipp: Vorher mit 💾 als Datei sichern.</p>
        <nav class="list row"><button data-act="worlds">Behalten</button><button data-act="del:${esc(id)}" class="hot">Löschen</button></nav></div>`);
    });
  },

  multi(invite) {
    const s = Game.settings;
    if (!Net.available()) { this.error('Der Mehrspieler-Modus konnte nicht geladen werden. Ist das Gerät mit dem Internet verbunden?'); return; }
    this.show('multi', `<div class="panel narrow"><header><h2>Mehrspieler</h2><button class="backbtn" data-act="main">‹ Zurück</button></header>
      ${invite ? `<p class="note">Du wurdest auf die Insel <b>${esc(invite)}</b> eingeladen. Gib deinen Namen ein und tippe auf <b>Beitreten</b>.</p>`
        : '<p class="note">Bis zu 4 Spieler bauen zusammen auf einer Insel, jeder auf seinem eigenen Gerät. Die Insel liegt beim Gastgeber.</p>'}
      <label class="field"><span>Dein Name</span><input id="pname" maxlength="16" value="${esc(s.name)}" autocomplete="off"></label>
      ${invite ? '' : '<nav class="list"><button data-act="hostpick" class="hot">Runde öffnen</button></nav>'}
      <div class="join">
        <label class="field"><span>Code einer Runde</span><input id="jcode" inputmode="numeric" maxlength="4" placeholder="1234" autocomplete="off" value="${esc(invite || '')}"></label>
        <button data-act="join" ${invite ? 'class="hot"' : ''}>Beitreten</button>
      </div>
      <p class="note"><button class="link" data-act="keyform">Verbindungseinstellungen</button>${Net.getKey() ? ' · Online-Schlüssel ist gespeichert' : ''}</p>
      <p class="error" id="err" hidden></p></div>`);
    this.el.querySelector('#jcode').addEventListener('keydown', e => { if (e.key === 'Enter') this.acts.join.call(this); });
  },

  readName() {
    const i = this.el && this.el.querySelector('#pname');
    if (i) { Game.settings.name = i.value.trim().slice(0, 16); Game.saveSettings(); }
  },

  lobby() {
    const S = Game.S; if (!S) return;
    const host = S.mode === 'host';
    const st = S.settings;
    const set = (label, k, v, step, show, min, max) => `<div class="set"><span>${label}</span><span class="val">
      ${host ? `<button data-act="set:${k}:${v - step}" ${v - step < min ? 'disabled' : ''}>−</button>` : ''}<b>${show}</b>${host ? `<button data-act="set:${k}:${v + step}" ${v + step > max ? 'disabled' : ''}>+</button>` : ''}</span></div>`;
    const keep = this.open === 'lobby' ? (this.el.querySelector('#chatin') || {}).value || '' : '';
    this.show('lobby', `<div class="panel wide"><header><h2>Lobby</h2><button class="backbtn" data-act="leave">Verlassen</button></header>
      <div class="lobby">
        <div>
          <div class="note">Code der Runde</div>
          <div class="code">${esc(S.code)}</div>
          <nav class="list row" style="justify-content:flex-start;margin-top:6px"><button data-act="invite">Einladen 🔗</button></nav>
          <h3>Spieler (${S.players.length}/${st.max})</h3>
          <ul class="players">${S.players.map(p => `<li><span class="dot" style="background:${hex(p.color)}"></span>${esc(p.name)}${p.id === 0 ? '<small>Gastgeber</small>' : ''}${p.id === Game.myId ? '<small>Du</small>' : ''}</li>`).join('')}</ul>
        </div>
        <div>
          <h3>Insel</h3>
          <p class="note" style="margin-top:0"><b style="color:var(--text)">${esc(st.world || '')}</b></p>
          ${set('Spieler höchstens', 'max', st.max, 1, st.max, Math.max(2, S.players.length), 4)}
          <h3>Chat</h3>
          <div class="chat"><div class="chatlog" id="chatlog"></div>
            <form id="chatform"><input id="chatin" maxlength="200" placeholder="Nachricht …" autocomplete="off" value="${esc(keep)}"><button>Senden</button></form></div>
        </div>
      </div>
      <nav class="list row">${host ? '<button data-act="start" class="hot">Los geht\'s!</button>' : '<p class="note">Warte, bis der Gastgeber startet …</p>'}</nav>
    </div>`);
    this.bindChat();
    this.refreshChat();
  },

  bindChat() {
    const f = this.el.querySelector('#chatform'); if (!f) return;
    f.addEventListener('submit', e => { e.preventDefault(); const i = f.querySelector('input'); Game.sendChat(i.value); i.value = ''; });
  },

  refreshChat() {
    const log = this.el && this.el.querySelector('#chatlog'); if (!log || !Game.S) return;
    log.innerHTML = Game.S.chat.map(e => e.sys ? `<div class="dim"><i>${esc(e.text)}</i></div>` : `<div><b style="color:${hex(e.color)}">${esc(e.name)}:</b>${esc(e.text)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  },

  pause(focusChat) {
    if (!Game.playing) return;
    const S = Game.S, solo = S.mode === 'solo', host = S.mode === 'host';
    this.show('pause', `<div class="panel narrow"><header><h2>Menü</h2>${S.code ? `<span class="note">Code <b style="color:var(--gold)">${esc(S.code)}</b></span>` : ''}</header>
      <nav class="list">
        <button data-act="resume" class="hot">Weiterspielen</button>
        ${host ? '<button data-act="invite">Mitspieler einladen 🔗</button>' : ''}
        <button data-act="help">Steuerung</button>
        <button data-act="view">${this.viewLabel()}</button>
        <button data-act="autojump">${Game.settings.autojump ? 'Automatisch hochspringen: an' : 'Automatisch hochspringen: aus'}</button>
        <button data-act="sound">${Game.settings.sound ? 'Ton: an' : 'Ton: aus'}</button>
        <button data-act="home">Zurück zum Startplatz</button>
        <button data-act="leave">${solo ? 'Speichern und zum Hauptmenü' : host ? 'Speichern und Runde beenden' : 'Runde verlassen'}</button>
      </nav>
      ${solo ? '' : `<h3>Chat</h3><div class="chat"><div class="chatlog" id="chatlog"></div>
        <form id="chatform"><input id="chatin" maxlength="200" placeholder="Nachricht …" autocomplete="off"><button>Senden</button></form></div>`}
    </div>`);
    this.bindChat();
    this.refreshChat();
    if (focusChat) { const i = this.el.querySelector('#chatin'); if (i) i.focus(); }
  },

  help(first) {
    const back = Game.playing ? 'resume' : 'main';
    this.show('help', `<div class="panel wide"><header><h2>${first ? 'Willkommen auf der Tüftelinsel!' : 'Steuerung'}</h2><button class="backbtn" data-act="${back}">${Game.playing ? 'Weiter' : '‹ Zurück'}</button></header>
      <p class="note">Die ganze Insel besteht aus Blöcken. Bau ab, was du willst, und bau damit, was dir einfällt: Hütten, Leuchttürme, Stege, Burgen. Im 🧱 Block-Menü findest du alle Blöcke für deine Schnellleiste.</p>
      <div class="lobby">
        <div><h3>iPad</h3><div class="help">
          <b>Linker Daumen</b><span>Laufen (irgendwo links aufsetzen)</span>
          <b>Rechts wischen</b><span>Umschauen</span>
          <b>🧱 Bauen</b><span>Block aus der Schnellleiste setzen (gedrückt halten = mehrere)</span>
          <b>⛏️ Abbauen</b><span>Block entfernen (gedrückt halten = mehrere)</span>
          <b>⤒</b><span>Springen, im Wasser: schwimmen, beim Fliegen: hoch</span>
          <b>🕊️</b><span>Fliegen an/aus, ⤓ = runter</span>
          <b>Schnellleiste</b><span>Fach antippen, um den Block zu wählen</span>
        </div></div>
        <div><h3>Tastatur und Maus</h3><div class="help">
          <b>WASD</b><span>Laufen</span>
          <b>Maus</b><span>Umschauen (ins Bild klicken)</span>
          <b>Linke Maustaste</b><span>Abbauen</span>
          <b>Rechte Maustaste</b><span>Bauen</span>
          <b>Mittlere Maustaste</b><span>Block unter dem Fadenkreuz in die Hand nehmen</span>
          <b>1–9, Mausrad</b><span>Fach der Schnellleiste</span>
          <b>Leertaste</b><span>Springen (2× schnell = Fliegen an/aus)</span>
          <b>Umschalt</b><span>Beim Fliegen runter</span>
          <b>E</b><span>Block-Menü</span>
          <b>T</b><span>Chat</span>
        </div></div>
      </div>
      <p class="note">Die Insel wird automatisch gespeichert. Mit 💾 in der Inselliste sicherst du sie als Datei, z. B. um sie auf ein anderes Gerät zu bringen.</p>
    </div>`);
  },

  keyform() {
    const k = Net.getKey() || {};
    this.show('key', `<div class="panel narrow"><header><h2>Verbindung</h2><button class="backbtn" data-act="multi">‹ Zurück</button></header>
      <p class="note">Damit es auch im Uni-WLAN klappt, braucht jedes Gerät einmal den Online-Schlüssel (Benutzername und Passwort des Verbindungsservers). Er bleibt nur auf diesem Gerät gespeichert. Wer über einen Einladungslink kommt, bekommt ihn automatisch. Ist er schon in Horizon Rush gespeichert, gilt er hier auch.</p>
      <label class="field"><span>Benutzername</span><input id="kuser" value="${esc(k.user || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <label class="field"><span>Passwort</span><input id="kpass" type="password" value="${esc(k.pass || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      <nav class="list row"><button data-act="savekey" class="hot">Speichern</button><button data-act="delkey">Löschen</button></nav></div>`);
  },

  wait(text) {
    this.show('wait', `<div class="panel narrow" style="text-align:center"><h2>${esc(text)}</h2><nav class="list row"><button data-act="leave">Abbrechen</button></nav></div>`);
  },

  error(text, back) {
    this._back = back || null;
    this.show('error', `<div class="panel narrow"><h2>Hoppla</h2><p class="error">${esc(text)}</p><nav class="list row"><button data-act="errback" class="hot">OK</button></nav></div>`);
  },

  acts: {
    main() { this.main(); },
    solo() { this.worlds('solo'); },
    worlds() { this.worlds(this._wmode || 'solo'); },
    multi() { this.readName(); this.multi(); },
    help() { this.help(); },
    sound(_, b) { Game.settings.sound = !Game.settings.sound; Audio.on = Game.settings.sound; Game.saveSettings(); b.textContent = Game.settings.sound ? 'Ton: an' : 'Ton: aus'; },
    view(_, b) {
      const i = VIEWS.indexOf(Game.settings.view);
      Game.settings.view = VIEWS[(i + 1) % VIEWS.length]; Game.saveSettings(); Game.applyView();
      b.textContent = this.viewLabel();
    },
    autojump(_, b) { Game.settings.autojump = !Game.settings.autojump; Game.saveSettings(); b.textContent = Game.settings.autojump ? 'Automatisch hochspringen: an' : 'Automatisch hochspringen: aus'; },
    hostpick() { this.readName(); this.worlds('host'); },
    async play(id) {
      const w = await Store.get(id);
      if (!w) { this.worlds(this._wmode); return; }
      if (this._wmode === 'host') Game.host(w); else Game.startSolo(w);
    },
    async create() {
      const name = (this.el.querySelector('#wname').value || '').trim().slice(0, 30) || 'Meine Insel';
      const seed = (this.el.querySelector('#wseed').value || '').trim().slice(0, 24);
      const w = Store.newWorld(name, seed || null);
      await Store.put(w);
      if (this._wmode === 'host') Game.host(w); else Game.startSolo(w);
    },
    async export(id) { const w = await Store.get(id); if (w) Store.exportWorld(w); },
    delask(id) { this.delAsk(id); },
    async del(id) { await Store.del(id); this.worlds(this._wmode); },
    import() {
      const f = $('importfile');
      f.value = '';
      f.onchange = async () => {
        const file = f.files && f.files[0]; if (!file) return;
        try { await Store.importFile(file); this.worlds(this._wmode); }
        catch (e) { const er = this.el.querySelector('#err'); if (er) { er.textContent = e.message || 'Die Datei konnte nicht gelesen werden.'; er.hidden = false; } }
      };
      f.click();
    },
    join() {
      this.readName();
      const c = (this.el.querySelector('#jcode').value || '').replace(/\D/g, '');
      if (c.length !== 4) { const e = this.el.querySelector('#err'); e.textContent = 'Bitte den 4-stelligen Code eingeben.'; e.hidden = false; return; }
      Game.join(c);
    },
    keyform() { this.readName(); this.keyform(); },
    savekey() { Net.setKey(this.el.querySelector('#kuser').value.trim(), this.el.querySelector('#kpass').value.trim()); this.multi(); },
    delkey() { Net.setKey(null, null); this.multi(); },
    leave() { if (Game.S && Game.S.mode === 'host') Net.broadcast({ t: 'end' }); setTimeout(() => Game.leave(), Game.S && Game.S.mode === 'host' ? 150 : 0); },
    set(a) { const [k, v] = a.split(':'); Game.setSetting(k, +v); },
    start() { Game.startHosted(); },
    invite() { Game.invite(); },
    home() { Game.goHome(); this.close(); if (!Game.touch) Game.lock(); },
    resume() { this.close(); if (!Game.touch) Game.lock(); },
    errback() { const b = this._back; this._back = null; if (b) b(); else this.main(); },
  },
};
