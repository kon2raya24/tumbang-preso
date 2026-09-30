// The barkada, real: Mixamo teenagers with motion capture (converted by the Bakbakan tools), driven by
// the game's state. Each kid idles, walks, runs, winds up and throws, dives and gets up, picks up a
// slipper, carries the can and sets it down, counts, sulks when tagged and cheers a knock. In first
// person you're inside your own body, head hidden, so you see your own arms and your own throw.
// Without the files, the view keeps its simple kids.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader, cloneSkinned } from './vendor/three-mocap.min.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const TAU = Math.PI * 2;
const canon = (n) => n.replace(/^mixamorig\d*[:_]?/i, '');
const UPPER = /^(Spine|Spine1|Spine2|Neck|Head|HeadTop_End|Left(Shoulder|Arm|ForeArm|Hand).*|Right(Shoulder|Arm|ForeArm|Hand).*)$/;

// the first name that matches, else a stand-in
const SLOTS = {
  idle: [[/happy idle/i, /^idle/i, /fighting idle/i], []],
  walk: [[/^walking$/i], ['run']],
  run: [[/^running/i], ['walk']],
  throw: [[/^throw/i], ['idle']],
  pick: [[/picking up/i], ['idle']],
  carry: [[/carrying/i], ['walk']],
  set: [[/putting down/i, /put down/i], ['pick']],
  dive: [[/tackle/i, /diving/i, /dive/i], ['pick']], // the taya lunges forward to tag
  sad: [[/defeated/i], ['idle']],
  look: [[/looking around/i], ['idle']],
  cheer: [[/^cheering$/i, /victory/i], ['idle']],
};
// who plays whom, and how tall
export const CAST = [
  { id: 'bryce', h: 1.55 }, // Ikaw, in the red shirt
  { id: 'remy', h: 1.5 }, // Buboy
  { id: 'sophie', h: 1.46 }, // Nene
  { id: 'elizabeth', h: 1.5 }, // Kulot
  { id: 'megan', h: 1.52 }, // Bong
];

export async function loadPeople(base = 'assets/people/', onProgress = null) {
  const res = await fetch(base + 'clips.json');
  if (!res.ok) throw new Error('no people');
  const meta = await res.json();
  const loader = new GLTFLoader(), templates = {}, got = {}, tot = {};
  const report = () => { if (!onProgress) return; const t = Object.values(tot).reduce((a, b) => a + b, 0); if (t) onProgress(Object.values(got).reduce((a, b) => a + b, 0) / t); };
  await Promise.all(Object.keys(meta.chars).map(async (id) => { templates[id] = (await loader.loadAsync(base + id + '.glb', (e) => { got[id] = e.loaded; if (e.total) tot[id] = e.total; report(); })).scene; }));
  const names = Object.keys(meta.clips), slots = {};
  for (const [slot, [pats]] of Object.entries(SLOTS)) { const n = pats.map((p) => names.find((x) => p.test(x))).find(Boolean); if (n) slots[slot] = n; }
  const resolve = (slot, seen = new Set()) => { if (slots[slot]) return slots[slot]; seen.add(slot); for (const alt of SLOTS[slot][1]) if (!seen.has(alt)) { const r = resolve(alt, seen); if (r) return r; } return slots.idle || names[0]; };
  for (const slot of Object.keys(SLOTS)) slots[slot] = resolve(slot);
  return { meta, templates, slots };
}

// A clip bound to this kid's bones. The game moves the kids, so the hips keep only their height:
// no clip walks anyone off across the street.
function bindClips(lib, bones, hipRest) {
  const out = {}, upper = {}, lower = {};
  for (const [name, c] of Object.entries(lib.meta.clips)) {
    const tracks = [], up = [], low = [];
    for (const [bone, kind, times, values] of c.tr) {
      const b = bones[bone];
      if (!b) continue;
      let t;
      if (kind === 'q') t = new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values);
      else {
        const k = hipRest / c.hip, v = values.slice();
        for (let i = 0; i < v.length; i += 3) { v[i] = 0; v[i + 1] *= k; v[i + 2] = 0; }
        t = new THREE.VectorKeyframeTrack(`${b.name}.position`, times, v);
      }
      tracks.push(t); (UPPER.test(bone) ? up : low).push(t);
    }
    out[name] = new THREE.AnimationClip(name, c.d, tracks);
    upper[name] = new THREE.AnimationClip(name + ':upper', c.d, up);
    lower[name] = new THREE.AnimationClip(name + ':lower', c.d, low);
  }
  return { out, upper, lower };
}

