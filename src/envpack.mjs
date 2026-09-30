// Real surroundings for the eskinita: CC0 scans from Poly Haven (converted by the Bakbakan tools).
// - a photographed sky lights and reflects everything
// - the big surfaces (road, floor, bleachers, walls, bark, ground) get scanned materials
// - real props stand where a street, a court, a market or a forest would have them
// Each stage loads only what it uses. Without the files, the painted stage stays as it is.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-mocap.min.js';
import { HDRLoader } from './vendor/three-fx.min.js';

// the sky: [photo for light, strength, turn]; the one seen behind: [photo, turn, brightness]
const SKY = { eskinita: ['pretville_street', 0.55, 1.2] };
const BACKDROP = { eskinita: ['kloppenheim_06_puresky', 2.2, 1] };

// [prop, x, y, z, turn, scale]. The eskinita runs along z; the houses stand at x = ±7.8, facing in.
const L = Math.PI / 2, W = 7.8; // a turn that faces a prop out from the left wall (+x) or the right (-x)
const PLACES = {
  eskinita: [
    // the sari-sari store's tambayan: monobloc chairs, a bench, a table with a jug and a basket
    ['plastic_monobloc_chair_01', 7.1, 0, -5.5, -L + 0.3, 1], ['plastic_monobloc_chair_01', 7.05, 0, -4.7, -L - 0.2, 1], ['painted_wooden_bench', 7.3, 0, -2.9, -L, 1],
    ['wooden_table_02', 7.2, 0, -6.6, -L, 0.9], ['jug_01', 7.2, 'table', -6.8, 0.3, 1], ['wicker_basket_02', 7.25, 'table', -6.3, 0, 1],
    ['plastic_crate_02', 7.35, 0, -0.9, 0.2, 1], ['plastic_crate_02', 7.36, 0.25, -0.92, -0.1, 1], ['plastic_bottle_gallon', 7.35, 0.5, -0.9, 0.4, 1], ['small_lpg_tank', 7.4, 0, 0.1, 0, 1],
    // along the walls: plants in pots and old cans, crates, rubbish, a tyre, a broom
    ['potted_plant_01', -7.45, 0, -18, 0, 1], ['potted_plant_02', -7.45, 0, -17.4, 1, 1], ['planter_pot_clay', -7.5, 0, -9.2, 0, 1.1], ['potted_plant_01', 7.45, 0, -14.5, 2, 1],
    ['potted_plant_02', 7.45, 0, 4.4, 0.5, 0.9], ['planter_pot_clay', -7.5, 0, 12.2, 0.3, 1], ['potted_plant_01', -7.45, 0, 16.5, 1.4, 1], ['potted_plant_02', 7.45, 0, 18.8, 2.2, 1],
    ['plastic_crate_01', -7.3, 0, -7.9, 0.3, 1], ['plastic_crate_01', -7.28, 0.26, -7.95, -0.2, 1], ['wooden_crate_01', 7.3, 0, 12.9, -L, 1],
    ['trashbag', -7.3, 0, 3.4, 0.2, 1], ['trashbag', -7.1, 0, 4.0, 1.4, 0.9], ['cardboard_box_01', -7.3, 0, 4.6, 0.4, 1],
    ['old_tyre', -7.45, 0, -13.8, L, 1], ['plastic_broom', 7.5, 0, 8.4, -L, 1], ['plastic_jerrycan', -7.35, 0, -11.5, 0.8, 1], ['wooden_bucket_01', 7.35, 0, 15.6, 0, 1],
    ['folding_wooden_stool', 4.4, 0, -12.6, 0.5, 1], ['wooden_stool_01', -7.2, 0, 4.8, 0.2, 1],
    // on the walls: aircon units, a meter box
    ['exterior_aircon_unit', -W + 0.2, 3.6, -9.5, L, 0.7], ['exterior_aircon_unit', W - 0.2, 3.8, 8.5, -L, 0.7], ['exterior_aircon_unit', -W + 0.2, 4.1, 14, L, 0.7], ['utility_box_02', W - 0.22, 1.2, 10.8, -L, 0.8],
    // the ground: a manhole; trees past the cross street
    ['water_manhole_cover', 2.6, 0.005, 14.4, 0.3, 1], ['island_tree_01', 2, 0, -39, 0.4, 1.9], ['island_tree_02', -10, 0, -38.5, 1.2, 1.6], ['island_tree_01', 12, 0, -40, 2, 1.7],
  ],
};

// what each tagged surface becomes: [Poly Haven material, metres a tile covers, roughness factor]
const SURF = {
  eskinita: ['concrete_floor_worn_001', 3, 1], asphalt: ['asphalt_02', 3, 1], roof: ['corrugated_iron_02', 2, 0.8],
  plaster: ['damaged_plaster', 2.2, 1], // relief only: the painted front keeps its colours and windows
  hollowblock: ['concrete_block_wall', 2.4, 1], wood: ['weathered_plank_siding', 1.5, 1], pavement: ['concrete_pavement', 1.5, 1],
};

