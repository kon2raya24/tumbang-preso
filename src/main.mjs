// The page: screens, input (keyboard, a gamepad, the touch stick and buttons), aiming, the HUD, sound
// and saves. The rules live in sim.mjs and the street in view3d.mjs.
import { createGame, step, you, taya, isHome, slipOf, yawTo, powerFor, taggable, DIFFICULTY, NOINPUT } from './sim.mjs';
import { createView } from './view3d.mjs';
import { loadPeople } from './people.mjs';
import { loadCrowd } from './crowd.mjs';
import { loadEnv } from './envpack.mjs';
import { createAudio } from './audio.mjs';
import { createBarks } from './barks.mjs';
import { MEDALS, earned } from './medals.mjs';

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
  medals: Array.isArray(saved.medals) ? saved.medals : [],
  view: saved.view === 'chase' ? 'chase' : 'fp',
  gfx: [0, 1, 2].includes(saved.gfx) ? saved.gfx : 'auto', // graphics: auto (steps down on slow devices) or a fixed level
  // the player's settings: the game (mode, length, players, the throw's arc), the controls, the sound
  opt: { mode: 'klasiko', minutes: 3, players: 5, arc: 'auto', sens: 1, invert: false, fov: 72, music: 1, sfx: 1, ...(saved.opt || {}) },
};
const MODES = { klasiko: 'Klasiko', walang: 'Walang Katapusan', taya: 'Ikaw ang Taya' };
// the best score is kept for each way of playing; the classic three minutes keep their old key
const bestKey = () => (data.opt.mode === 'klasiko' && data.opt.minutes === 3 && data.opt.players === 5 ? data.difficulty : `${data.opt.mode}:${data.difficulty}:${data.opt.minutes}:${data.opt.players}`);
const preview = () => (data.opt.arc === 'buo' ? 1 : data.opt.arc === 'wala' ? 0 : game.diff.preview);
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

