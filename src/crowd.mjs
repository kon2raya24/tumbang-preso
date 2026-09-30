// The real crowd: Mixamo people frozen in a few poses by tools/crowd.html (sitting and clapping,
// cheering, standing and clapping), drawn instanced. Each one claps at their own pace, and they all
// jump up and cheer at a knockout. Without the files, the stage keeps its own painted crowd.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/three-mocap.min.js';

export async function loadCrowd(base = 'assets/fighters/') {
  const [gl, meta] = await Promise.all([new GLTFLoader().loadAsync(base + 'crowd.glb'), fetch(base + 'crowd.json').then((r) => { if (!r.ok) throw new Error('no crowd'); return r.json(); })]);
  const people = {};
  gl.scene.traverse((o) => { if (o.parent && o.name.includes('|') && o.name.split('|').length === 2) { const [id, pose] = o.name.split('|'); (people[id] ||= {})[pose] = o.children.filter((m) => m.isMesh); } });
  return { people, meta, ids: Object.keys(people).filter((id) => meta[id]) };
}

// seats: [{ x, y (the seat top), z, stand }]; returns the group to add and a per-frame update.
export function buildCrowd(lib, seats, rand = Math.random) {
  const group = new THREE.Group(); group.name = 'real crowd';
  const who = seats.map((s, i) => {
    const id = lib.ids[(i * 7 + Math.floor(rand() * 3)) % lib.ids.length];
    return { ...s, id, phase: rand(), rate: 1.9 + rand() * 1.4, scale: 0.95 + rand() * 0.09, turn: s.face ?? -Math.atan2(s.x, 7) * 0.6 + (rand() - 0.5) * 0.3, rest: rand() * 20, lean: (rand() - 0.5) * 0.08 }; // `face`: which way they look, if the seat says
  });
  // one instanced mesh per person, pose and material
  const meshes = {};
  for (const id of lib.ids) {
    const n = who.filter((w) => w.id === id).length;
    if (!n) continue;
    meshes[id] = {};
    for (const [pose, parts] of Object.entries(lib.people[id])) {
      meshes[id][pose] = parts.map((p) => { const im = new THREE.InstancedMesh(p.geometry, p.material, n); im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; group.add(im); return im; });
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  function update(t, cheer = 0) {
    for (const id in meshes) for (const pose in meshes[id]) for (const im of meshes[id][pose]) im.count = 0;
    for (const w of who) {
      const sit = !w.stand, base = sit ? 'sit' : 'stand';
      // clapping, with a breather now and then; up and cheering at a knockout
      const beat = t * w.rate + w.phase, breather = ((t + w.rest) % 20) < 3;
      const pose = cheer > 0.5 ? base + 'Up' : breather ? base + 'A' : (beat % 1) < 0.5 ? base + 'A' : base + 'B';
      const set = meshes[w.id][pose] ? pose : base + 'A';
      const hip = lib.meta[w.id].poses[base + 'A'].hips;
      const hop = cheer > 0.5 ? Math.abs(Math.sin(t * 7 + w.phase * 6)) * 0.12 : Math.abs(Math.sin(beat * Math.PI)) * 0.01;
      // seated: hips just above the seat, feet on the step below; standing: feet on the step
      const y = sit ? w.y + 0.1 - hip[1] * w.scale : w.y;
      v.set(w.x - hip[0] * w.scale, y + hop, w.z - (sit ? hip[2] * w.scale : 0));
      q.setFromEuler(e.set(w.lean, w.turn, 0)); sc.setScalar(w.scale); m4.compose(v, q, sc);
      for (const im of meshes[w.id][set]) im.setMatrixAt(im.count++, m4);
    }
    for (const id in meshes) for (const pose in meshes[id]) for (const im of meshes[id][pose]) im.instanceMatrix.needsUpdate = true;
  }
  update(0);
  return { group, update };
}
