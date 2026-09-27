'use strict';
// ===== WebAudio 合成音效 =====
const SFX = (() => {
  let ctx = null, master = null, muted = false, noiseBuf = null;
  try { muted = localStorage.getItem('smb_muted') === '1'; } catch (e) {}
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.35; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function tone(freq, dur, type = 'square', vol = 0.3, slide = 0, delay = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.3, freq = 1200, q = 1, delay = 0, type = 'bandpass') {
    if (!ctx || muted) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  const lib = {
    swing: () => noise(0.12, 0.18, 2500, 2),
    hit: () => { noise(0.1, 0.4, 900, 1); tone(140, 0.1, 'square', 0.2, 0.5); },
    heavy: () => { noise(0.2, 0.5, 400, 1); tone(90, 0.2, 'sawtooth', 0.25, 0.4); },
    block: () => tone(900, 0.08, 'triangle', 0.25, 0.8),
    jump: () => tone(300, 0.12, 'square', 0.12, 2),
    land: () => noise(0.06, 0.15, 300, 1),
    fire: () => { noise(0.35, 0.3, 700, 0.7); tone(220, 0.3, 'sawtooth', 0.12, 0.5); },
    boom: () => { noise(0.5, 0.55, 250, 0.6, 0, 'lowpass'); tone(70, 0.4, 'sine', 0.4, 0.4); },
    ice: () => { for (let i = 0; i < 5; i++) tone(1200 + i * 300, 0.25, 'triangle', 0.1, 1.2, i * 0.03); },
    thunder: () => { noise(0.6, 0.6, 1500, 0.3); tone(60, 0.5, 'sawtooth', 0.3, 0.5); },
    arrow: () => { noise(0.08, 0.2, 4000, 3); tone(700, 0.08, 'triangle', 0.08, 1.5); },
    heal: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'sine', 0.15, 1, i * 0.08)); },
    magic: () => tone(500, 0.25, 'sine', 0.2, 2.5),
    dash: () => noise(0.25, 0.25, 1500, 1.5),
    pickup: () => { tone(660, 0.08, 'square', 0.12); tone(990, 0.1, 'square', 0.12, 1, 0.07); },
    drink: () => { tone(400, 0.1, 'sine', 0.2, 1.8); tone(600, 0.15, 'sine', 0.2, 1.8, 0.1); },
    throw: () => noise(0.15, 0.2, 1800, 2),
    break: () => { noise(0.2, 0.35, 1800, 0.8); tone(200, 0.1, 'square', 0.1, 0.5); },
    ko: () => { tone(300, 0.5, 'sawtooth', 0.2, 0.3); },
    select: () => tone(880, 0.06, 'square', 0.12),
    confirm: () => { tone(660, 0.08, 'square', 0.15); tone(1320, 0.12, 'square', 0.15, 1, 0.08); },
    go: () => { tone(784, 0.1, 'square', 0.15); tone(1047, 0.15, 'square', 0.15, 1, 0.1); },
    clear: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.13, 1, i * 0.11)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'triangle', 0.2, 1, i * 0.2)); },
    boss: () => { [110, 104, 98].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.2, 1, i * 0.3)); },
  };
  return {
    init,
    play(name) { try { init(); lib[name] && lib[name](); } catch (e) {} },
    toggle() {
      muted = !muted; try { localStorage.setItem('smb_muted', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    get muted() { return muted; },
  };
})();
