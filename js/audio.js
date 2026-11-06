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
  noise(dur, freq, vol) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  },
  dig() { this.noise(0.12, 1400, 0.35); this.tone(220, 90, 0.1, 'triangle', 0.08); },
  place() { this.noise(0.06, 700, 0.3); this.tone(180, 120, 0.08, 'sine', 0.18); },
  splash() { this.noise(0.25, 2400, 0.18); },
  pick() { this.tone(600, 900, 0.06, 'sine', 0.12); },
  error() { this.tone(180, 120, 0.2, 'square', 0.08); },
  click() { this.tone(800, 800, 0.03, 'square', 0.05); },
  fly() { this.tone(400, 900, 0.15, 'sine', 0.1); },
};