const SCREENS = ['title', 'how', 'pause', 'over', 'settings'];
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
  const o = data.opt;
  game = createGame({ seed: seed(), difficulty: data.difficulty, minutes: o.minutes, endless: o.mode === 'walang', players: o.players, startTaya: o.mode === 'taya' });
  mode = 'play'; aim = null; cam.yaw = view.autoYaw(game); cam.pitch = PITCH; cam.turnTo = null; cam.manual = 9; clearInput();
  show(null);
  lock();
  newMedals = []; mvp = undefined; maibaStart();
  hintFp = !touch && firstPerson();
}
let hintFp = false;
function fpHint() {
  if (!hintFp) return; hintFp = false;
  hint('fp', canLock ? 'Mouse: tumingin · Click o Space: ibato · WASD: lakad · V: ibang camera' : 'I-drag ang mouse para tumingin · Space: ibato · WASD: lakad · V: ibang camera');
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
  cam.yaw -= dYaw * data.opt.sens; cam.manual = 0; cam.turnTo = null;
  if (firstPerson()) cam.pitch = clamp(cam.pitch - dPitch * data.opt.sens * (data.opt.invert ? -1 : 1), -1.0, 0.75);
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
// the menus on a controller: the d-pad or stick moves between buttons (sliders step), ✕ presses, ○ goes back
const menuPad = { held: {}, rep: 0 };
function padMenus(dt) {
  const p = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean)[0] : null;
  const screen = mode === 'play' ? null : SCREENS.find((id) => !$(id).hidden);
  if (!p) return;
  const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed), ax = p.axes || [];
  // a button still held from the game (Options to pause) doesn't count as a press here
  if (!screen || screen !== menuPad.screen) { menuPad.screen = screen; menuPad.held = { x: b(0), o: b(1), opt: b(9) }; return; }
  const dir = b(12) || ax[1] < -0.5 ? 'up' : b(13) || ax[1] > 0.5 ? 'down' : b(14) || ax[0] < -0.5 ? 'left' : b(15) || ax[0] > 0.5 ? 'right' : null;
  const edge = (k, on) => { const was = menuPad.held[k]; menuPad.held[k] = on; return on && !was; };
  menuPad.rep -= dt;
  const moved = dir && (edge('dir:' + dir, true) || menuPad.rep <= 0);
  for (const d of ['up', 'down', 'left', 'right']) if (d !== dir) menuPad.held['dir:' + d] = false;
  if (moved) {
    menuPad.rep = 0.22;
    const items = [...$(screen).querySelectorAll('button, input[type=range], a')].filter((el) => el.offsetParent !== null);
    const at = items.indexOf(document.activeElement);
    if (document.activeElement && document.activeElement.type === 'range' && (dir === 'left' || dir === 'right')) {
      const r = document.activeElement; r.value = String(+r.value + (dir === 'right' ? 1 : -1) * +r.step); r.dispatchEvent(new Event('input'));
    } else if (items.length) items[(at + (dir === 'up' || dir === 'left' ? -1 : 1) + items.length) % items.length].focus();
  }
  if (edge('x', b(0)) && document.activeElement && $(screen).contains(document.activeElement) && document.activeElement.click) document.activeElement.click();
  if (edge('o', b(1))) { if (screen === 'settings') $('settings-ok').click(); else if (screen === 'how') $('how-ok').click(); else if (screen === 'pause') resume(); }
  if (edge('opt', b(9)) && screen === 'pause') resume();
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
const hudEl = { clockLabel: $('clock-label'), cross: $('cross'), score: $('score'), clock: $('clock'), role: $('role'), prompt: $('prompt'), meter: $('meter'), fill: $('meter-fill'), sweet: $('meter-sweet'), act: $('btn-act') };
function hud() {
  const g = game, me = you(g);
  hudEl.score.textContent = String(g.score);
  if (g.endless) { const s2 = Math.floor(g.t); hudEl.clock.textContent = `${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`; hudEl.clockLabel.textContent = 'WALANG UWIAN'; hudEl.clock.classList.remove('late'); }
  else { const mins = Math.min(59, Math.floor((g.t / g.limit) * 60)); hudEl.clock.textContent = `5:${String(mins).padStart(2, '0')} PM`; hudEl.clockLabel.textContent = 'UWI SA 6:00'; hudEl.clock.classList.toggle('late', mins >= 50); }
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
    hudEl.sweet.hidden = preview() <= 0;
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
    case 'go': A.start(); $('maiba').hidden = true; maiba = null; fpHint(); break;
    case 'knock': slowT = 0.75; if (mine) { toast(e.streak >= 4 ? 'WALANG TIGIL!' : e.streak === 3 ? 'TRIPLE!' : e.streak === 2 ? 'DOBLE!' : e.far ? 'ASINTADO!' : 'NATUMBA!', [`+${e.points}`, e.far && `MALAYUAN ${e.range.toFixed(1)} m`, e.streak > 1 && `SUNOD-SUNOD ×${e.streak}`, e.saves && `SALBA ×${e.saves}`].filter(Boolean).join(' · ')); buzz(40); } else if (me.role === 'thrower' && !me.hasSlip) toast(`Natumba ni ${game.kids[e.kid].name}!`, 'Kunin na ang tsinelas mo!'); else if (me.role === 'taya') toast('Natumba ang lata!', 'Itayo mo agad sa bilog!'); break;
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
  barks.event(e, game);
  for (const id of earned(game, e)) award(id);
}