export function personModel(lib, index, scene, { slipper = null, bandana = true } = {}) {
  const cast = CAST[index % CAST.length], meta = lib.meta.chars[cast.id];
  if (!meta || !lib.templates[cast.id]) return null;
  const model = cloneSkinned(lib.templates[cast.id]), root = new THREE.Group();
  root.add(model);
  model.scale.multiplyScalar(cast.h / meta.height);
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[canon(o.name)] = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const clips = bindClips(lib, bones, bones.Hips.position.y);
  const mixer = new THREE.AnimationMixer(model), actions = new Map();
  // part: 'full', or 'upper' and 'lower', when the can is carried in the arms while the legs walk
  const action = (name, part = 'full') => {
    const key = part + ':' + name;
    if (!actions.has(key)) { const a = mixer.clipAction(part === 'upper' ? clips.upper[name] : part === 'lower' ? clips.lower[name] : clips.out[name]); a.play(); a.paused = true; a.setEffectiveWeight(0); a.userData = { part }; actions.set(key, a); }
    return actions.get(key);
  };
  // things in their hands and on their heads, placed in metres (a mount undoes the bone's scale)
  const ws = new THREE.Vector3();
  const mount = (bone, obj) => { bone.updateWorldMatrix(true, false); bone.getWorldScale(ws); const g = new THREE.Group(); g.scale.setScalar(1 / ws.x); g.add(obj); bone.add(g); return g; };
  let slip = null, band = null;
  if (slipper && bones.RightHand) { slip = mount(bones.RightHand, slipper); slipper.position.set(0.02, 0.09, 0.03); slipper.rotation.set(0, 0, Math.PI / 2); }
  if (bandana && bones.Head) {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.018, 8, 24), new THREE.MeshStandardMaterial({ color: '#d8222e', roughness: 0.8 }));
    b.rotation.x = Math.PI / 2; b.position.set(0, 0.1, 0.005); b.scale.set(1, 1.12, 1); band = mount(bones.Head, b);
  }
  scene.add(root);
  return { root, model, mixer, bones, action, layers: [], slip, band, cast, stateKey: '', stateT: 0, loopT: Math.random() * 3, pickT: 0, cheerT: 0, sulkT: 0, setT: 0, yaw: null, headHidden: false };
}

// a moment the view saw happen: these play once over what the game is doing
export function personEvent(m, type) {
  if (!m) return;
  if (type === 'pickup') m.pickT = 0.7;
  else if (type === 'cheer') m.cheerT = 1.4;
  else if (type === 'sulk') m.sulkT = 1.1;
}

// This frame's clip (and time) for a kid.
function plan(m, k, g, lib, o) {
  const S = lib.slots, D = (slot) => lib.meta.clips[S[slot]].d, hitOf = (slot) => { const c = lib.meta.clips[S[slot]]; const h = c.hit && c.hit.hand; return h && h > 0.05 && h < c.d * 0.9 ? h : c.d * 0.45; };
  const loop = (slot, speed = 1) => ({ slot, t: (m.loopT * speed) % D(slot) });
  const at = (slot, frac) => ({ slot, t: clamp(frac, 0, 1) * D(slot) });
  const carrying = g.can.state === 'carried' && k.role === 'taya';
  if (k.dive > 0) return at('dive', lerp(0.12, 0.5, 1 - k.dive / 0.32));
  if (k.recover > 0) return at('dive', lerp(0.5, 0.95, 1 - k.recover / 0.5));
  // aiming: cocked back, ready (in first person a little further on, so your hand and slipper are in view)
  const ready = o.firstPerson ? 0.07 : 0.18;
  if (k.anim.throwT > 0 && k.role === 'thrower') { const f = 1 - k.anim.throwT / 0.35, h = hitOf('throw'); return { slot: 'throw', t: clamp(lerp(h - ready, h + 0.3, f), 0, D('throw')) }; }
  if (o.aiming) return { slot: 'throw', t: Math.max(0, hitOf('throw') - ready) };
  if (carrying && k.chore === 'setting') return at('set', lerp(0.3, 0.55, 1 - clamp((g.can.setT || 0) / 0.55, 0, 1)));
  if (m.pickT > 0) { const f = 1 - m.pickT / 0.7; return at('pick', f < 0.5 ? lerp(0.06, 0.28, f * 2) : lerp(0.28, 0.5, f * 2 - 1)); }
  if (carrying) { const hold = at('carry', 0.3); if (k.speed <= 0.3) return hold; return { ...(k.speed > 3.4 ? loop('run', 0.75 + k.speed * 0.08) : loop('walk', 0.6 + k.speed * 0.25)), upper: hold }; } // the can in both arms, the legs on the move
  if (m.sulkT > 0) return at('sad', lerp(0.05, 0.5, 1 - m.sulkT / 1.1));
  if (m.cheerT > 0 && k.speed < 0.5) return loop('cheer');
  if (k.speed > 3.4) return loop('run', 0.75 + k.speed * 0.08);
  if (k.speed > 0.35) return loop('walk', 0.6 + k.speed * 0.25);
  if (k.role === 'taya' && k.count > 0) return loop('look');
  return loop('idle');
}

