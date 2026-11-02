// Tüftelinsel – Menüs: Start, Mehrspieler, Lobby mit Chat, Pause, Steuerung, Verbindungseinstellungen
import { Game } from './main.js';
import { Net } from './net.js';
import { Audio } from './audio.js';
import { COLORS } from './player.js';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hex = c => '#' + COLORS[c % COLORS.length].toString(16).padStart(6, '0');

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

  main() {
    this.show('main', `<div class="panel main">
      <div class="logo">Tüftelinsel</div>
      <div class="tag">Bauen, basteln, Unsinn machen</div>
      <nav class="list">
        <button data-act="solo" autofocus>Allein bauen</button>
        <button data-act="multi">Mehrspieler</button>
        <button data-act="help">Steuerung</button>
        <button data-act="sound">${Game.settings.sound ? 'Ton: an' : 'Ton: aus'}</button>
      </nav></div>`);
  },

  multi(invite) {
    const s = Game.settings;
    if (!Net.available()) { this.error('Der Mehrspieler-Modus konnte nicht geladen werden. Ist das Gerät mit dem Internet verbunden?'); return; }
    this.show('multi', `<div class="panel narrow"><header><h2>Mehrspieler</h2><button class="backbtn" data-act="main">‹ Zurück</button></header>
      ${invite ? `<p class="note">Du wurdest auf die Insel <b>${esc(invite)}</b> eingeladen. Gib deinen Namen ein und tippe auf <b>Beitreten</b>.</p>`
        : '<p class="note">Bis zu 4 Spieler bauen zusammen auf einer Insel, jeder auf seinem eigenen Gerät.</p>'}
      <label class="field"><span>Dein Name</span><input id="pname" maxlength="16" value="${esc(s.name)}" autocomplete="off"></label>
      ${invite ? '' : '<nav class="list"><button data-act="host" class="hot">Runde öffnen</button></nav>'}
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
          <h3>Einstellungen${host ? '' : ' (vom Gastgeber)'}</h3>
          ${set('Spieler höchstens', 'max', st.max, 1, st.max, Math.max(2, S.players.length), 4)}
          ${set('Teile pro Spieler', 'limit', st.limit, 10, st.limit, 10, 60)}
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

  pause() {
    if (!Game.playing) return;
    const S = Game.S, solo = S.mode === 'solo', host = S.mode === 'host';
    this.show('pause', `<div class="panel narrow"><header><h2>Menü</h2>${S.code ? `<span class="note">Code <b style="color:var(--gold)">${esc(S.code)}</b></span>` : ''}</header>
      <nav class="list">
        <button data-act="resume" class="hot">Weiterspielen</button>
        ${host ? '<button data-act="invite">Mitspieler einladen 🔗</button>' : ''}
        <button data-act="help">Steuerung</button>
        <button data-act="sound">${Game.settings.sound ? 'Ton: an' : 'Ton: aus'}</button>
        <button data-act="clear:mine">Meine Teile löschen</button>
        ${solo || host ? '<button data-act="clear:all">Ganze Insel aufräumen</button>' : ''}
        <button data-act="leave">${solo ? 'Zum Hauptmenü' : host ? 'Runde beenden' : 'Runde verlassen'}</button>
      </nav>
      ${solo ? '' : `<h3>Chat</h3><div class="chat"><div class="chatlog" id="chatlog"></div>
        <form id="chatform"><input id="chatin" maxlength="200" placeholder="Nachricht …" autocomplete="off"><button>Senden</button></form></div>`}
    </div>`);
    this.bindChat();
    this.refreshChat();
  },

  help(first) {
    const back = Game.playing ? 'resume' : 'main';
    this.show('help', `<div class="panel wide"><header><h2>${first ? 'Willkommen auf der Tüftelinsel!' : 'Steuerung'}</h2><button class="backbtn" data-act="${back}">${Game.playing ? 'Weiter' : '‹ Zurück'}</button></header>
      <p class="note">Hol dir Teile aus dem 📦 Bauteile-Menü und bau damit, was dir einfällt. Unten wählst du dein Werkzeug.</p>
      <div class="lobby">
        <div><h3>iPad</h3><div class="help">
          <b>Linker Daumen</b><span>Laufen (irgendwo links aufsetzen)</span>
          <b>Rechts wischen</b><span>Umschauen</span>
          <b>Große Taste</b><span>Werkzeug benutzen. Greifstrahl: einmal tippen = packen, nochmal = loslassen</span>
          <b>＋ − ⟳</b><span>Gehaltenes Teil weiter weg, näher, drehen (⟳ an: Wischen dreht das Teil)</span>
          <b>❄️</b><span>Zweite Funktion, z. B. Einfrieren</span>
          <b>👆</b><span>Benutzen: in einen Fahrersitz steigen, Düse an/aus</span>
          <b>⤒</b><span>Springen, im Sitz: Düsen zünden</span>
        </div></div>
        <div><h3>Tastatur und Maus</h3><div class="help">
          <b>WASD</b><span>Laufen / Fahren</span>
          <b>Maus</b><span>Umschauen (ins Bild klicken)</span>
          <b>Linke Maustaste</b><span>Werkzeug (Greifstrahl: gedrückt halten)</span>
          <b>Rechte Maustaste / F</b><span>Zweite Funktion</span>
          <b>Mausrad, R + Maus</b><span>Teil näher/weiter, drehen</span>
          <b>E</b><span>Benutzen</span>
          <b>Leertaste</b><span>Springen, im Sitz: Düsen</span>
          <b>1–9, Q</b><span>Werkzeug wählen</span>
          <b>Tab</b><span>Bauteile-Menü</span>
          <b>Z</b><span>Rückgängig</span>
        </div></div>
      </div>
      <h3>Ein Auto bauen</h3>
      <p class="note">Platte hinstellen und ❄️ einfrieren · Fahrersitz drauf, mit 🔥 an die Platte schweißen · mit ⚙️ vier Räder an die Seiten setzen · Platte wieder auftauen (❄️) · 👆 einsteigen und losfahren. Der Pfeil am Sitz zeigt nach vorn.</p>
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
    solo() { Game.startSolo(); },
    multi() { this.readName(); this.multi(); },
    help() { this.help(); },
    sound(_, b) { Game.settings.sound = !Game.settings.sound; Audio.on = Game.settings.sound; Game.saveSettings(); b.textContent = Game.settings.sound ? 'Ton: an' : 'Ton: aus'; },
    host() { this.readName(); Game.host(); },
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
    resume() { this.close(); if (!Game.touch) Game.lock(); },
    clear(a) { Game.cmd({ c: 'clear', all: a === 'all' }); this.close(); if (!Game.touch) Game.lock(); },
    errback() { const b = this._back; this._back = null; if (b) b(); else this.main(); },
  },
};
