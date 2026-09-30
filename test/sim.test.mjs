import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, tick, step, hashState, predictThrow, powerFor, yawTo, throwSpeed, taggable, you, taya, slipOf, isHome,
  DT, LINE_Z, CAN, KID, POINTS, FAR, DIFFICULTY, NOINPUT,
} from '../src/sim.mjs';

// A game in play, with the AI kids told to stand still unless a test lets them move.
function started(over = {}) {
  const g = createGame({ seed: 4, ...over });
  while (g.phase === 'intro') tick(g);
  return g;
}
const run = (g, seconds, input = NOINPUT) => { const ev = []; for (let k = 0; k < Math.round(seconds / DT); k++) ev.push(...tick(g, typeof input === 'function' ? input(k) : input)); return ev; };
const walk = (x, z) => ({ ...NOINPUT, move: { x, z } });
const freeze = (g) => { for (const k of g.kids) if (!k.you) { k.ai.wait = 1e9; k.cool = 1e9; } };

test('throwing: more power goes farther, and the power for a target lands on it', () => {
  let last = 0;
  for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const r = predictThrow(0, 8, Math.PI, p);
    const d = 8 - r.land[1];
    assert.ok(d > last, `power ${p}: ${d.toFixed(2)} m`);
    last = d;
  }
  for (const [x, z] of [[0, 0], [2, -3], [-4, 2]]) {
    const p = powerFor(0, 8, x, z), r = predictThrow(0, 8, yawTo(0, 8, x, z), p);
    assert.ok(Math.hypot(r.land[0] - x, r.land[1] - z) < 0.1);
  }
  assert.ok(predictThrow(0, 8, Math.PI, powerFor(0, 8, 0, 0)).hit, 'aimed right at the can, it hits');
  assert.ok(!predictThrow(0, 8, Math.PI + 0.3, powerFor(0, 8, 0, 0)).hit, 'far off to the side, it misses');
  assert.ok(throwSpeed(1) > throwSpeed(0));
});

test('you can only throw from home with your slipper in hand; then you must fetch it', () => {
  const g = started(); freeze(g);
  const me = you(g);
  me.cool = 0;
  assert.ok(isHome(me) && me.hasSlip);
  let ev = run(g, DT, { ...NOINPUT, throw: { yaw: Math.PI + 0.4, power: 0.5 } });
  assert.ok(ev.some((e) => e.type === 'throw'));
  assert.ok(!me.hasSlip);
  assert.equal(run(g, DT, { ...NOINPUT, throw: { yaw: Math.PI, power: 0.5 } }).filter((e) => e.type === 'throw').length, 0, 'no second slipper');
  ev = run(g, 3);
  assert.ok(ev.some((e) => e.type === 'land' && e.owner === me.i));
  assert.equal(slipOf(g, me).state, 'ground');
  // walk out to it and pick it up, with the taya far away and dawdling
  const s = slipOf(g, me), t = taya(g);
  t.x = -6; t.z = -8; g.diff = { ...g.diff, taya: 0.01 };
  for (let k = 0; k < 400 && !me.hasSlip; k++) { const d = Math.hypot(s.x - me.x, s.z - me.z); tick(g, walk((s.x - me.x) / d, (s.z - me.z) / d)); }
  assert.ok(me.hasSlip);
  // you cannot throw from out in the field
  me.cool = 0;
  if (!isHome(me)) assert.equal(run(g, DT, { ...NOINPUT, throw: { yaw: Math.PI, power: 0.5 } }).filter((e) => e.type === 'throw').length, 0);
});

test('a hit knocks the can down; the taya fetches it, carries it back and stands it in the circle', () => {
  const g = started(); freeze(g);
  const me = you(g); me.cool = 0;
  const ev = run(g, DT, { ...NOINPUT, throw: { yaw: yawTo(me.x, me.z, 0, 0), power: powerFor(me.x, me.z, 0, 0) } });
  assert.ok(ev.some((e) => e.type === 'throw'));
  const after = run(g, 2);
  assert.ok(after.some((e) => e.type === 'knock' && e.kid === me.i));
  assert.equal(me.stats.knocks, 1);
  assert.ok(g.score >= POINTS.knock);
  const t = taya(g);
  let picked = false, set = false;
  for (let k = 0; k < 60 * 12 && !set; k++) for (const e of tick(g)) { if (e.type === 'canPicked') picked = true; if (e.type === 'canSet') set = true; }
  assert.ok(picked && set, 'the taya fixes the can');
  assert.equal(g.can.state, 'up');
  assert.deepEqual([g.can.x, g.can.z], [0, 0]);
  void t;
});