// ---------- the kids' voices, medals, and "Maiba taya!" ----------
const barks = createBarks((i, text) => view.bark(i, text));
let newMedals = [];
function award(id) {
  if (data.medals.includes(id)) return;
  const m = MEDALS.find((x) => x.id === id);
  data.medals.push(id); newMedals.push(id); persist();
  const el = $('medal');
  el.innerHTML = '<i></i><div><small>BAGONG MEDALYA</small><b></b><span></span></div>';
  el.querySelector('i').textContent = m.glyph; el.querySelector('b').textContent = m.name; el.querySelector('span').textContent = m.desc;
  el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  medalT = 3.2;
  A.event({ type: 'medal' }, game);
}
let medalT = 0, clockT = 0;
// a roulette over the barkada, slowing down onto whoever guards the can first
let maiba = null;
function maibaStart() {
  const el = $('maiba'), box = el.querySelector('.chips'), t = taya(game), n = game.kids.length;
  box.innerHTML = '';
  const chips = game.kids.map((k) => { const c = document.createElement('span'); c.textContent = k.you ? 'IKAW' : k.name; c.style.setProperty('--c', k.shirt); box.appendChild(c); return c; });
  const from = Math.floor(Math.random() * n), total = 12 + (((t.i - from - 12) % n) + n) % n, steps = [];
  for (let s = 0, at = 0, gap = 1; s <= total; s++, at += gap, gap *= 1.09) steps.push({ at, i: (from + s) % n });
  const end = steps[steps.length - 1].at;
  for (const s of steps) s.at = (s.at / end) * 1.9; // it lands at 1.9 s, with a beat to read it before the whistle
  el.querySelector('b').textContent = ''; el.classList.remove('landed'); el.hidden = false;
  maiba = { steps, chips, at: -1, start: game.phaseT };
}
function maibaTick() {
  if (!maiba) return;
  const s = maiba.steps.findLastIndex((x) => x.at <= maiba.start - game.phaseT);
  if (s === maiba.at || s < 0) return;
  maiba.at = s;
  maiba.chips.forEach((c, i) => c.classList.toggle('on', i === maiba.steps[s].i));
  const last = s === maiba.steps.length - 1;
  A.event({ type: 'count', n: last ? 0 : 1 }, game);
  if (last) {
    const t = taya(game);
    $('maiba').querySelector('b').textContent = t.you ? 'IKAW ANG TAYA!' : `SI ${t.name.toUpperCase()} ANG TAYA!`;
    $('maiba').classList.add('landed');
  }
}

function pause() { if (mode === 'play') { mode = 'pause'; unlock(); $('end-btn').hidden = !game.endless; show('pause'); } }
function resume() { if (mode === 'pause') { mode = 'play'; clearInput(); show(null); lock(); } }
function toMenu() { mvp = undefined; $('maiba').hidden = true; maiba = null; mode = 'title'; unlock(); game = createGame({ seed: seed(), demo: true }); labels(); show('title'); }
function toggleView() {
  data.view = firstPerson() ? 'chase' : 'fp'; persist(); labels();
  if (firstPerson()) { cam.pitch = PITCH; lock(); } else unlock();
  if (mode === 'play') toast(firstPerson() ? 'Unang tao' : 'Sa likod', firstPerson() ? 'First person' : 'Chase camera', 900);
}

function finish() {
  mode = 'over';
  unlock();
  $('maiba').hidden = true; maiba = null;
  const g = game, k = bestKey();
  for (const kid of g.kids) { kid.speed = 0; kid.dive = 0; kid.recover = 0; }
  for (const id of earned(g, null)) award(id);
  const isBest = g.score > (data.best[k] || 0);
  data.best[k] = Math.max(data.best[k] || 0, g.score); persist();
  $('over-score').textContent = g.score;
  $('over-best').textContent = isBest && g.score ? 'Bagong best! New best!' : `Best (${MODES[data.opt.mode]} · ${DIFFICULTY[data.difficulty].name}): ${data.best[k]}`;
  $('over-best').classList.toggle('new', isBest && g.score > 0);
  // the best of the afternoon: knocks, then tags, then the fewest times caught
  const rank = (x) => x.stats.knocks * 100 + x.stats.tags * 150 + x.stats.saves * 50 - x.stats.tagged * 20;
  const rows = [...g.kids].sort((a, b) => rank(b) - rank(a));
  mvp = rows[0].i;
  $('over-mvp').innerHTML = '<small>PINAKAMAGALING NGAYONG HAPON</small><b></b>';
  $('over-mvp').querySelector('b').textContent = rows[0].you ? 'IKAW!' : rows[0].name;
  const me = you(g);
  $('over-me').textContent = `Pinakamahabang sunod-sunod: ${me.stats.bestStreak} · Malayuan: ${me.stats.far} · Nakauwi nang ligtas: ${me.stats.homes}`;
  $('over-medals').innerHTML = '';
  for (const m of MEDALS) {
    const d = document.createElement('div'), got = data.medals.includes(m.id);
    d.className = `medal${got ? ' got' : ''}${newMedals.includes(m.id) ? ' fresh' : ''}`;
    d.title = `${m.name}: ${m.desc}`;
    d.innerHTML = '<i></i><small></small>'; d.querySelector('i').textContent = m.glyph; d.querySelector('small').textContent = m.name;
    $('over-medals').appendChild(d);
  }
  $('over-medal-count').textContent = `Medalya ${data.medals.length}/${MEDALS.length}${newMedals.length ? ` · ${newMedals.length} bago!` : ''}`;
  $('over-table').innerHTML = '';
  for (const kid of rows) {
    const tr = document.createElement('tr');
    for (const v of [kid.you ? 'Ikaw' : kid.name, kid.stats.knocks, kid.stats.tags, kid.stats.tagged]) { const td = document.createElement('td'); td.textContent = String(v); tr.appendChild(td); }
    if (kid.you) tr.className = 'me';
    if (kid.i === mvp) tr.classList.add('mvp');
    $('over-table').appendChild(tr);
  }
  setTimeout(() => { if (mode === 'over') show('over'); }, 1800);
  toast('ANAK! UWI NA!', 'Kakain na! — Nanay', 1800);
}

