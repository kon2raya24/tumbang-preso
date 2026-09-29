// Seeded PRNG (mulberry32) kept as an integer on the state it belongs to, so a whole game can be
// copied with structuredClone and the copy rolls the same numbers.
export function rand(o) {
  o.rs = (o.rs + 0x6d2b79f5) >>> 0;
  let t = o.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