// Pose a kid for this frame: crossfade to what they're doing, place them, turn them.
export function drivePerson(m, k, g, lib, dt, o = {}) {
  m.pickT = Math.max(0, m.pickT - dt); m.cheerT = Math.max(0, m.cheerT - dt); m.sulkT = Math.max(0, m.sulkT - dt);
  m.loopT += dt;
  const want = plan(m, k, g, lib, o);
  const wanted = want.upper
    ? [[m.action(lib.slots[want.slot], 'lower'), want.t], [m.action(lib.slots[want.upper.slot], 'upper'), want.upper.t]]
    : [[m.action(lib.slots[want.slot]), want.t]];
  const oneShot = want.slot === 'throw' || want.slot === 'dive' || want.slot === 'pick';
  const fade = oneShot ? 0.06 : 0.16;
  for (const [a, t] of wanted) { let l = m.layers.find((x) => x.a === a); if (!l) { l = { a, w: m.layers.length ? 0 : 1 }; m.layers.push(l); } l.t = t; l.on = true; }
  for (const x of m.layers) { if (!wanted.some(([a]) => a === x.a)) x.on = false; x.w = clamp(x.w + (x.on ? 1 : -1) * dt / fade, 0, 1); }
  for (const x of m.layers) if (!x.on && x.w <= 0) x.a.setEffectiveWeight(0); // a clip that's faded out lets go completely
  m.layers = m.layers.filter((x) => x.on || x.w > 0);
  // weights must cover every bone exactly once, or the rest blends toward the bind pose
  const sum = (part) => m.layers.reduce((acc, x) => acc + (x.a.userData.part === part ? x.w : 0), 0);
  const F = sum('full'), Lo = sum('lower'), U = sum('upper'), sc = F + Lo > 0 ? 1 / (F + Lo) : 1, su = U > 0 ? Math.max(0, 1 - F * sc) / U : 0;
  for (const x of m.layers) { x.a.time = x.t; x.a.setEffectiveWeight(x.a.userData.part === 'upper' ? x.w * su : x.w * sc); }
  m.mixer.update(0);
  // where they stand and which way they face
  m.root.position.set(k.x, 0, k.z);
  const yaw = o.yaw ?? k.yaw;
  m.yaw = m.yaw === null ? yaw : m.yaw + ((((yaw - m.yaw + Math.PI) % TAU) + TAU) % TAU - Math.PI) * Math.min(1, dt * 12);
  m.root.rotation.y = m.yaw;
  if (m.slip) m.slip.visible = k.role === 'thrower' && k.hasSlip;
  if (m.band) m.band.visible = k.role === 'taya';
  // first person: the head goes, so the camera can sit where the eyes were
  const hide = !!o.firstPerson;
  if (hide !== m.headHidden && m.bones.Head) { m.bones.Head.scale.setScalar(hide ? 0.001 : 1); m.headHidden = hide; }
}

// Where a kid's eyes are (for the first-person camera), and their hands (for the can they carry).
const hv = new THREE.Vector3();
export function eyesOf(m, out) { m.model.updateMatrixWorld(true); const h = m.bones.Head; h.getWorldPosition(out); out.y += 0.07; return out; }
export function handsOf(m, out) { m.model.updateMatrixWorld(true); m.bones.LeftHand.getWorldPosition(out); m.bones.RightHand.getWorldPosition(hv); return out.add(hv).multiplyScalar(0.5); }