function toggleSound() { A.start(); data.muted = !data.muted; A.setMuted(data.muted); persist(); labels(); }
function labels() {
  for (const b of document.querySelectorAll('.sound')) { b.textContent = data.muted ? '🔇' : '🔊'; b.setAttribute('aria-label', data.muted ? 'Sound off, turn it on' : 'Sound on, turn it off'); }
  for (const b of document.querySelectorAll('[data-diff]')) b.setAttribute('aria-pressed', String(b.dataset.diff === data.difficulty));
  $('view-btn').textContent = firstPerson() ? '1P' : '3P';
  $('view-btn').setAttribute('aria-label', firstPerson() ? 'First-person camera: switch to the chase camera' : 'Chase camera: switch to first person');
  $('diff-note').textContent = { klasiko: '', walang: 'Walang uwian: laro hanggang gusto mo. ', taya: 'Ikaw muna ang bantay ng lata. ' }[data.opt.mode] + { madali: 'Madali: mabagal ang taya, kita ang buong arko ng bato.', katamtaman: 'Katamtaman: kalahating arko lang, mas mabilis ang taya.', mahirap: 'Mahirap: walang arko, mabilis at matalas ang taya.' }[data.difficulty];
  for (const b2 of document.querySelectorAll('[data-mode]')) b2.setAttribute('aria-pressed', String(b2.dataset.mode === data.opt.mode));
  const b = data.best[bestKey()];
  $('title-best').textContent = [b ? `Best (${MODES[data.opt.mode]} · ${DIFFICULTY[data.difficulty].name}): ${b}` : '', data.medals.length ? `Medalya ${data.medals.length}/${MEDALS.length}` : ''].filter(Boolean).join(' · ');
}
for (const b of document.querySelectorAll('.sound')) b.onclick = toggleSound;
for (const b of document.querySelectorAll('[data-diff]')) b.onclick = () => { data.difficulty = b.dataset.diff; persist(); labels(); };
for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => { data.opt.mode = b.dataset.mode; persist(); labels(); };

