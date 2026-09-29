// The page: screens, input (keyboard, a gamepad, the touch stick and buttons), aiming, the HUD, sound
// and saves. The rules live in sim.mjs and the street in view3d.mjs.
import { createGame, step, you, taya, isHome, slipOf, yawTo, powerFor, taggable, DIFFICULTY, NOINPUT } from './sim.mjs';
import { createView } from './view3d.mjs';
import { createAudio } from './audio.mjs';

const Q = new URLSearchParams(location.search);
const TEST = Q.get('test') === '1';
const KEY = 'tumbangpreso.v1';
const store = {
  get() { if (TEST) return null; try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  set(v) { if (TEST) return; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable: play on */ } },
};
const touch = matchMedia('(pointer: coarse)').matches;
const saved = store.get() || {};
const data = {
  best: saved.best && typeof saved.best === 'object' ? saved.best : {}, muted: !!saved.muted, calm: !!saved.calm,
  difficulty: DIFFICULTY[saved.difficulty] ? saved.difficulty : 'madali', hints: Array.isArray(saved.hints) ? saved.hints : [], how: !!saved.how,
  view: saved.view === 'chase' ? 'chase' : 'fp',
};
const firstPerson = () => data.view === 'fp';
const persist = () => store.set(data);
const reduced = () => data.calm || matchMedia('(prefers-reduced-motion: reduce)').matches;
const seed = () => (TEST && Q.get('seed') ? Number(Q.get('seed')) : Math.floor(Math.random() * 1e9));
const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerpAngle = (a, b, k) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * k;
const buzz = (p) => { try { if (navigator.vibrate && touch) navigator.vibrate(p); } catch { /* no haptics */ } };

let view = null;
const A = createAudio();
A.setMuted(data.muted);
let mode = 'title', game = createGame({ seed: seed(), demo: true, difficulty: 'katamtaman' });

const SCREENS = ['title', 'how', 'pause', 'over'];
function show(name) {
  for (const id of SCREENS) $(id).hidden = id !== name;
  document.body.classList.toggle('playing', name === null);
  $('hud').hidden = name !== null && name !== 'pause';
  const first = name && ($(name).querySelector('button.primary') || $(name).querySelector('button'));
  if (first) first.focus({ preventScroll: true });
}

function start() {
  A.start();
  if (!data.how && !TEST) { mode = 'how'; show('how'); return; }
  game = createGame({ seed: seed(), difficulty: data.difficulty });
  mode = 'play'; aim = null; cam.yaw = view.autoYaw(game); cam.pitch = PITCH; cam.turnTo = null; cam.manual = 9; clearInput();
  show(null);
  lock();
  toast('MAIBA TAYA!', `Si ${taya(game).name} ang taya.`, 2200);
  if (!touch && firstPerson()) hint('fp', canLock ? 'Mouse: tumingin · Click o Space: ibato · WASD: lakad · V: ibang camera' : 'I-drag ang mouse para tumingin · Space: ibato · WASD: lakad · V: ibang camera');
}

// ---------- input ----------
const keys = new Set();
let pressedAct = false, pad = null, stick = null, dragCam = 0, actHeld = false, runHeld = false, mouseHeld = false;
const PITCH = -0.06;
const cam = { yaw: 0, pitch: PITCH, manual: 9, turnTo: null };
let aim = null; // { t, off } while you hold to aim
function clearInput() { keys.clear(); pressedAct = false; actHeld = false; runHeld = false; mouseHeld = false; aim = null; stick = null; }
// Looking around: yaw grows to the left, so turning right takes it down. Any look cancels an auto-turn.
function look(dYaw, dPitch = 0) {
  cam.yaw -= dYaw; cam.manual = 0; cam.turnTo = null;
  if (firstPerson()) cam.pitch = clamp(cam.pitch - dPitch, -1.0, 0.75);
}

// the mouse, locked to the game in first person: move to look, hold the button to aim
const canLock = !touch && 'requestPointerLock' in HTMLElement.prototype;
let locked = false, releasing = false;
function lock() { if (canLock && firstPerson() && mode === 'play' && !locked) { try { const p = $('view').requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed here: drag to look instead */ } } }
function unlock() { if (locked) { releasing = true; document.exitPointerLock(); } }
document.addEventListener('pointerlockchange', () => {
  const was = locked;
  locked = document.pointerLockElement === $('view');
  if (was && !locked && mode === 'play' && !releasing) pause(); // Esc lets go of the mouse: stop the game too
  releasing = false;
});
document.addEventListener('mousemove', (e) => { if (locked && mode === 'play') look(e.movementX * 0.0024, e.movementY * 0.0024); });
const ACT = ['Space', 'KeyJ', 'Enter'], RUN = ['ShiftLeft', 'ShiftRight', 'KeyK'];
document.addEventListener('keydown', (e) => {
  if (mode === 'play') {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!e.repeat && ACT.includes(e.code)) pressedAct = true;
    keys.add(e.code);
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); }
  if (e.code === 'KeyM') toggleSound();
  if (e.code === 'KeyV' && !e.repeat) toggleView();
  if ((e.code === 'Space' || e.code === 'Enter') && mode === 'title' && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); start(); }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', clearInput);

