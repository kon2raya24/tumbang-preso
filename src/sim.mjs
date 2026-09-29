// The rules of Tumbang Preso, as a pure fixed-step simulation in metres and seconds. The 3D view only
// reads this state and the events it returns, so everything that matters is testable in Node.
//
// The field: the lata stands in a chalk circle at the origin; the throwing line runs across the street
// at z = LINE_Z, and behind it (z >= LINE_Z) is home, where throwers are safe. Throws go toward -z.
//
// Step order: the player's input, the AI's choices, movement, slippers in the air, the can, pickups and
// the taya's chores (fetching, carrying and setting the can), tags, going home, the clock.
import { rand } from './rng.mjs';

export const DT = 1 / 60;
export const G = 9.8;
export const FIELD = { minX: -6.8, maxX: 6.8, minZ: -8.5, maxZ: 11.5 };
export const LINE_Z = 6.5;
export const CAN = { r: 0.09, h: 0.24, circle: 0.5 };
export const SLIP = { r: 0.15, hold: 1.1 };
export const KID = { r: 0.32, speed: 4.2, sprint: 5.7, reach: 0.72, pick: 0.5, safe: 0.42 };
export const THROW = { min: 4.5, max: 15, pitch: 0.3, cool: 0.5 };
export const TAYA = { set: 0.55, dive: 0.32, diveBoost: 1.8, recover: 0.5, guardZ: 1.3, count: 1.5 };
export const POINTS = { knock: 100, save: 50, home: 25, tag: 150 };
export const DIFFICULTY = {
  madali: { key: 'madali', name: 'Madali', taya: 3.5, aim: 1.0, dare: 0.8, meter: 1.9, preview: 1, minutes: 3 },
  katamtaman: { key: 'katamtaman', name: 'Katamtaman', taya: 4.3, aim: 0.6, dare: 0.85, meter: 1.45, preview: 0.5, minutes: 3 },
  mahirap: { key: 'mahirap', name: 'Mahirap', taya: 5.0, aim: 0.35, dare: 0.9, meter: 1.15, preview: 0, minutes: 3 },
};
export const KIDS = [
  { name: 'Ikaw', shirt: '#e8384f', you: true },
  { name: 'Buboy', shirt: '#ff9f43' },
  { name: 'Nene', shirt: '#ff8ae2' },
  { name: 'Kulot', shirt: '#3fae5a' },
  { name: 'Bong', shirt: '#2f6fd6' },
];
const HOME_SPOTS = [-3.6, -1.8, 0, 1.8, 3.6];
const HOME_Z = LINE_Z + 1.6;
export const NOINPUT = Object.freeze({ move: { x: 0, z: 0 }, sprint: false, throw: null, dive: false });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const isHome = (k) => k.z >= LINE_Z;
export const yawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz); // direction (sin yaw, cos yaw) in (x, z)

// ---------- throwing ----------
export const throwSpeed = (power) => THROW.min + (THROW.max - THROW.min) * clamp(power, 0, 1);

// Where a throw goes: the path in the air, where it first comes down, and whether it would hit a standing can.
export function predictThrow(fx, fz, yaw, power, can = { x: 0, z: 0 }) {
  const v = throwSpeed(power);
  let x = fx, y = SLIP.hold, z = fz;
  let vx = Math.sin(yaw) * Math.cos(THROW.pitch) * v, vy = Math.sin(THROW.pitch) * v, vz = Math.cos(yaw) * Math.cos(THROW.pitch) * v;
  const path = [[x, y, z]];
  let hit = false;
  for (let k = 0; k < 400; k++) {
    const px = x, py = y, pz = z;
    vy -= G * DT; x += vx * DT; y += vy * DT; z += vz * DT;
    if (!hit && hitsCan(px, py, pz, x, y, z, can.x, can.z)) hit = true;
    if (k % 3 === 0) path.push([x, y, z]);
    if (y <= 0.02) { path.push([x, 0.02, z]); return { path, land: [x, z], hit }; }
  }
  return { path, land: [x, z], hit };
}

// Does the stretch of flight from (a) to (b) pass through the can standing at (cx, cz)?
function hitsCan(ax, ay, az, bx, by, bz, cx, cz) {
  for (let s = 0; s <= 4; s++) {
    const f = s / 4, x = ax + (bx - ax) * f, y = ay + (by - ay) * f, z = az + (bz - az) * f;
    if (y < 0 || y > CAN.h + SLIP.r * 0.6) continue;
    if (dist(x, z, cx, cz) < CAN.r + SLIP.r) return true;
  }
  return false;
}

