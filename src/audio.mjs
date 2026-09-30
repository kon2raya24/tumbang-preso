// Sound for Tumbang Preso. Real recordings (CC0, from Kenney): the tin lata knocked and clattering, the
// slap of a rubber tsinelas, footsteps on concrete, a dive, a tag. Around them, synthesized: a playful
// street tune, the whoosh of a throw, the neighbours murmuring and cheering, the taya's count, and
// Nanay's bell at six. Nothing plays until start() runs from a user gesture; the recordings load then.
const SAMPLES = { tin: 5, metal: 5, slap: 5, step_concrete: 5, soft_m: 3, soft_h: 2, punch_m: 2 };
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
const TUNE = [[72, 76, 79, 76], [74, 77, 81, 77], [72, 76, 79, 84], [79, 77, 74, 71]];
const BASS = [48, 50, 45, 43];

export function createAudio({ base = 'assets/sfx/' } = {}) {
  let ctx = null, master = null, music = null, sfx = null, noise = null, muted = false, murmur = null;
  const buf = {};
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
    for (const [k, n] of Object.entries(SAMPLES)) for (let i = 0; i < n; i++) fetch(`${base}${k}${i}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((a) => ctx.decodeAudioData(a)).then((b) => { buf[k + i] = b; }).catch(() => { /* synth only */ });
    // the barangay in the afternoon: people talking somewhere, swelling and falling
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise; src.loop = true; f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.7; g.gain.value = 0;
    src.connect(f).connect(g).connect(master); src.start(); murmur = g;
  }
  // one of a recording's takes, a little higher or lower each time
  function play(name, gain = 1, rate = 1, vary = 0.08, when = 0) {
    if (!ctx || muted) return false;
    const takes = Array.from({ length: SAMPLES[name] || 0 }, (_, i) => buf[name + i]).filter(Boolean);
    if (!takes.length) return false;
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = takes[Math.floor(Math.random() * takes.length)]; s.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * vary);
    g.gain.value = gain; s.connect(g).connect(sfx); s.start(ctx.currentTime + when);
    return true;
  }
  // the neighbours: a cheer, bigger for a knock
  function cheer(big) { hiss(big ? 1.8 : 0.9, 700, big ? 0.12 : 0.05, 0, 'bandpass', 900); hiss(big ? 1.5 : 0.7, 2200, big ? 0.05 : 0.02, 0, 'bandpass'); }
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
      if (live && me && me.speed > 1 && (stepT -= dt) <= 0) { stepT = 1.6 / me.speed; if (!play('step_concrete', 0.35, 1, 0.12)) hiss(0.04, 900, 0.035, 0, 'lowpass'); }
      if (murmur) murmur.gain.setTargetAtTime(live ? 0.035 + Math.sin(ctx.currentTime * 0.3) * 0.015 : 0.02, ctx.currentTime, 0.8);
    },
    event(e, g) {
      if (!ctx || muted) return;
      const mine = e.kid !== undefined && g.kids[e.kid] && g.kids[e.kid].you;
      switch (e.type) {
        case 'go': tone(1800, 0.25, 'sine', 0.05, 0, 1.1); tone(1800, 0.4, 'sine', 0.05, 0.3, 1.2); break; // a whistle
        case 'throw': hiss(0.3, 700, mine ? 0.1 : 0.04, 0, 'bandpass', 2500); break;
        case 'bounce': case 'land': if (!play('slap', e.type === 'land' ? 0.7 : 0.45, 1.25)) { hiss(0.06, 1800, 0.06); tone(180, 0.06, 'square', 0.02); } break; // pak!
        case 'knock': if (!play('tin', 1.2, 1)) clang(0, 0.07); play('metal', 0.5, 1.4); [0, 4, 7, 12].forEach((k, i) => tone(NOTE(72 + k), 0.12, 'square', mine ? 0.04 : 0.02, 0.15 + i * 0.07)); cheer(true); break;
        case 'clang': if (!play('tin', 0.45, 1.15)) clang(0, 0.03); break;
        case 'canSet': if (!play('metal', 0.5, 0.9)) { tone(300, 0.08, 'square', 0.04); clang(0.05, 0.02); } break;
        case 'tag': play('punch_m', 0.6, 1.3); tone(520, 0.18, 'triangle', 0.07, 0, 0.5); tone(260, 0.3, 'square', 0.03, 0.12, 0.7); cheer(false); break;
        case 'dive': if (!play('soft_h', 0.8, 0.9)) hiss(0.25, 400, 0.08, 0, 'lowpass'); hiss(0.25, 400, 0.04, 0, 'lowpass'); break;
        case 'pickup': [0, 7].forEach((k, i) => tone(NOTE(79 + k), 0.08, 'triangle', 0.04, i * 0.05)); break;
        case 'home': [0, 4, 7].forEach((k, i) => tone(NOTE(76 + k), 0.1, 'triangle', 0.05, i * 0.06)); break;
        case 'count': tone(e.n === 0 ? 880 : 660, 0.12, 'square', 0.04); break;
        case 'over': for (let k = 0; k < 6; k++) tone(k % 2 ? 784 : 988, 0.5, 'sine', 0.05, k * 0.35); break; // Nanay's bell
        default: break;
      }
    },
  };
}