// ---------- settings ----------
let settingsFrom = 'title';
function openSettings(from) {
  settingsFrom = from; mode = 'settings';
  const o = data.opt, f = document.activeElement, again = f && f.dataset && f.dataset.k ? `[data-k="${f.dataset.k}"]${f.dataset.v !== undefined ? `[data-v="${f.dataset.v}"]` : ''}` : null;
  const seg = (key, list) => `<div class="modes">${list.map(([v, label]) => `<button type="button" data-k="${key}" data-v="${v}" aria-pressed="${String(key === 'gfx' ? data.gfx : key === 'calm' ? data.calm : key === 'view' ? data.view : o[key]) === String(v)}">${label}</button>`).join('')}</div>`;
  const slider = (key, lo, hi, st, label) => `<label class="slide">${label} <input type="range" min="${lo}" max="${hi}" step="${st}" value="${o[key]}" data-k="${key}"></label>`;
  $('settings-body').innerHTML = `
    <div class="grp"><h3>Laro · Game</h3>
    <p class="muted">Haba ng hapon · Length</p>${seg('minutes', [[3, '3 min'], [5, '5 min'], [8, '8 min']])}
    <p class="muted">Kalaro · Players</p>${seg('players', [[3, '3'], [4, '4'], [5, '5']])}
    <p class="muted">Arko ng bato · Throw arc</p>${seg('arc', [['auto', 'Ayon sa hirap'], ['buo', 'Buo · Full'], ['wala', 'Wala · Off']])}
    </div><div class="grp"><h3>Kontrol · Controls</h3>
    <p class="muted">Camera</p>${seg('view', [['fp', 'Unang tao · 1P'], ['chase', 'Sa likod · 3P']])}
    ${slider('sens', 0.4, 2, 0.1, 'Bilis ng tingin · Look speed')}
    <p class="muted">Baliktad ang taas-baba · Invert Y</p>${seg('invert', [[false, 'Hindi · Off'], [true, 'Oo · On']])}
    <p class="muted">Lawak ng tanaw · Field of view</p>${seg('fov', [[64, 'Makitid'], [72, 'Karaniwan'], [84, 'Malawak']])}
    </div><div class="grp"><h3>Tunog at itsura · Sound and look</h3>
    ${slider('music', 0, 1, 0.05, 'Musika · Music')}${slider('sfx', 0, 1, 0.05, 'Tunog · Effects')}
    <p class="muted">Graphics</p>${seg('gfx', [['auto', 'Auto'], [2, 'Mataas'], [1, 'Katamtaman'], [0, 'Mababa']])}
    <p class="muted">Yanig ng camera · Camera shake</p>${seg('calm', [[false, 'Buo · Full'], [true, 'Kalmado · Reduced']])}</div>`;
  for (const b of $('settings-body').querySelectorAll('button')) b.onclick = () => {
    const k = b.dataset.k, raw = b.dataset.v, v = raw === 'true' ? true : raw === 'false' ? false : isNaN(+raw) ? raw : +raw;
    if (k === 'gfx') { data.gfx = v; if (view) { view.post.setAuto(v === 'auto'); view.post.setLevel(v === 'auto' ? (touch ? 1 : 2) : v); } }
    else if (k === 'calm') data.calm = v;
    else if (k === 'view') { if (data.view !== v) toggleView(); }
    else o[k] = v;
    persist(); labels(); openSettings(settingsFrom);
  };
  for (const r of $('settings-body').querySelectorAll('input[type=range]')) r.oninput = () => { o[r.dataset.k] = +r.value; A.start(); A.setMix(o); persist(); };
  show('settings');
  if (again && $('settings-body').querySelector(again)) $('settings-body').querySelector(again).focus({ preventScroll: true }); // keep your place after a change
}
$('settings-ok').onclick = () => { if (settingsFrom === 'pause') { mode = 'pause'; show('pause'); } else { mode = 'title'; show('title'); } };
for (const b of document.querySelectorAll('.settings-btn')) b.onclick = () => openSettings(mode === 'pause' ? 'pause' : 'title');
A.setMix(data.opt);
$('play').onclick = start;
$('how-ok').onclick = () => { data.how = true; persist(); start(); };
$('how-btn').onclick = () => { mode = 'how'; show('how'); };
$('retry').onclick = start;
$('resume').onclick = resume;
$('pause-btn').onclick = pause;
$('view-btn').onclick = toggleView;
for (const b of document.querySelectorAll('.menu')) b.onclick = toMenu;
// with no six o'clock, you call it a day yourself
$('end-btn').onclick = () => { game.phase = 'over'; show(null); finish(); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
labels();

// ---------- loop ----------
let last = performance.now(), slowT = 0, mvp;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'play') {
    const input = gather(dt);
    slowT = Math.max(0, slowT - dt);
    for (const e of step(game, input, slowT > 0 ? dt * 0.35 : dt)) onEvent(e); // a beat of slow motion when the lata goes down
    cam.manual += dt;
    const me = you(game), moving = me.speed > 0.5 && !aim;
    if (firstPerson()) {
      // first person turns only when told to: when your role changes, or you get home with your tsinelas
      if (cam.turnTo !== null) { cam.yaw = lerpAngle(cam.yaw, cam.turnTo, Math.min(1, dt * 5)); if (Math.abs(lerpAngle(0, cam.turnTo - cam.yaw, 1)) < 0.01) cam.turnTo = null; }
    } else if (cam.manual > 1.4) {
      // a chase camera: it trails behind you while you run, and turns to what matters when you stop or aim
      cam.yaw = lerpAngle(cam.yaw, moving ? me.yaw : view.autoYaw(game), Math.min(1, dt * (aim ? 6 : moving ? 1.6 : 1.2)));
    }
    barks.tick(game, dt);
    maibaTick();
    if ((clockT += dt) > 1) { clockT = 0; for (const id of earned(game, { type: 'clock' })) award(id); }
    hud();
  } else if (mode === 'title' || mode === 'how' || mode === 'settings') {
    step(game, NOINPUT, dt);
    if (game.phase === 'over') game = createGame({ seed: seed(), demo: true });
  }
  padMenus(dt);
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').hidden = true;
  if (medalT > 0 && (medalT -= dt) <= 0) $('medal').hidden = true;
  const me = you(game);
  view.frame(game, dt, {
    mode: mode === 'play' || mode === 'pause' ? 'play' : mode === 'over' ? 'over' : 'title', view: data.view, camYaw: cam.yaw, camPitch: cam.pitch, reduced: reduced(),
    aim: aim && mode === 'play' ? { yaw: aimYaw(me), power: meter(aim.t) } : null, preview: preview(), fov: data.opt.fov, mvp,
  });
  A.update(game, mode === 'play', dt);
  requestAnimationFrame(frame);
}