// a controller: left stick runs, right stick turns the camera, ✕ throws (or dives as taya), ○ or R2 sprints
let padHeld = false;
function readPad() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const p = pads[0];
  if (!p) return null;
  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
  const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
  const x = dz(p.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), y = -dz(p.axes[1] || 0) + (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
  const act = b(0);
  if (act && !padHeld) pressedAct = true;
  padHeld = act;
  if (b(9) && mode === 'play' && !readPad.opt) pause();
  readPad.opt = b(9);
  if (b(3) && !readPad.tri) toggleView();
  readPad.tri = b(3);
  return { x, y, cx: dz(p.axes[2] || 0), cy: dz(p.axes[3] || 0), act, run: b(1) || b(7) || b(5) };
}
window.addEventListener('gamepadconnected', () => toast('🎮 Controller', 'L-stick: takbo · R-stick: tingin · ✕: ibato/sugod · ○: bilis · △: camera', 3200));

// touch: a stick wherever your left thumb lands, buttons on the right, drag the right side to look
const stage = $('stage');
stage.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') {
    if (e.button !== 0 || mode !== 'play' || e.target.closest('button')) return;
    if (locked) { pressedAct = true; mouseHeld = true; } else if (canLock && firstPerson()) lock(); else dragCam = e.clientX;
    return;
  }
  if (mode !== 'play' || e.target.closest('button')) return;
  A.start();
  const r = stage.getBoundingClientRect();
  if (e.clientX - r.left < r.width * 0.5) { stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: 0, y: 0 }; showStick(e.clientX - r.left, e.clientY - r.top); }
  else dragCam = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
stage.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { if (typeof dragCam === 'number' && dragCam && e.buttons & 1) { look((e.clientX - dragCam) * 0.006); dragCam = e.clientX; } return; }
  if (stick && e.pointerId === stick.id) {
    const dx = e.clientX - stick.x0, dy = e.clientY - stick.y0, d = Math.hypot(dx, dy), max = 56;
    stick.x = (dx / Math.max(d, 1)) * Math.min(1, d / max); stick.y = (-dy / Math.max(d, 1)) * Math.min(1, d / max);
    moveKnob(stick.x * max, -stick.y * max);
  } else if (dragCam && dragCam.id === e.pointerId) { look((e.clientX - dragCam.x) * 0.007, (e.clientY - dragCam.y) * 0.006); dragCam.x = e.clientX; dragCam.y = e.clientY; }
});
const endTouch = (e) => { if (stick && e.pointerId === stick.id) { stick = null; $('stick').hidden = true; } if (dragCam && dragCam.id === e.pointerId) dragCam = 0; if (e.pointerType === 'mouse') { dragCam = 0; mouseHeld = false; } };
stage.addEventListener('pointerup', endTouch); stage.addEventListener('pointercancel', endTouch);
function showStick(x, y) { const s = $('stick'); s.hidden = false; s.style.left = `${x}px`; s.style.top = `${y}px`; moveKnob(0, 0); }
function moveKnob(x, y) { $('knob').style.transform = `translate(${x}px, ${y}px)`; }
const holdBtn = (id, on, off) => {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); A.start(); b.setPointerCapture(e.pointerId); on(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, off);
};
holdBtn('btn-act', () => { pressedAct = true; actHeld = true; }, () => { actHeld = false; });
holdBtn('btn-run', () => { runHeld = true; }, () => { runHeld = false; });

// ---------- aiming ----------
// Hold to aim at the lata; left and right nudge the aim, and the power swings up and down: let go at
// the right moment. Madali shows the whole arc, Katamtaman half of it, Mahirap none.
const meter = (t) => 0.5 - 0.5 * Math.cos((TAU * t) / game.diff.meter);
function canThrow(me) { return me && me.role === 'thrower' && me.hasSlip && isHome(me) && me.cool <= 0 && game.can.state === 'up'; }

