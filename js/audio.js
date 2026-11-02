// Tüftelinsel – kleine, selbst erzeugte Geräusche (Web Audio, keine Sounddateien)
export const Audio = {
  ctx: null, on: true,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { this.ctx = null; }
  },
  tone(f1, f2, dur, type, vol) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  },
  spawn() { this.tone(300, 700, 0.12, 'triangle', 0.18); },
  remove() { this.tone(500, 120, 0.18, 'square', 0.08); },
  weld() { this.tone(900, 1400, 0.08, 'sawtooth', 0.07); setTimeout(() => this.tone(1200, 800, 0.1, 'sawtooth', 0.06), 70); },
  pick() { this.tone(600, 900, 0.06, 'sine', 0.12); },
  grab() { this.tone(200, 420, 0.15, 'triangle', 0.14); },
  drop() { this.tone(420, 180, 0.12, 'triangle', 0.12); },
  freeze() { this.tone(1500, 2400, 0.15, 'sine', 0.1); },
  error() { this.tone(180, 120, 0.2, 'square', 0.08); },
  click() { this.tone(800, 800, 0.03, 'square', 0.05); },
};
