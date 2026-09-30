import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, you, FAR } from '../src/sim.mjs';
import { MEDALS, earned } from '../src/medals.mjs';

test('medals: knocks, tags, time and the end of the afternoon; never in the demo', () => {
  const g = createGame({ seed: 3 }), me = you(g);
  assert.equal(new Set(MEDALS.map((m) => m.id)).size, MEDALS.length);
  assert.deepEqual(earned(g, { type: 'knock', kid: me.i, far: true, range: FAR + 1, streak: 3, saves: 0 }), ['tumba', 'asintado', 'sunod']);
  assert.deepEqual(earned(g, { type: 'knock', kid: 1, far: true, streak: 3, saves: 3 }), [], 'someone else\'s knock');
  me.stats.tags = 3;
  assert.deepEqual(earned(g, { type: 'tag', taya: me.i, kid: 2 }), ['bantay']);
  me.stats.knocks = 2; g.kids[1].stats.knocks = 1;
  assert.deepEqual(earned(g, null), ['malinis', 'hari']);
  me.stats.tagged = 1; g.kids[1].stats.knocks = 2;
  assert.deepEqual(earned(g, null), []);
  const e = createGame({ seed: 3, endless: true }); e.t = 601;
  assert.deepEqual(earned(e, { type: 'clock' }), ['dilim']);
  assert.deepEqual(earned(createGame({ seed: 3, demo: true }), { type: 'knock', kid: 0, far: true, streak: 1, saves: 0 }), []);
});