function gather(dt) {
  const me = you(game);
  pad = readPad();
  const k = (c) => keys.has(c), fps = firstPerson();
  // first person: A and D step sideways, the arrows and Q/E turn; the chase camera: the arrows run
  let x = (k('KeyD') || (!fps && k('ArrowRight')) ? 1 : 0) - (k('KeyA') || (!fps && k('ArrowLeft')) ? 1 : 0);
  let y = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
  if (pad) { x += pad.x; y += pad.y; }
  if (stick) { x += stick.x; y += stick.y; }
  const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
  const turn = (k('KeyE') || (fps && k('ArrowRight')) ? 1 : 0) - (k('KeyQ') || (fps && k('ArrowLeft')) ? 1 : 0);
  if (turn) look(turn * dt * (aim ? 0.6 : 2.4));
  if (pad && (pad.cx || pad.cy)) look(pad.cx * dt * (aim ? 1.2 : 3.2), pad.cy * dt * 1.8);
  const held = ACT.some(k) || (pad && pad.act) || actHeld || mouseHeld;
  const sprint = RUN.some(k) || (pad && pad.run) || runHeld;
  let input = { ...NOINPUT };
  if (me.role === 'thrower') {
    if (!aim && pressedAct && canThrow(me)) aim = { t: 0, off: 0 };
    if (aim) {
      if (!canThrow(me)) aim = null;
      else if (held) { aim.t += dt; if (fps) { if (x) look(x * dt * 0.5); } else aim.off = clamp(aim.off - x * dt * 0.55, -0.4, 0.4); }
      else { input.throw = { yaw: aimYaw(me), power: meter(aim.t) }; aim = null; }
    }
    if (!aim) { const b = view.basis(); input.move = { x: b.fx * y + b.rx * x, z: b.fz * y + b.rz * x }; input.sprint = sprint; }
  } else {
    aim = null;
    const b = view.basis();
    input.move = { x: b.fx * y + b.rx * x, z: b.fz * y + b.rz * x };
    if (pressedAct) input.dive = true;
  }
  pressedAct = false;
  return input;
}
// First person throws where you look; the chase camera aims at the can, nudged left or right.
const aimYaw = (me) => (firstPerson() ? cam.yaw : yawTo(me.x, me.z, game.can.x, game.can.z) + aim.off);

// ---------- the HUD ----------
const hudEl = { cross: $('cross'), score: $('score'), clock: $('clock'), role: $('role'), prompt: $('prompt'), meter: $('meter'), fill: $('meter-fill'), sweet: $('meter-sweet'), act: $('btn-act') };
function hud() {
  const g = game, me = you(g);
  hudEl.score.textContent = String(g.score);
  const mins = Math.min(59, Math.floor((g.t / g.limit) * 60));
  hudEl.clock.textContent = `5:${String(mins).padStart(2, '0')} PM`;
  hudEl.clock.classList.toggle('late', mins >= 50);
  const t = me.role === 'taya';
  hudEl.role.textContent = t ? 'IKAW ANG TAYA!' : 'TAGABATO';
  hudEl.role.classList.toggle('taya', t);
  hudEl.act.textContent = t ? 'SUGOD' : 'IBATO';
  let p = '';
  const s = slipOf(g, me);
  if (t) p = me.count > 0 ? `Bilang muna... ${Math.ceil(me.count)}` : g.can.state === 'up' ? 'Habulin ang nasa labas ng linya! (Pindot: sugod)' : 'Natumba! Kunin ang lata at itayo sa bilog!';
  else if (aim) p = 'Bitawan sa tamang lakas!';
  else if (me.hasSlip && isHome(me)) p = g.can.state === 'up' ? (touch ? 'Pindutin nang matagal ang IBATO, bitawan para ibato.' : 'Pindutin nang matagal ang SPACE, bitawan para ibato.') : 'Nakatumba ang lata! Hintayin itayo ng taya.';
  else if (me.hasSlip) p = 'Takbo pauwi sa likod ng linya!';
  else if (s.state === 'ground') p = !taggable(g, me) && !isHome(me) ? 'Ligtas ka habang nakatapak sa tsinelas mo.' : g.can.state !== 'up' ? 'Bilis! Kunin ang tsinelas habang nakatumba ang lata!' : 'Kunin ang tsinelas mo. Ingat sa taya!';
  hudEl.prompt.textContent = p;
  hudEl.meter.hidden = !aim;
  hudEl.cross.hidden = !firstPerson();
  if (aim) {
    hudEl.fill.style.width = `${meter(aim.t) * 100}%`;
    const want = powerFor(me.x, me.z, game.can.x, game.can.z);
    hudEl.sweet.style.left = `${want * 100}%`;
    hudEl.sweet.hidden = g.diff.preview <= 0;
  }
}