// The power that lands a throw from (fx, fz) on (tx, tz), by bisection on the flight.
export function powerFor(fx, fz, tx, tz) {
  const want = dist(fx, fz, tx, tz), yaw = yawTo(fx, fz, tx, tz);
  let lo = 0, hi = 1;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2, p = predictThrow(fx, fz, yaw, mid);
    const got = dist(fx, fz, p.land[0], p.land[1]);
    if (got < want) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- a game ----------
// demo: every kid plays on their own, for the title screen.
export function createGame({ seed = 1, difficulty = 'katamtaman', demo = false } = {}) {
  const diff = DIFFICULTY[difficulty] || DIFFICULTY.katamtaman;
  const g = { seed, demo, difficulty: diff.key, diff, rs: (seed * 2654435761) >>> 0, t: 0, tick: 0, acc: 0, limit: diff.minutes * 60, phase: 'intro', phaseT: 3.2, score: 0 };
  g.kids = KIDS.map((d, i) => ({
    i, name: d.name, shirt: d.shirt, you: !!d.you, role: 'thrower', x: HOME_SPOTS[i], z: HOME_Z + (i % 2) * 0.4, yaw: Math.PI, speed: 0,
    hasSlip: true, grace: 0, cool: 1 + i * 0.7, dive: 0, recover: 0, out: false, anim: { throwT: 0, tagT: 0 },
    stats: { knocks: 0, tags: 0, tagged: 0, saves: 0 }, ai: { wait: 1 + rand(g) * 2.5, plan: null },
  }));
  // "Maiba taya!": the odd one out guards the can first (never you)
  const first = 1 + Math.floor(rand(g) * (KIDS.length - 1));
  becomeTaya(g, g.kids[first], true);
  g.slips = g.kids.map((k) => ({ owner: k.i, state: k.role === 'taya' ? 'none' : 'hand', x: k.x, y: SLIP.hold, z: k.z, vx: 0, vy: 0, vz: 0, spin: 0 }));
  g.can = { state: 'up', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tilt: 0, roll: 0, spin: 0, setT: 0, by: -1 };
  g.first = first;
  if (demo) g.phase = 'play'; // the title screen's game needs no countdown
  return g;
}

export const you = (g) => g.kids.find((k) => k.you);
export const taya = (g) => g.kids.find((k) => k.role === 'taya');
export const slipOf = (g, k) => g.slips[k.i];

// A new taya counts to three before tagging anyone, so the kids nearby can scatter.
function becomeTaya(g, k, start = false) {
  k.role = 'taya'; k.hasSlip = false; k.chore = 'guard'; k.grace = 0; k.dive = 0; k.recover = 0;
  k.count = start ? 0 : TAYA.count;
  if (!start) { k.anim.tagT = 0.8; }
}

export function step(g, input = NOINPUT, dt = DT) {
  g.acc += Math.min(dt, 0.1);
  const ev = [];
  let first = true;
  while (g.acc >= DT - 1e-9) {
    g.acc -= DT;
    ev.push(...tick(g, first ? input : { ...input, throw: null, dive: false }));
    first = false;
  }
  return ev;
}

export function tick(g, input = NOINPUT) {
  const ev = [];
  g.tick++;
  if (g.phase === 'intro') {
    if ((g.phaseT -= DT) <= 0) { g.phase = 'play'; ev.push({ type: 'go' }); }
    for (const k of g.kids) settle(k);
    return ev;
  }
  if (g.phase !== 'play') return ev;
  g.t += DT;
  for (const k of g.kids) {
    k.grace = Math.max(0, k.grace - DT); k.cool = Math.max(0, k.cool - DT); k.count = Math.max(0, (k.count || 0) - DT);
    k.anim.throwT = Math.max(0, k.anim.throwT - DT); k.anim.tagT = Math.max(0, k.anim.tagT - DT);
    if (k.recover > 0) k.recover -= DT;
    const want = k.you && !g.demo ? input : think(g, k, ev);
    act(g, k, want, ev);
  }
  separate(g);
  slippers(g, ev);
  canPhysics(g, ev);
  chores(g, ev);
  tags(g, ev);
  homecoming(g, ev);
  if (g.t >= g.limit) { g.phase = 'over'; ev.push({ type: 'over', score: g.score }); }
  return ev;
}

// Move, throw or dive, for anyone: the player's input and the AI's wants look the same.
function act(g, k, want, ev) {
  const m = want.move || { x: 0, z: 0 };
  const len = Math.hypot(m.x, m.z);
  let sp = k.role === 'taya' ? g.diff.taya : want.sprint ? KID.sprint : KID.speed;
  if (k.role === 'taya' && k.you) sp = Math.max(sp, KID.speed + 0.2); // you are never slower than the kids you chase
  if (k.dive > 0) { k.dive -= DT; sp *= TAYA.diveBoost; if (k.dive <= 0) k.recover = TAYA.recover; }
  else if (k.recover > 0) sp *= 0.35;
  if (k.chore === 'setting') sp = 0;
  if (len > 0.05 && sp > 0) {
    const dx = (m.x / Math.max(1, len)), dz = (m.z / Math.max(1, len));
    k.x += dx * sp * DT; k.z += dz * sp * DT;
    k.yaw = Math.atan2(dx, dz);
    k.speed = sp * Math.min(1, len);
  } else if (k.dive > 0) {
    k.x += Math.sin(k.yaw) * sp * DT; k.z += Math.cos(k.yaw) * sp * DT; k.speed = sp;
  } else k.speed = 0;
  k.x = clamp(k.x, FIELD.minX, FIELD.maxX); k.z = clamp(k.z, FIELD.minZ, FIELD.maxZ);
  if (k.role === 'taya') k.z = Math.min(k.z, LINE_Z - 0.35); // the taya stays out of home
  if (want.throw && k.role === 'thrower' && k.hasSlip && isHome(k) && k.cool <= 0) throwSlip(g, k, want.throw.yaw, want.throw.power, ev);
  if (want.dive && k.role === 'taya' && k.dive <= 0 && k.recover <= 0 && k.chore === 'guard') { k.dive = TAYA.dive; ev.push({ type: 'dive', kid: k.i }); }
}

function settle(k) { k.speed = 0; }

function throwSlip(g, k, yaw, power, ev) {
  const s = slipOf(g, k), v = throwSpeed(power);
  s.state = 'air'; s.x = k.x; s.y = SLIP.hold; s.z = k.z;
  s.vx = Math.sin(yaw) * Math.cos(THROW.pitch) * v; s.vy = Math.sin(THROW.pitch) * v; s.vz = Math.cos(yaw) * Math.cos(THROW.pitch) * v;
  s.spin = 0; s.bounced = false;
  k.hasSlip = false; k.yaw = yaw; k.cool = THROW.cool; k.anim.throwT = 0.35; k.threwAt = g.t;
  ev.push({ type: 'throw', kid: k.i, power });
}

// ---------- the physics of slippers and the can ----------
function slippers(g, ev) {
  for (const s of g.slips) {
    if (s.state === 'hand') { const k = g.kids[s.owner]; s.x = k.x; s.z = k.z; s.y = SLIP.hold; continue; }
    if (s.state !== 'air') continue;
    const px = s.x, py = s.y, pz = s.z;
    s.vy -= G * DT; s.x += s.vx * DT; s.y += s.vy * DT; s.z += s.vz * DT; s.spin += DT * 18;
    if (g.can.state === 'up' && hitsCan(px, py, pz, s.x, s.y, s.z, g.can.x, g.can.z)) knock(g, s, ev);
    if (s.x < FIELD.minX - 0.5 || s.x > FIELD.maxX + 0.5) { s.x = clamp(s.x, FIELD.minX - 0.5, FIELD.maxX + 0.5); s.vx *= -0.3; }
    if (s.z < FIELD.minZ - 0.5 || s.z > FIELD.maxZ + 0.5) { s.z = clamp(s.z, FIELD.minZ - 0.5, FIELD.maxZ + 0.5); s.vz *= -0.3; }
    if (s.y <= 0.02) {
      s.y = 0.02;
      if (!s.bounced && Math.abs(s.vy) > 1.5) { s.vy = -s.vy * 0.22; s.vx *= 0.55; s.vz *= 0.55; s.bounced = true; ev.push({ type: 'bounce', owner: s.owner }); }
      else {
        // slide to a stop
        const sp = Math.hypot(s.vx, s.vz), dec = 7 * DT;
        if (sp <= dec) { s.vx = s.vz = s.vy = 0; s.state = 'ground'; ev.push({ type: 'land', owner: s.owner, x: s.x, z: s.z }); }
        else { s.vx -= (s.vx / sp) * dec; s.vz -= (s.vz / sp) * dec; s.vy = 0; }
      }
    }
  }
}

function knock(g, s, ev) {
  const c = g.can, k = g.kids[s.owner];
  c.state = 'flying'; c.by = s.owner;
  c.vx = s.vx * 0.42 + (rand(g) - 0.5) * 0.8; c.vz = s.vz * 0.42 + (rand(g) - 0.5) * 0.8; c.vy = 2.2 + rand(g) * 0.8;
  c.spin = (rand(g) < 0.5 ? -1 : 1) * (8 + rand(g) * 6);
  s.vx *= -0.15; s.vz *= -0.15; s.vy = Math.min(s.vy, 0.5);
  // everyone caught out in the field is saved: they can walk home while the taya fixes the can
  const saves = g.kids.filter((o) => o !== k && o.role === 'thrower' && !isHome(o)).length;
  k.stats.knocks++; k.stats.saves += saves;
  if (k.you) g.score += POINTS.knock + POINTS.save * saves;
  ev.push({ type: 'knock', kid: k.i, saves, points: k.you ? POINTS.knock + POINTS.save * saves : 0 });
}

function canPhysics(g, ev) {
  const c = g.can;
  if (c.state === 'flying') {
    c.vy -= G * DT; c.x += c.vx * DT; c.y += c.vy * DT; c.z += c.vz * DT;
    c.tilt = Math.min(Math.PI / 2, c.tilt + DT * 7); c.roll += c.spin * DT;
    if (c.x < FIELD.minX || c.x > FIELD.maxX) { c.x = clamp(c.x, FIELD.minX, FIELD.maxX); c.vx *= -0.4; }
    if (c.z < FIELD.minZ || c.z > FIELD.maxZ) { c.z = clamp(c.z, FIELD.minZ, FIELD.maxZ); c.vz *= -0.4; }
    if (c.y <= 0) {
      c.y = 0; c.tilt = Math.PI / 2;
      if (c.vy < -1.2) { c.vy = -c.vy * 0.3; ev.push({ type: 'clang' }); }
      else { c.vy = 0; c.state = 'rolling'; }
    }
  } else if (c.state === 'rolling') {
    const sp = Math.hypot(c.vx, c.vz), dec = 2.6 * DT;
    c.x += c.vx * DT; c.z += c.vz * DT; c.roll += sp * DT / CAN.r;
    if (c.x < FIELD.minX || c.x > FIELD.maxX) { c.x = clamp(c.x, FIELD.minX, FIELD.maxX); c.vx *= -0.4; }
    if (c.z < FIELD.minZ || c.z > FIELD.maxZ) { c.z = clamp(c.z, FIELD.minZ, FIELD.maxZ); c.vz *= -0.4; }
    if (sp <= dec) { c.vx = c.vz = 0; c.state = 'down'; }
    else { c.vx -= (c.vx / sp) * dec; c.vz -= (c.vz / sp) * dec; }
  } else if (c.state === 'carried') {
    const t = taya(g);
    c.x = t.x + Math.sin(t.yaw) * 0.35; c.z = t.z + Math.cos(t.yaw) * 0.35; c.y = 0.75; c.tilt = 0;
  }
}

// The taya's chores: with the can down, fetch it, carry it home to the circle and stand it up.
function chores(g, ev) {
  const t = taya(g), c = g.can;
  if (!t) return;
  if ((c.state === 'rolling' || c.state === 'down') && dist(t.x, t.z, c.x, c.z) < KID.pick + 0.1) {
    c.state = 'carried'; t.chore = 'carry'; ev.push({ type: 'canPicked', kid: t.i });
  }
  if (c.state === 'carried') {
    if (dist(t.x, t.z, 0, 0) < CAN.circle) {
      if (t.chore !== 'setting') { t.chore = 'setting'; c.setT = TAYA.set; }
      c.x = 0; c.z = 0; c.y = 0.1; // down it goes, into the circle
      if ((c.setT -= DT) <= 0) {
        c.state = 'up'; c.x = 0; c.z = 0; c.y = 0; c.tilt = 0; c.roll = 0; c.by = -1; t.chore = 'guard';
        ev.push({ type: 'canSet', kid: t.i });
      }
    } else t.chore = 'carry';
  }
  if (c.state === 'up' && t.chore !== 'guard') t.chore = 'guard';
  if ((c.state === 'flying' || c.state === 'rolling' || c.state === 'down') && t.chore === 'guard') t.chore = 'fetch';
}

// Who can be tagged: a thrower out in the field, not standing on their own slipper, while the can stands.
export function taggable(g, k) {
  if (k.role !== 'thrower' || isHome(k) || k.grace > 0) return false;
  const s = slipOf(g, k);
  if (s.state === 'ground' && dist(k.x, k.z, s.x, s.z) < KID.safe) return false;
  return true;
}

function tags(g, ev) {
  const t = taya(g);
  if (!t || g.can.state !== 'up' || t.chore !== 'guard' || t.count > 0) return;
  for (const k of g.kids) {
    if (k === t || !taggable(g, k)) continue;
    if (dist(t.x, t.z, k.x, k.z) > KID.reach) continue;
    // roles swap: the tagged kid guards the can; the old taya gets a slipper and walks home, safe
    t.stats.tags++; k.stats.tagged++;
    if (t.you) g.score += POINTS.tag;
    ev.push({ type: 'tag', taya: t.i, kid: k.i, points: t.you ? POINTS.tag : 0 });
    t.role = 'thrower'; t.chore = null; t.hasSlip = true; t.grace = 2.5; t.cool = 1; t.dive = 0; t.recover = 0; t.out = false;
    const ts = slipOf(g, t); ts.state = 'hand';
    const ks = slipOf(g, k); ks.state = 'none';
    becomeTaya(g, k);
    k.anim.tagT = 1;
    t.ai.plan = null; k.ai.plan = null;
    return;
  }
}

// A thrower who walked out into the field and made it back home with their slipper.
function homecoming(g, ev) {
  for (const k of g.kids) {
    if (k.role !== 'thrower') { k.out = false; continue; }
    if (!isHome(k)) { if (!k.hasSlip || k.grace <= 0) k.out = true; continue; }
    if (k.out && k.hasSlip) { k.out = false; if (k.you) g.score += POINTS.home; ev.push({ type: 'home', kid: k.i, points: k.you ? POINTS.home : 0 }); }
  }
  // picking up your own slipper
  for (const k of g.kids) {
    if (k.role !== 'thrower' || k.hasSlip) continue;
    const s = slipOf(g, k);
    if (s.state === 'ground' && dist(k.x, k.z, s.x, s.z) < KID.pick && k.wantsPick !== false) {
      s.state = 'hand'; k.hasSlip = true; ev.push({ type: 'pickup', kid: k.i });
    }
  }
}

// Kids don't walk through each other.
function separate(g) {
  for (let a = 0; a < g.kids.length; a++) for (let b = a + 1; b < g.kids.length; b++) {
    const A = g.kids[a], B = g.kids[b];
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz), min = KID.r * 2;
    if (!(d > 0 && d < min)) continue;
    // a taya setting the can down stands firm; everyone else shares the push
    const share = A.chore === 'setting' ? 0 : B.chore === 'setting' ? 1 : 0.5, over = min - d;
    A.x -= (dx / d) * over * share; A.z -= (dz / d) * over * share; B.x += (dx / d) * over * (1 - share); B.z += (dz / d) * over * (1 - share);
  }
}

