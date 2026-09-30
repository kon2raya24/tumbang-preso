// Medals, kept on the device: small goals across many afternoons. `glyph` is what the coin shows.
import { FAR, you } from './sim.mjs';

export const MEDALS = [
  { id: 'tumba', glyph: '1', name: 'Unang Tumba', desc: 'Patumbahin ang lata · Knock the can down' },
  { id: 'asintado', glyph: `${FAR}m`, name: 'Asintado', desc: `Tumba mula ${FAR} m o higit · A knock from ${FAR} m or more` },
  { id: 'sunod', glyph: '×3', name: 'Sunod-sunod', desc: '3 tumba nang hindi nahuhuli · 3 knocks in a row, never tagged' },
  { id: 'salba', glyph: '+3', name: 'Tagapagligtas', desc: 'Iligtas ang 3 sa isang tumba · Save 3 friends with one knock' },
  { id: 'bantay', glyph: '3', name: 'Bantay-Sarado', desc: 'Makahuli ng 3 bilang taya · Tag 3 kids in one afternoon' },
  { id: 'malinis', glyph: '0', name: 'Malinis', desc: 'Buong hapon, hindi nataya · A whole afternoon, never tagged' },
  { id: 'hari', glyph: '★', name: 'Hari ng Kalye', desc: 'Pinakamaraming tumba sa barkada · The most knocks of anyone' },
  { id: 'batang', glyph: '1K', name: 'Batang Kalye', desc: '1,000 puntos sa Mahirap · 1,000 points on Mahirap' },
  { id: 'dilim', glyph: '10′', name: 'Hanggang Dilim', desc: '10 minuto sa Walang Katapusan · 10 minutes of endless play' },
];

// The medals an event earns: a knock or a tag, `{ type: 'clock' }` for time played, `null` for the end of the afternoon.
export function earned(g, e) {
  const me = you(g), got = [];
  if (!me || g.demo) return got;
  if (!e) {
    const others = Math.max(0, ...g.kids.filter((k) => !k.you).map((k) => k.stats.knocks));
    if (!g.endless && me.stats.tagged === 0 && me.stats.knocks > 0) got.push('malinis');
    if (me.stats.knocks > others) got.push('hari');
    if (g.difficulty === 'mahirap' && g.score >= 1000) got.push('batang');
  } else if (e.type === 'clock') {
    if (g.endless && g.t >= 600) got.push('dilim');
  } else if (e.type === 'knock' && e.kid === me.i) {
    got.push('tumba');
    if (e.far) got.push('asintado');
    if (e.streak >= 3) got.push('sunod');
    if (e.saves >= 3) got.push('salba');
  } else if (e.type === 'tag' && e.taya === me.i && me.stats.tags >= 3) got.push('bantay');
  return got;
}