test('knocking the can with friends out in the field saves them: 50 more each', () => {
  const g = started(); freeze(g);
  const me = you(g); me.cool = 0;
  const pal = g.kids.find((k) => !k.you && k.role === 'thrower');
  pal.z = 3; pal.hasSlip = false; slipOf(g, pal).state = 'ground'; slipOf(g, pal).x = 5; slipOf(g, pal).z = -5;
  run(g, DT, { ...NOINPUT, throw: { yaw: yawTo(me.x, me.z, 0, 0), power: powerFor(me.x, me.z, 0, 0) } });
  const k = run(g, 2).find((e) => e.type === 'knock');
  assert.ok(k && k.saves >= 1);
  assert.equal(k.points, POINTS.knock + POINTS.save * k.saves);
});

test('tags: never at home, never on your own slipper, never while the can is down', () => {
  const g = started(); freeze(g);
  const me = you(g), t = taya(g);
  me.hasSlip = false;
  const s = slipOf(g, me);
  s.state = 'ground'; s.x = 2; s.z = 2;
  me.x = 2; me.z = 2;
  assert.ok(!taggable(g, me), 'standing on your slipper is safe');
  me.x = 2.6;
  assert.ok(taggable(g, me), 'a step off it is not');
  me.z = LINE_Z + 0.5;
  assert.ok(!taggable(g, me), 'home is safe');
  me.z = 2; me.x = 2.6;
  g.can.state = 'down'; g.can.x = -4; g.can.z = -4;
  t.x = me.x + 0.3; t.z = me.z;
  run(g, DT, NOINPUT);
  assert.equal(me.role, 'thrower', 'no tags while the can is down');
});

test('a tag swaps the roles: you become the taya, and the old taya walks home with a slipper, safe', () => {
  const g = started(); freeze(g);
  const me = you(g), t = taya(g);
  me.hasSlip = false; slipOf(g, me).state = 'ground'; slipOf(g, me).x = -5; slipOf(g, me).z = -5;
  me.x = 1; me.z = 2; t.x = 1.4; t.z = 2;
  const ev = run(g, DT, NOINPUT);
  const e = ev.find((x) => x.type === 'tag');
  assert.ok(e && e.kid === me.i && e.taya === t.i);
  assert.equal(me.role, 'taya'); assert.equal(t.role, 'thrower');
  assert.ok(t.hasSlip && t.grace > 0 && !taggable(g, t));
  assert.equal(me.stats.tagged, 1);
  // as the taya, you cannot step into home
  run(g, 3, walk(0, 1));
  assert.ok(me.z < LINE_Z);
});

test('as the taya, you score for every tag', () => {
  const g = started(); freeze(g);
  const me = you(g), t = taya(g);
  // make you the taya by getting tagged, then catch someone
  me.hasSlip = false; slipOf(g, me).state = 'ground'; slipOf(g, me).x = -5; slipOf(g, me).z = -5;
  me.x = 1; me.z = 2; t.x = 1.4; t.z = 2;
  run(g, DT);
  const kid = g.kids.find((k) => k.role === 'thrower' && !k.you && k !== t);
  kid.hasSlip = false; slipOf(g, kid).state = 'ground'; slipOf(g, kid).x = 6; slipOf(g, kid).z = -6;
  kid.x = me.x + 0.5; kid.z = me.z; kid.grace = 0;
  assert.ok(!run(g, DT).some((e) => e.type === 'tag'), 'a new taya counts to three first');
  me.count = 0; kid.x = me.x + 0.5; kid.z = me.z;
  const before = g.score;
  const ev = run(g, DT);
  assert.ok(ev.some((e) => e.type === 'tag' && e.taya === me.i));
  assert.equal(g.score - before, POINTS.tag);
  assert.equal(me.role, 'thrower');
});

test('making it home with your slipper after going out scores', () => {
  const g = started(); freeze(g);
  const me = you(g); me.cool = 0;
  run(g, DT, { ...NOINPUT, throw: { yaw: Math.PI + 0.5, power: 0.25 } });
  run(g, 3);
  const s = slipOf(g, me);
  const t = taya(g); t.x = -6; t.z = -8; g.diff = { ...g.diff, taya: 0.01 }; // the taya dawdles
  for (let k = 0; k < 600 && !me.hasSlip; k++) { const d = Math.hypot(s.x - me.x, s.z - me.z); tick(g, walk((s.x - me.x) / d, (s.z - me.z) / d)); }
  const before = g.score;
  const ev = run(g, 4, walk(0, 1));
  assert.ok(ev.some((e) => e.type === 'home' && e.kid === me.i));
  assert.equal(g.score - before, POINTS.home);
});

test('the game runs to Nanay\'s call: three minutes, then over', () => {
  const g = started();
  const ev = run(g, g.limit + 1);
  assert.equal(g.phase, 'over');
  assert.ok(ev.some((e) => e.type === 'over'));
});