async function boot() {
  // the canvas labels need the webfont
  try { await Promise.race([document.fonts.load('800 34px "Baloo 2"'), new Promise((r) => setTimeout(r, 1500))]); } catch { /* fall back to system fonts */ }
  try { view = createView($('view'), { low: touch, gfx: Q.get('gfx') ?? (data.gfx === 'auto' ? null : String(data.gfx)) }); }
  catch {
    $('title').innerHTML = '<h1 class="logo">TUMBANG PRESO</h1><p class="tag">Kailangan ng laro ang 3D (WebGL), pero hindi ito mabuksan sa browser na ito. Subukan sa Chrome, Edge, Safari o Firefox, o i-on ang hardware acceleration.</p>';
    show('title');
    return;
  }
  window.addEventListener('resize', () => view.resize());
  new ResizeObserver(() => view.resize()).observe($('view'));
  show('title');
  // the real street and the real barkada load in the background; a bar shows how far along
  const bar = $('loading'), pct = $('load-pct');
  const loaded = (f) => { if (!bar) return; bar.hidden = false; pct.textContent = `${Math.round(f * 100)}%`; bar.style.setProperty('--p', `${Math.round(f * 100)}%`); };
  const doneLoading = () => { if (!bar) return; bar.classList.add('done'); setTimeout(() => { bar.hidden = true; }, 700); };
  loadEnv(Q.get('env') || 'assets/env/').then((e) => view.setEnv(e)).catch(() => { /* the painted street stays */ });
  loadPeople(Q.get('people') || 'assets/people/', loaded).then((lib) => { view.setPeople(lib); doneLoading(); }).catch(() => doneLoading());
  loadCrowd(Q.get('people') || 'assets/people/').then((c) => view.setCrowd(c)).catch(() => { /* no neighbours watching, then */ });
  requestAnimationFrame(frame);
  if (TEST) {
    window.__tp = { get game() { return game; }, get mode() { return mode; }, get aim() { return aim; }, cam, start, view, toggleView, press(code) { keys.add(code); if (ACT.includes(code)) pressedAct = true; }, release(code) { keys.delete(code); } };
    if (Q.get('difficulty')) data.difficulty = Q.get('difficulty');
    if (Q.get('go') === '1') { data.how = true; start(); }
  }
}
boot();
if ('serviceWorker' in navigator && !TEST) navigator.serviceWorker.register('sw.js').catch(() => { /* online-only then */ });
