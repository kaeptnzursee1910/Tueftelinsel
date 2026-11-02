// Tüftelinsel – Online-Multiplayer über WebRTC (PeerJS), aufgebaut wie bei Horizon Rush.
// Die Relay-Zugangsdaten stehen nicht im Code. Jedes Gerät gibt sie einmal ein ("Online-Schlüssel"),
// sie bleiben nur im Speicher dieses Browsers. Gleicher Speicherplatz wie Horizon Rush (gleiche Adresse).

export const Net = {
  PREFIX: 'tueftel-v1-',
  limit: 4,
  peer: null, isHost: false, conns: new Map(), hostConn: null, code: null,
  myId: null, onMsg: null, onDrop: null, nextId: 1,

  KEY_STORE: 'hr_online_key',
  getKey() {
    try { return JSON.parse(localStorage.getItem(this.KEY_STORE) || 'null'); } catch (_) { return null; }
  },
  setKey(user, pass) {
    try { if (user && pass) localStorage.setItem(this.KEY_STORE, JSON.stringify({ user, pass })); else localStorage.removeItem(this.KEY_STORE); } catch (_) { }
  },

  iceServers() {
    const ice = [{ urls: 'stun:stun.relay.metered.ca:80' }, { urls: 'stun:stun.l.google.com:19302' }];
    const k = this.getKey();
    if (k) {
      for (const u of ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp',
        'turn:global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443?transport=tcp']) {
        ice.push({ urls: u, username: k.user, credential: k.pass });
      }
    }
    return ice;
  },

  available() { return typeof window.Peer === 'function'; },

  makePeer(id) {
    const opts = Object.assign({ debug: 0, config: { iceServers: this.iceServers() } }, window.TF_PEER_SERVER || {});
    return id ? new Peer(id, opts) : new Peer(opts);
  },

  host(cb) {
    this.close();
    this.isHost = true; this.myId = 0; this.nextId = 1;
    const tryCode = (attempt) => {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const p = this.makePeer(this.PREFIX + code);
      let opened = false;
      p.on('open', () => { opened = true; this.peer = p; this.code = code; cb(null, code); });
      p.on('error', e => {
        if (!opened && e.type === 'unavailable-id' && attempt < 5) { p.destroy(); tryCode(attempt + 1); return; }
        if (!opened) cb(this.errText(e));
        else if (e.type !== 'peer-unavailable') console.warn('Netz', e);
      });
      p.on('disconnected', () => this.keepAlive(p));
      p.on('connection', conn => this.acceptConn(conn));
    };
    tryCode(0);
  },

  // Der Gastgeber bleibt beim Vermittlungsserver angemeldet, sonst finden neue Mitspieler seinen Code nicht mehr
  keepAlive(p) {
    clearTimeout(this._ka);
    if (this.peer !== p || p.destroyed || !p.disconnected) return;
    try { p.reconnect(); } catch (_) { }
    this._ka = setTimeout(() => this.keepAlive(p), 4000);
  },

  acceptConn(conn) {
    conn.on('open', () => {
      if (this.conns.size >= this.limit - 1) { conn.send({ t: 'full', max: this.limit }); setTimeout(() => conn.close(), 300); return; }
      const id = this.nextId++;
      conn.tfId = id;
      this.conns.set(id, conn);
      conn.on('data', d => this.onMsg && this.onMsg(d, id));
      conn.on('close', () => this.drop(id));
      conn.on('error', () => this.drop(id));
      this.watchIce(conn, () => this.drop(id));
      conn.send({ t: 'welcome', id });
    });
  },

  drop(id) {
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
    if (this.onDrop) this.onDrop(id);
  },

  join(code, cb, attempt) {
    attempt = attempt || 0;
    this.close();
    this.isHost = false;
    const p = this.makePeer();
    let done = false;
    const fail = msg => { if (done) return; done = true; cb(msg); this.close(); };
    const timer = setTimeout(() => fail('Keine Verbindung zum Gastgeber. Bitte den Code prüfen und es erneut versuchen.'), 20000);
    p.on('open', () => {
      this.peer = p;
      const conn = p.connect(this.PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('data', d => {
        if (d.t === 'welcome' && !done) { done = true; clearTimeout(timer); this.myId = d.id; this.hostConn = conn; this.code = code; cb(null, d.id); return; }
        if (d.t === 'full') { clearTimeout(timer); fail('Hier ist schon alles voll (maximal ' + (d.max || this.limit) + ' Spieler).'); return; }
        if (this.onMsg) this.onMsg(d, 0);
      });
      const lost = () => { if (done && this.hostConn === conn) { this.hostConn = null; if (this.onDrop) this.onDrop(0); } };
      conn.on('close', lost);
      conn.on('error', lost);
      this.watchIce(conn, lost);
    });
    p.on('error', e => {
      clearTimeout(timer);
      if (!done && e.type === 'peer-unavailable' && attempt < 1) { done = true; this.close(); setTimeout(() => this.join(code, cb, attempt + 1), 2000); return; }
      if (!done) fail(this.errText(e)); else if (e.type === 'peer-unavailable' || e.type === 'network') { if (this.onDrop) this.onDrop(0); }
    });
  },

  watchIce(conn, onDead) {
    const pc = conn.peerConnection;
    if (!pc) return;
    pc.addEventListener('iceconnectionstatechange', () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') onDead();
    });
  },

  errText(e) {
    switch (e && e.type) {
      case 'peer-unavailable': return 'Keine Runde mit diesem Code gefunden.';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
        return 'Keine Verbindung zum Vermittlungsserver. Ist das Gerät online?';
      case 'browser-incompatible': return 'Dieser Browser unterstützt kein WebRTC.';
      default: return 'Verbindungsfehler: ' + ((e && (e.type || e.message)) || 'unbekannt');
    }
  },

  send(msg) { if (this.hostConn && this.hostConn.open) try { this.hostConn.send(msg); } catch (_) { } },
  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) try { c.send(msg); } catch (_) { } },
  sendTo(id, msg) { const c = this.conns.get(id); if (c && c.open) try { c.send(msg); } catch (_) { } },
  kick(id) { const c = this.conns.get(id); if (c) try { c.close(); } catch (_) { } },

  active() { return !!this.peer && (this.isHost || !!this.hostConn); },

  close() {
    for (const c of this.conns.values()) try { c.close(); } catch (_) { }
    this.conns.clear();
    if (this.hostConn) try { this.hostConn.close(); } catch (_) { }
    this.hostConn = null;
    if (this.peer) try { this.peer.destroy(); } catch (_) { }
    this.peer = null; this.code = null; this.isHost = false; this.myId = null;
  },
};