let toastT = 0;
function toast(big, small = '', ms = 1500) {
  const el = $('toast');
  el.innerHTML = '<b></b><span></span>';
  el.querySelector('b').textContent = big; el.querySelector('span').textContent = small;
  el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  toastT = ms / 1000;
}
function hint(id, text) { if (data.hints.includes(id)) return; data.hints.push(id); persist(); setTimeout(() => toast('Tip', text, 3200), 300); }

function onEvent(e) {
  view.event(e, game);
  A.event(e, game);
  const me = you(game), mine = e.kid === me.i;
  switch (e.type) {
    case 'go': A.start(); break;
    case 'knock': if (mine) { toast('NATUMBA!', `+${e.points}${e.saves ? ` · SALBA ×${e.saves}` : ''}`); buzz(40); } else if (me.role === 'thrower' && !me.hasSlip) toast(`Natumba ni ${game.kids[e.kid].name}!`, 'Kunin na ang tsinelas mo!'); else if (me.role === 'taya') toast('Natumba ang lata!', 'Itayo mo agad sa bilog!'); break;
    case 'tag':
      if (e.kid === me.i || e.taya === me.i) cam.turnTo = view.autoYaw(game);
      if (e.kid === me.i) { toast('TAYA KA!', `Nahuli ka ni ${game.kids[e.taya].name}.`, 1800); buzz([60, 40, 60]); hint('taya', 'Ikaw ang taya: habulin ang nasa labas ng linya habang nakatayo ang lata. Kapag natumba, itayo muna!'); }
      else if (e.taya === me.i) { toast(`NAHULI MO SI ${game.kids[e.kid].name.toUpperCase()}!`, `+${e.points} · Balik ka na sa pagbato.`, 1800); buzz(40); }
      else toast(`Taya na si ${game.kids[e.kid].name}!`, '', 1200);
      break;
    case 'throw': if (mine) hint('fetch', 'Kunin ang tsinelas mo. Ligtas ka habang nakatapak dito, pero maghintay ng tamang tiyempo para tumakbo pauwi!'); break;
    case 'home': if (mine) { toast('LIGTAS!', `+${e.points}`, 1000); if (me.hasSlip) cam.turnTo = view.autoYaw(game); } break;
    case 'canSet': if (me.role === 'thrower' && !isHome(me)) toast('Nakatayo na ang lata!', 'Ingat, puwede ka nang mahuli.', 1400); break;
    case 'over': finish(); break;
    default: break;
  }
}

function pause() { if (mode === 'play') { mode = 'pause'; unlock(); show('pause'); } }
function resume() { if (mode === 'pause') { mode = 'play'; clearInput(); show(null); lock(); } }
function toMenu() { mode = 'title'; unlock(); game = createGame({ seed: seed(), demo: true }); labels(); show('title'); }
function toggleView() {
  data.view = firstPerson() ? 'chase' : 'fp'; persist(); labels();
  if (firstPerson()) { cam.pitch = PITCH; lock(); } else unlock();
  if (mode === 'play') toast(firstPerson() ? 'Unang tao' : 'Sa likod', firstPerson() ? 'First person' : 'Chase camera', 900);
}

function finish() {
  mode = 'over';
  unlock();
  const g = game, k = data.difficulty;
  const isBest = g.score > (data.best[k] || 0);
  data.best[k] = Math.max(data.best[k] || 0, g.score); persist();
  $('over-score').textContent = g.score;
  $('over-best').textContent = isBest && g.score ? 'Bagong best! New best!' : `Best (${DIFFICULTY[k].name}): ${data.best[k]}`;
  $('over-best').classList.toggle('new', isBest && g.score > 0);
  const rows = [...g.kids].sort((a, b) => b.stats.knocks - a.stats.knocks);
  $('over-table').innerHTML = '';
  for (const kid of rows) {
    const tr = document.createElement('tr');
    for (const v of [kid.you ? 'Ikaw' : kid.name, kid.stats.knocks, kid.stats.tags, kid.stats.tagged]) { const td = document.createElement('td'); td.textContent = String(v); tr.appendChild(td); }
    if (kid.you) tr.className = 'me';
    $('over-table').appendChild(tr);
  }
  setTimeout(() => { if (mode === 'over') show('over'); }, 1800);
  toast('ANAK! UWI NA!', 'Kakain na! — Nanay', 1800);
}