// ---------- the other kids ----------
const toward = (k, x, z, sprint = false) => {
  const dx = x - k.x, dz = z - k.z, d = Math.hypot(dx, dz);
  return d < 0.08 ? { move: { x: 0, z: 0 }, sprint } : { move: { x: dx / d, z: dz / d }, sprint };
};
const homeSpot = (k) => ({ x: HOME_SPOTS[k.i], z: HOME_Z + (k.i % 2) * 0.4 });

function think(g, k, ev) {
  if (k.role === 'taya') return thinkTaya(g, k);
  return thinkThrower(g, k, ev);
}

function thinkThrower(g, k) {
  const s = slipOf(g, k), c = g.can, t = taya(g), d = g.diff;
  if (k.hasSlip) {
    const h = homeSpot(k);
    if (!isHome(k) || dist(k.x, k.z, h.x, h.z) > 0.6) return toward(k, h.x, isHome(k) ? h.z : h.z + 0.3, !isHome(k));
    if (c.state !== 'up' || k.cool > 0) return NOINPUT;
    if ((k.ai.wait -= DT) > 0) return { ...NOINPUT };
    k.ai.wait = 1.4 + rand(g) * 3.2;
    // aim at the can, a little off by how steady this difficulty's kids are
    const err = d.aim;
    const yaw = yawTo(k.x, k.z, c.x, c.z) + (rand(g) - 0.5) * 0.09 * err;
    const power = powerFor(k.x, k.z, c.x, c.z) + (rand(g) - 0.5) * 0.12 * err;
    return { ...NOINPUT, throw: { yaw, power } };
  }
  if (s.state === 'air' || s.state === 'none') return NOINPUT;
  // the slipper is on the ground: fetch it now while the can is down, or dare it when the taya is far
  const onIt = dist(k.x, k.z, s.x, s.z) < KID.safe * 0.8;
  const allOut = g.kids.filter((o) => o.role === 'thrower' && !o.hasSlip).length >= g.kids.filter((o) => o.role === 'thrower').length;
  if (c.state !== 'up') return toward(k, s.x, s.z, true);
  const mine = dist(k.x, k.z, s.x, s.z) / KID.sprint + dist(s.x, s.z, s.x, LINE_Z) / KID.sprint;
  const theirs = t ? dist(t.x, t.z, s.x, s.z) / d.taya : 99;
  if (!k.ai.plan) k.ai.plan = { dare: 0.7 + rand(g) * 0.8, waited: 0 };
  // the longer a kid waits without a slipper, the braver they get
  k.ai.plan.waited += DT;
  const nerve = Math.max(0.15, 1 - k.ai.plan.waited / 9);
  const brave = theirs > mine * d.dare * k.ai.plan.dare * nerve || (allOut && rand(g) < 0.004);
  if (onIt) {
    // standing safe on the slipper: dash home when the taya is far enough
    const run = dist(k.x, k.z, k.x, LINE_Z) / KID.sprint, catchUp = t ? Math.max(0, dist(t.x, t.z, k.x, LINE_Z) - KID.reach) / d.taya : 99;
    if (catchUp > run * d.dare * 1.1 * nerve) { k.wantsPick = true; return toward(k, k.x, LINE_Z + 1, true); }
    k.wantsPick = false;
    return NOINPUT;
  }
  k.wantsPick = true;
  if (brave || !isHome(k)) return toward(k, s.x, s.z, true);
  return NOINPUT;
}

