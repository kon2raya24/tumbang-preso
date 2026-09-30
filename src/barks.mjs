// What the kids shout: a short line in a bubble over a head, on what happens in the game and now and
// then while they wait. This only picks the words; the view draws the bubble (view.bark).
import { isHome, taya } from './sim.mjs';

const LINES = {
  first: ['Ako taya? Sige!', 'Humanda kayo!', 'Walang daya, ha!'],
  knock: ['TUMBA!', 'Sapul!', 'Yes! Tumba!', 'Ayos!'],
  cheer: ['Takbo na!', 'Galing!', 'Kunin n\'yo na!', 'Bilis!'],
  miss: ['Sayang!', 'Muntik na!', 'Ang layo, uy!', 'Sablay!'],
  tagger: ['Huli ka!', 'Taya ka na!', 'Yari ka!', 'Ikaw na!'],
  tagged: ['Daya!', 'Hala!', 'Ay, taya na \'ko!', 'Hindi pa!'],
  home: ['Ligtas!', 'Safe!', 'Hindi mo \'ko abot!'],
  set: ['Nakatayo na!', 'Balik kayo rito!', 'Sige, lapit!'],
  taunt: ['Lapit ka pa...', 'Sino susunod?', 'Bantay-sarado!', 'Subukan mo!'],
  wait: ['Tira na!', 'Asintahin mo!', 'Bilisan mo!', 'Kaya mo \'yan!'],
};

export function createBarks(say) {
  const quiet = new Map(); // each kid waits a moment before speaking again
  let idle = 5;
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const line = (k, key, force = false) => {
    if (!k || k.you || (!force && (quiet.get(k.i) || 0) > 0)) return;
    quiet.set(k.i, 2.4); say(k.i, pick(LINES[key]));
  };
  const other = (g, not, want) => g.kids.find((o) => o !== not && !o.you && want(o));
  return {
    event(e, g) {
      const k = e.kid !== undefined ? g.kids[e.kid] : null;
      switch (e.type) {
        case 'go': line(taya(g), 'first', true); break;
        case 'knock': line(k, 'knock', true); if (Math.random() < 0.7) line(other(g, k, (o) => o.role === 'thrower' && isHome(o)), 'cheer'); break;
        case 'land': if (g.can.state === 'up' && Math.random() < 0.5) line(other(g, g.kids[e.owner], () => true), 'miss'); break;
        case 'tag': line(g.kids[e.taya], 'tagger', true); line(g.kids[e.kid], 'tagged', true); break;
        case 'home': if (Math.random() < 0.5) line(k, 'home'); break;
        case 'canSet': if (Math.random() < 0.6) line(taya(g), 'set'); break;
        default: break;
      }
    },
    tick(g, dt) {
      for (const [i, s] of quiet) quiet.set(i, s - dt);
      if ((idle -= dt) > 0) return;
      idle = 4 + Math.random() * 5;
      const t = taya(g), out = g.kids.some((o) => o.role === 'thrower' && !isHome(o));
      if (t && out && g.can.state === 'up') line(t, 'taunt');
      else line(other(g, null, (o) => o.role === 'thrower' && isHome(o)), 'wait');
    },
  };
}