test('you are never the first taya', () => {
  for (let seed = 1; seed <= 30; seed++) assert.ok(!createGame({ seed }).kids.find((k) => k.you).role.includes('taya'));
});

test('the other kids keep the game going on every difficulty: knocks, fetches and tags', () => {
  for (const d of Object.keys(DIFFICULTY)) {
    const g = started({ difficulty: d, seed: 9 });
    const ev = run(g, 180);
    const n = (t) => ev.filter((e) => e.type === t).length;
    assert.ok(n('knock') >= 5, `${d}: ${n('knock')} knocks`);
    assert.ok(n('tag') >= 3, `${d}: ${n('tag')} tags`);
    assert.ok(n('canSet') >= n('knock') - 1, `${d}: the taya always fixes the can`);
  }
  assert.ok(DIFFICULTY.mahirap.taya > DIFFICULTY.katamtaman.taya && DIFFICULTY.katamtaman.taya > DIFFICULTY.madali.taya);
  assert.ok(DIFFICULTY.madali.taya < KID.speed, 'on Madali you can outrun the taya');
});

test('replays are exact, whatever the frame rate', () => {
  const input = (k) => (k === 200 ? { ...NOINPUT, throw: { yaw: Math.PI, power: 0.5 } } : k > 400 && k < 700 ? walk(0.3, -1) : NOINPUT);
  const a = createGame({ seed: 12 }), b = createGame({ seed: 12 });
  for (let k = 0; k < 3000; k++) tick(a, input(k));
  for (let k = 0; k < 3000; k++) tick(b, input(k));
  assert.equal(hashState(a), hashState(b));
  const c = createGame({ seed: 12 }), d = createGame({ seed: 12 });
  for (let k = 0; k < 900; k++) step(c, NOINPUT, 1 / 60);
  for (let k = 0; k < 300; k++) step(d, NOINPUT, 1 / 20);
  assert.equal(hashState(c), hashState(d));
  void CAN;
});

test('options: the length of the afternoon, endless play, fewer players, and starting as the taya', () => {
  assert.equal(createGame({ minutes: 8 }).limit, 8 * 60);
  assert.equal(createGame({ endless: true }).limit, Infinity);
  const small = createGame({ players: 3 });
  assert.equal(small.kids.length, 3);
  assert.equal(small.slips.length, 3);
  assert.ok(taya(small) && !taya(small).you, 'someone other than you starts as taya');
  assert.equal(createGame({ players: 9 }).kids.length, 5, 'no more kids than there are');
  const g = createGame({ startTaya: true, seed: 7 });
  assert.ok(taya(g).you, 'you guard the can first');
  // an endless afternoon keeps going; three players still play a full game with knocks and tags
  const e = started({ endless: true, players: 3 });
  const ev = run(e, 200);
  assert.equal(e.phase, 'play');
  assert.ok(ev.some((x) => x.type === 'throw'), 'the kids throw');
});

test('knocks in a row and long shots score more; being tagged ends the streak', () => {
  const g = started(); freeze(g);
  const me = you(g);
  const knockFrom = (x, z) => {
    me.x = x; me.z = z; me.cool = 0; me.hasSlip = true; slipOf(g, me).state = 'hand';
    Object.assign(g.can, { state: 'up', x: 0, z: 0, y: 0, tilt: 0, vx: 0, vy: 0, vz: 0 });
    run(g, DT, { ...NOINPUT, throw: { yaw: yawTo(me.x, me.z, 0, 0), power: powerFor(me.x, me.z, 0, 0) } });
    return run(g, 2.5).find((e) => e.type === 'knock');
  };
  const a = knockFrom(0, LINE_Z + 0.5), b = knockFrom(0, LINE_Z + 0.5), c = knockFrom(0, FAR + 0.6);
  assert.deepEqual([a.streak, b.streak, c.streak], [1, 2, 3]);
  assert.equal(a.points, POINTS.knock); assert.ok(!a.far);
  assert.equal(b.points, POINTS.knock + POINTS.streak);
  assert.ok(c.far && c.range >= FAR);
  assert.equal(c.points, POINTS.knock + POINTS.far + 2 * POINTS.streak);
  assert.equal(me.stats.bestStreak, 3); assert.equal(me.stats.far, 1);
  // tagged: the streak starts over
  const t = taya(g); Object.assign(g.can, { state: 'up', x: 0, z: 0, y: 0, tilt: 0 }); t.chore = 'guard'; t.count = 0;
  me.hasSlip = false; slipOf(g, me).state = 'ground'; me.x = 1; me.z = 2; t.x = 1.4; t.z = 2; me.grace = 0;
  assert.ok(run(g, DT).some((e) => e.type === 'tag' && e.kid === me.i));
  assert.equal(me.streak, 0);
});