export async function loadEnv(base = 'assets/env/') {
  const res = await fetch(base + 'env.json');
  if (!res.ok) throw new Error('no env');
  return { base, index: await res.json(), props: new Map(), tex: new Map(), sky: new Map() };
}

const gltf = new GLTFLoader(), texLoader = new THREE.TextureLoader();
const loadProp = (env, id) => {
  if (!env.index.props[id]) return Promise.resolve(null);
  if (!env.props.has(id)) env.props.set(id, gltf.loadAsync(env.base + 'props/' + id + '.glb').then((g) => g.scene).catch(() => null));
  return env.props.get(id);
};
const loadTex = (env, id) => {
  const t = env.index.tex[id];
  if (!t) return Promise.resolve(null);
  if (!env.tex.has(id)) env.tex.set(id, Promise.all(['diff', 'nor', 'arm', 'rough'].map((k) => (t[k] ? texLoader.loadAsync(env.base + t[k]).catch(() => null) : null))).then(([diff, nor, arm, rough]) => {
    if (diff) diff.colorSpace = THREE.SRGBColorSpace;
    for (const x of [diff, nor, arm, rough]) if (x) { x.wrapS = x.wrapT = THREE.RepeatWrapping; x.anisotropy = 8; }
    return { diff, nor, arm, rough };
  }));
  return env.tex.get(id);
};

// Dress the stage that's up now. `ctx` is the view: scene, renderer, the stage and whether it's still current.
export async function dress(env, id, stage, ctx) {
  const [skyId, skyPower, skyTurn] = SKY[id] || [];
  const jobs = [];
  // the sky
  if (skyId && env.index.sky[skyId]) jobs.push((async () => {
    if (!env.sky.has(skyId)) env.sky.set(skyId, new HDRLoader().loadAsync(env.base + env.index.sky[skyId]).then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; const rt = ctx.pmrem.fromEquirectangular(t); t.dispose(); return rt; }).catch(() => null));
    const rt = await env.sky.get(skyId);
    if (rt && ctx.current()) ctx.setEnvironment(rt.texture, skyPower, skyTurn);
  })());
  // the sky behind
  const [bgId, bgTurn, bgBright] = BACKDROP[id] || [];
  if (bgId && env.index.backdrop && env.index.backdrop[bgId]) jobs.push(texLoader.loadAsync(env.base + env.index.backdrop[bgId]).then((t) => {
    if (!ctx.current()) return;
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; ctx.setBackdrop(t, bgTurn, bgBright);
    stage.group.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m.userData.skyStandIn)) o.visible = false; });
  }).catch(() => { /* the painted sky stays */ }));
  // the surfaces
  const mats = new Map();
  stage.group.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData.surface) mats.set(m, m.userData.surface); });
  for (const [m, s] of mats) jobs.push((async () => {
    const [texId, tile, rough] = SURF[s.kind] || [];
    const t = texId && (await loadTex(env, texId));
    if (!t || !t.diff || !ctx.current()) return;
    const rep = [s.w / tile, s.h / tile], use = (x) => { if (!x) return null; const c = x.clone(); c.repeat.set(...rep); if (s.rot) c.rotation = s.rot; c.needsUpdate = true; return c; };
    if (s.detail) { m.normalMap = use(t.nor); m.normalScale = new THREE.Vector2(0.8, 0.8); if (t.arm) m.roughnessMap = use(t.arm); m.needsUpdate = true; return; }
    m.map = use(t.diff); m.normalMap = use(t.nor); m.normalScale = new THREE.Vector2(1, 1);
    if (t.arm) { m.roughnessMap = use(t.arm); m.aoMap = use(t.arm); m.aoMapIntensity = 0.8; m.metalnessMap = null; m.metalness = 0; }
    else if (t.rough) m.roughnessMap = use(t.rough);
    if (s.keepRough) m.roughnessMap = s.keepRough;
    m.roughness = s.keepRough ? 1 : rough; m.color.set(s.tint || '#ffffff');
    m.needsUpdate = true;
  })());
  // the props
  const place = PLACES[id] || [];
  const table = env.index.props.wooden_table_02 ? env.index.props.wooden_table_02.size[1] * 0.9 : 0.75;
  const group = new THREE.Group(); group.name = 'real props';
  for (const [pid, x, y, z, ry, s] of place) jobs.push(loadProp(env, pid).then((tpl) => {
    if (!tpl || !ctx.current()) return;
    const o = tpl.clone(); o.position.set(x, y === 'table' ? table : y, z); o.rotation.y = ry; o.scale.setScalar(s);
    o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    group.add(o); placed++;
  }));
  let placed = 0;
  await Promise.all(jobs);
  if (!ctx.current()) return false;
  group.traverse((o) => { o.userData.shared = true; });
  stage.group.add(group);
  // the painted stand-ins the real ones replace
  if (placed > place.length / 2) stage.group.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m.userData.standIn)) o.visible = false; });
  return true;
}

