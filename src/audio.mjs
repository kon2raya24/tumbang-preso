// Synthesized sound for Tumbang Preso: a playful street tune, the whoosh of a thrown tsinelas, the
// "pak!" when it lands, the clang of the lata, footsteps, the taya's count, and Nanay's bell at six.
// Nothing plays until start() runs from a user gesture.
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
const TUNE = [[72, 76, 79, 76], [74, 77, 81, 77], [72, 76, 79, 84], [79, 77, 74, 71]];
const BASS = [48, 50, 45, 43];

export function createAudio() {
  let ctx = null, master = null, music = null, sfx = null, noise = null, muted = false;
  let step = 0, nextAt = 0, playing = false, tempo = 112, stepT = 0;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
    music = ctx.createGain(); music.gain.value = 0; music.connect(master);
    sfx = ctx.createGain(); sfx.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setInterval(schedule, 50);
  }
  function tone(freq, dur, type = 'triangle', gain = 0.05, when = 0, bend = 0, out = sfx) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(dur, freq, gain, when = 0, type = 'bandpass', to = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise; f.type = type; f.frequency.setValueAtTime(freq, t); if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  // an empty tin can: a few inharmonic partials that ring out
  function clang(when = 0, gain = 0.06) { for (const [r, g] of [[1, 1], [2.76, 0.6], [5.4, 0.4], [8.93, 0.25]]) tone(620 * r, 0.5 / Math.sqrt(r), 'sine', gain * g, when); hiss(0.08, 5000, 0.08, when, 'highpass'); }
  // a marimba-ish pluck for the tune
  function pluck(n, when, gain = 0.03) { tone(NOTE(n), 0.25, 'sine', gain, when, 0, music); tone(NOTE(n) * 4, 0.05, 'sine', gain * 0.3, when, 0, music); }
  function schedule() {
    if (!ctx || !playing || muted) return;
    const eighth = 30 / tempo;
    if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;
    while (nextAt < ctx.currentTime + 0.2) {
      const when = nextAt - ctx.currentTime, bar = Math.floor(step / 8) % 4, s = step % 8;
      if (s % 2 === 0) pluck(TUNE[bar][(s / 2) % 4], when);
      if (s === 5) pluck(TUNE[bar][2] + 12, when, 0.015);
      if (s === 0 || s === 4) tone(NOTE(BASS[bar]), eighth * 1.6, 'triangle', 0.06, when, 0, music);
      if (s % 4 === 2) hiss(0.04, 6000, 0.02, when, 'highpass');
      nextAt += eighth; step++;
    }
  }
  return {
    start,
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.7; },
    update(g, on, dt) {
      if (!ctx) return;
      const live = on && g && g.phase === 'play';
      if (live !== playing) { playing = live; if (live) nextAt = ctx.currentTime + 0.05; }
      music.gain.setTargetAtTime(live ? 0.8 : 0, ctx.currentTime, 0.3);
      tempo = 108 + Math.floor((g ? g.t / g.limit : 0) * 24);
      const me = g && g.kids.find((k) => k.you);
      if (live && me && me.speed > 1 && (stepT -= dt) <= 0) { stepT = 1.6 / me.speed; hiss(0.04, 900, 0.035, 0, 'lowpass'); }
    },
    event(e, g) {
      if (!ctx || muted) return;
      const mine = e.kid !== undefined && g.kids[e.kid] && g.kids[e.kid].you;
      switch (e.type) {
        case 'go': tone(1800, 0.25, 'sine', 0.05, 0, 1.1); tone(1800, 0.4, 'sine', 0.05, 0.3, 1.2); break; // a whistle
        case 'throw': hiss(0.3, 700, mine ? 0.1 : 0.04, 0, 'bandpass', 2500); break;
        case 'bounce': case 'land': hiss(0.06, 1800, 0.06); tone(180, 0.06, 'square', 0.02); break; // pak!
        case 'knock': clang(0, 0.07); [0, 4, 7, 12].forEach((k, i) => tone(NOTE(72 + k), 0.12, 'square', mine ? 0.04 : 0.02, 0.15 + i * 0.07)); break;
        case 'clang': clang(0, 0.03); break;
        case 'canSet': tone(300, 0.08, 'square', 0.04); clang(0.05, 0.02); break;
        case 'tag': tone(520, 0.18, 'triangle', 0.07, 0, 0.5); tone(260, 0.3, 'square', 0.03, 0.12, 0.7); break;
        case 'dive': hiss(0.25, 400, 0.08, 0, 'lowpass'); break;
        case 'pickup': [0, 7].forEach((k, i) => tone(NOTE(79 + k), 0.08, 'triangle', 0.04, i * 0.05)); break;
        case 'home': [0, 4, 7].forEach((k, i) => tone(NOTE(76 + k), 0.1, 'triangle', 0.05, i * 0.06)); break;
        case 'count': tone(e.n === 0 ? 880 : 660, 0.12, 'square', 0.04); break;
        case 'over': for (let k = 0; k < 6; k++) tone(k % 2 ? 784 : 988, 0.5, 'sine', 0.05, k * 0.35); break; // Nanay's bell
        default: break;
      }
    },
  };
}