function thinkTaya(g, k) {
  const c = g.can;
  if (c.state === 'carried') return k.chore === 'setting' ? NOINPUT : toward(k, 0, 0, true);
  if (c.state !== 'up') return toward(k, c.x, c.z, true);
  // chase the easiest kid to catch; otherwise guard in front of the can
  let best = null, bd = Infinity;
  for (const o of g.kids) {
    if (o === k || !taggable(g, o)) continue;
    const d = dist(k.x, k.z, o.x, o.z);
    if (d < bd) { bd = d; best = o; }
  }
  if (best && bd < 9) {
    const lead = Math.min(0.6, bd / 8);
    const tx = best.x + Math.sin(best.yaw) * best.speed * lead, tz = best.z + Math.cos(best.yaw) * best.speed * lead;
    const w = toward(k, tx, tz);
    if (bd < 1.5 && k.dive <= 0 && k.recover <= 0) w.dive = true;
    return w;
  }
  const guardX = clamp((g.kids.filter((o) => o.role === 'thrower').reduce((a, o) => a + o.x, 0) / 4) * 0.15, -1, 1);
  return toward(k, guardX, TAYA.guardZ);
}

// A stable fingerprint of everything that matters, for replay tests.
export function hashState(g) {
  return JSON.stringify([g.tick, g.phase, g.score, g.rs, g.can, g.kids.map((k) => [k.role, +k.x.toFixed(4), +k.z.toFixed(4), k.hasSlip, k.stats]), g.slips.map((s) => [s.state, +s.x.toFixed(4), +s.z.toFixed(4)])]);
}