function toggleSound() { A.start(); data.muted = !data.muted; A.setMuted(data.muted); persist(); labels(); }
function labels() {
  for (const b of document.querySelectorAll('.sound')) { b.textContent = data.muted ? '🔇' : '🔊'; b.setAttribute('aria-label', data.muted ? 'Sound off, turn it on' : 'Sound on, turn it off'); }
  for (const b of document.querySelectorAll('.calm')) { b.setAttribute('aria-pressed', String(data.calm)); b.textContent = data.calm ? 'Bawas-yanig: on' : 'Bawas-yanig: off'; }
  for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === data.difficulty));
  $('view-btn').textContent = firstPerson() ? '1P' : '3P';
  $('view-btn').setAttribute('aria-label', firstPerson() ? 'First-person camera: switch to the chase camera' : 'Chase camera: switch to first person');
  $('diff-note').textContent = { madali: 'Madali: mabagal ang taya, kita ang buong arko ng bato.', katamtaman: 'Katamtaman: kalahating arko lang, mas mabilis ang taya.', mahirap: 'Mahirap: walang arko, mabilis at matalas ang taya.' }[data.difficulty];
  const b = data.best[data.difficulty];
  $('title-best').textContent = b ? `Best (${DIFFICULTY[data.difficulty].name}): ${b}` : '';
}
for (const b of document.querySelectorAll('.sound')) b.onclick = toggleSound;
for (const b of document.querySelectorAll('.calm')) b.onclick = () => { data.calm = !data.calm; persist(); labels(); };
for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => { data.difficulty = b.dataset.diff; persist(); labels(); };
$('play').onclick = start;
$('how-ok').onclick = () => { data.how = true; persist(); start(); };
$('how-btn').onclick = () => { mode = 'how'; show('how'); };
$('retry').onclick = start;
$('resume').onclick = resume;
$('pause-btn').onclick = pause;
$('view-btn').onclick = toggleView;
for (const b of document.querySelectorAll('.menu')) b.onclick = toMenu;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
labels();

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'play') {
    const input = gather(dt);
    for (const e of step(game, input, dt)) onEvent(e);
    cam.manual += dt;
    const me = you(game), moving = me.speed > 0.5 && !aim;
    if (firstPerson()) {
      // first person turns only when told to: when your role changes, or you get home with your tsinelas
      if (cam.turnTo !== null) { cam.yaw = lerpAngle(cam.yaw, cam.turnTo, Math.min(1, dt * 5)); if (Math.abs(lerpAngle(0, cam.turnTo - cam.yaw, 1)) < 0.01) cam.turnTo = null; }
    } else if (cam.manual > 1.4) {
      // a chase camera: it trails behind you while you run, and turns to what matters when you stop or aim
      cam.yaw = lerpAngle(cam.yaw, moving ? me.yaw : view.autoYaw(game), Math.min(1, dt * (aim ? 6 : moving ? 1.6 : 1.2)));
    }
    hud();
  } else if (mode === 'title' || mode === 'how') {
    step(game, NOINPUT, dt);
    if (game.phase === 'over') game = createGame({ seed: seed(), demo: true });
  }
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').hidden = true;
  const me = you(game);
  view.frame(game, dt, {
    mode: mode === 'play' || mode === 'pause' ? 'play' : mode === 'over' ? 'over' : 'title', view: data.view, camYaw: cam.yaw, camPitch: cam.pitch, reduced: reduced(),
    aim: aim && mode === 'play' ? { yaw: aimYaw(me), power: meter(aim.t) } : null, preview: game.diff.preview,
  });
  A.update(game, mode === 'play', dt);
  requestAnimationFrame(frame);
}

async function boot() {
  // the canvas labels need the webfont
  try { await Promise.race([document.fonts.load('800 34px "Baloo 2"'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* fall back to system fonts */ }
  try { view = createView($('view'), { low: touch }); }
  catch {
    $('title').innerHTML = '<h1 class="logo">TUMBANG PRESO</h1><p class="tag">Kailangan ng laro ang 3D (WebGL), pero hindi ito mabuksan sa browser na ito. Subukan sa Chrome, Edge, Safari o Firefox, o i-on ang hardware acceleration.</p>';
    show('title');
    return;
  }
  window.addEventListener('resize', () => view.resize());
  new ResizeObserver(() => view.resize()).observe($('view'));
  show('title');
  requestAnimationFrame(frame);
  if (TEST) {
    window.__tp = { get game() { return game; }, get mode() { return mode; }, get aim() { return aim; }, cam, start, view, toggleView, press(code) { keys.add(code); if (ACT.includes(code)) pressedAct = true; }, release(code) { keys.delete(code); } };
    if (Q.get('difficulty')) data.difficulty = Q.get('difficulty');
    if (Q.get('go') === '1') { data.how = true; start(); }
  }
}
boot();
if ('serviceWorker' in navigator && !TEST) navigator.serviceWorker.register('sw.js').catch(() => { /* online-only then */ });
