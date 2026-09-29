// The 3D street for Tumbang Preso, in three.js. It reads the simulation (sim.mjs) and its events and
// never changes them. Everything is built from simple shapes and canvas textures: no model files.
import * as THREE from './vendor/three.module.min.js';
import { LINE_Z, CAN, FIELD, predictThrow, isHome, slipOf, taya } from './sim.mjs';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const SKIN = ['#c98a5a', '#b87a4a', '#d9a06b', '#a86a3a', '#c48450'];
const HAIR = '#1b1320';
const SLIPPERS = ['#2f6fd6', '#ff9f43', '#ff8ae2', '#3fae5a', '#ffd23f'];

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
function label(text, color = '#fff8e1', bg = 'rgba(20,16,24,0.7)', scale = 0.9) {
  const tex = canvasTex(256, 64, (x, w, h) => {
    x.fillStyle = bg; x.beginPath(); x.roundRect(8, 8, w - 16, h - 16, 24); x.fill();
    x.fillStyle = color; x.font = '800 34px "Baloo 2", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(scale, scale / 4, 1); s.renderOrder = 10;
  return s;
}

export function createView(canvas, { low = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#f0b884', 28, 70);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 220);
  camera.position.set(0, 4, 14);

  // ---------- light: a low sun going down ----------
  const hemi = new THREE.HemisphereLight('#ffe2bf', '#6b5a4a', 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffc890', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // the sky: a gradient dome that the evening slides down
  const skyU = { top: { value: new THREE.Color('#6fa6e0') }, mid: { value: new THREE.Color('#ffc98a') }, low: { value: new THREE.Color('#ff9a6a') }, sunDir: { value: new THREE.Vector3(-0.8, 0.2, -0.4).normalize() }, glow: { value: new THREE.Color('#fff0c0') } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 glow; varying vec3 v; void main(){ float h = v.y; vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.6, h)) : mix(low, mid, smoothstep(-0.1, 0.08, h)); float s = max(dot(v, sunDir), 0.0); c += glow * (pow(s, 64.0) * 1.2 + pow(s, 6.0) * 0.25); gl_FragColor = vec4(c, 1.0); }',
  }));
  scene.add(sky);

  // ---------- the street ----------
  const W = 40, D = 56, TW = 1024, TH = 1434;
  const gx = (x) => ((x + W / 2) / W) * TW, gz = (z) => ((z + D / 2) / D) * TH;
  const groundTex = canvasTex(TW, TH, (x) => {
    x.fillStyle = '#6a6660'; x.fillRect(0, 0, TW, TH);
    for (let k = 0; k < 9000; k++) { const v = 90 + Math.random() * 60; x.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`; x.fillRect(Math.random() * TW, Math.random() * TH, 2, 2); }
    // sidewalks and gutters
    for (const [a, b] of [[-20, -7.4], [7.4, 20]]) { x.fillStyle = '#a8a092'; x.fillRect(gx(a), 0, gx(b) - gx(a), TH); x.strokeStyle = 'rgba(0,0,0,0.12)'; for (let z = -28; z < 28; z += 1) { x.beginPath(); x.moveTo(gx(a), gz(z)); x.lineTo(gx(b), gz(z)); x.stroke(); } }
    x.fillStyle = '#4a4640'; x.fillRect(gx(-7.6), 0, gx(-7.4) - gx(-7.6), TH); x.fillRect(gx(7.4), 0, gx(7.6) - gx(7.4), TH);
    // cracks and patches
    x.strokeStyle = 'rgba(30,28,26,0.5)'; x.lineWidth = 1.5;
    for (let k = 0; k < 26; k++) { let px = gx(-6 + Math.random() * 12), pz = Math.random() * TH; x.beginPath(); x.moveTo(px, pz); for (let s = 0; s < 6; s++) { px += (Math.random() - 0.5) * 30; pz += (Math.random() - 0.5) * 30; x.lineTo(px, pz); } x.stroke(); }
    x.fillStyle = 'rgba(40,38,36,0.5)'; x.beginPath(); x.arc(gx(4.5), gz(-5), 18, 0, TAU); x.fill(); // a manhole
    x.strokeStyle = 'rgba(20,20,20,0.5)'; x.lineWidth = 2; x.beginPath(); x.arc(gx(4.5), gz(-5), 14, 0, TAU); x.stroke();
    // chalk: the circle, the line, the words, and a piko on the sidewalk
    const chalk = (w, a = 0.92) => { x.strokeStyle = `rgba(250,248,240,${a})`; x.lineWidth = w; x.lineCap = 'round'; };
    chalk(5); x.beginPath(); x.arc(gx(0), gz(0), (CAN.circle / W) * TW, 0, TAU); x.stroke();
    chalk(6); x.beginPath(); x.moveTo(gx(-6.6), gz(LINE_Z)); for (let s = 0; s <= 30; s++) x.lineTo(gx(-6.6 + (13.2 * s) / 30), gz(LINE_Z) + (Math.random() - 0.5) * 3); x.stroke();
    x.fillStyle = 'rgba(250,248,240,0.85)'; x.font = '700 30px "Baloo 2", cursive'; x.textAlign = 'center';
    x.fillText('TUMBANG PRESO', gx(0), gz(LINE_Z + 3.2)); x.font = '700 18px "Baloo 2", cursive'; x.fillText('LINYA', gx(5.4), gz(LINE_Z + 0.9));
    chalk(3, 0.8);
    const pk = (px, pz, w, h) => x.strokeRect(gx(px), gz(pz), (w / W) * TW, (h / D) * TH);
    for (let k = 0; k < 4; k++) pk(-9.6, -6 + k * 1.1, 1, 1);
    pk(-10.1, -1.6, 1, 1); pk(-9.1, -1.6, 1, 1); pk(-9.6, -0.5, 1, 1);
    x.font = '700 16px "Baloo 2", cursive'; x.fillText('PIKO', gx(-9.1), gz(-7));
  });
  const ground = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }), { rx: -Math.PI / 2, cast: false, receive: true });
  scene.add(ground);
  // curbs
  for (const x of [-7.5, 7.5]) scene.add(mesh(new THREE.BoxGeometry(0.18, 0.14, D), mat('#b8b0a0'), { x, y: 0.07, receive: true }));

  // ---------- houses on both sides ----------
  const glowWindows = [];
  const WALLS = ['#f0d9a8', '#cfe3d0', '#f4c6b8', '#d8d4f0', '#f2e6c0', '#bfe0e8', '#f7d4a0', '#e0c8d8'];
  const ROOFS = ['#9aa0a6', '#b04a3a', '#3f7a5a', '#8a8f96', '#a85a3a'];
  function facade(color, seed, store = false) {
    const tex = canvasTex(256, 256, (x, w, h) => {
      x.fillStyle = color; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(0,0,0,0.05)'; for (let k = 0; k < 300; k++) x.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, h - 26, w, 26); // the lower wall, splashed with rain
      if (store) {
        x.fillStyle = '#3a2a1a'; x.fillRect(30, 90, 196, 110); // the store's open counter
        const cols = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#ff8ae2', '#ff9f43'];
        for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) { x.fillStyle = cols[(r * 5 + c) % 6]; x.fillRect(36 + c * 16, 96 + r * 22, 12, 18); } // sachets on strips
        x.fillStyle = '#6b4a2a'; x.fillRect(26, 196, 204, 12); // the counter
        x.strokeStyle = '#2a2a2a'; x.lineWidth = 3; for (let bx = 34; bx < 226; bx += 14) { x.beginPath(); x.moveTo(bx, 90); x.lineTo(bx, 196); x.stroke(); } // the grill
      } else {
        const n = 1 + (seed % 2);
        for (let k = 0; k < n; k++) {
          const wx = n === 1 ? 128 - 45 : 36 + k * 110, wy = 70;
          x.fillStyle = '#3a4a5a'; x.fillRect(wx, wy, 90, 70);
          x.fillStyle = 'rgba(255,255,255,0.35)'; for (let s = 0; s < 7; s++) x.fillRect(wx + 4, wy + 4 + s * 9.5, 82, 3); // jalousie slats
          x.strokeStyle = '#f4f1e6'; x.lineWidth = 4; x.strokeRect(wx, wy, 90, 70);
        }
        x.fillStyle = ['#7a4a2a', '#2f6fd6', '#3fae5a'][seed % 3]; x.fillRect(seed % 2 ? 150 : 20, 150, 60, 106); // the door
        x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(seed % 2 ? 200 : 70, 205, 4, 0, TAU); x.fill();
        if (seed % 3 === 1) { x.fillStyle = '#3fae5a'; for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(110 + k * 9, 215 - (k % 2) * 6, 10, 0, TAU); x.fill(); } x.fillStyle = '#b86a3a'; x.fillRect(100, 222, 56, 28); } // a potted plant
      }
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: '#ffcf7a', emissiveIntensity: 0, emissiveMap: tex });
    glowWindows.push(m);
    return m;
  }
  const corrugated = canvasTex(64, 64, (x, w, h) => { for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? '#ffffff' : '#c8c8c8'; x.fillRect(k * 8, 0, 8, h); } x.fillStyle = 'rgba(160,80,40,0.35)'; x.fillRect(10, 20, 20, 30); }, [3, 1]);
  let seed = 1;
  function house(side, z, width, height, store = false) {
    const depth = 6, x = side * (8.2 + depth / 2 + 0.6);
    const wall = mat(WALLS[seed % WALLS.length]);
    const front = facade(WALLS[seed % WALLS.length], seed, store);
    const mats = side < 0 ? [front, wall, wall, wall, wall, wall] : [wall, front, wall, wall, wall, wall];
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(depth, height, width), mats, { x, y: height / 2, z, receive: true }));
    const roofM = new THREE.MeshStandardMaterial({ map: corrugated, color: ROOFS[seed % ROOFS.length], roughness: 0.6, metalness: 0.35 });
    g.add(mesh(new THREE.BoxGeometry(depth + 1.2, 0.08, width + 0.4), roofM, { x: x - side * 0.3, y: height + 0.45, z, rz: side * 0.16 }));
    if (store) {
      const sign = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#e8384f'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.fillRect(8, 8, w - 16, h - 16); c.fillStyle = '#e8384f'; c.font = '900 58px "Baloo 2", system-ui'; c.textAlign = 'center'; c.fillText('SARI-SARI STORE', w / 2, 70); c.fillStyle = '#2f6fd6'; c.font = '800 30px "Baloo 2", system-ui'; c.fillText('ni Aling Nena', w / 2, 108); });
      g.add(mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.7 }), { x: x - side * (depth / 2 + 0.02), y: height - 0.6, z, ry: -side * Math.PI / 2, cast: false }));
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.45, 2.2), mat('#8a5a2b'), { x: side * 7.9, y: 0.22, z: z + 0.2 })); // the tambayan bench
    }
    scene.add(g);
    seed++;
  }
  for (const side of [-1, 1]) {
    let z = -26;
    while (z < 26) { const w = 4.5 + ((seed * 7) % 3); house(side, z + w / 2, w - 0.3, 3.8 + ((seed * 3) % 3) * 0.6, side === 1 && z < 2 && z + w > 2); z += w; }
  }
  // the far ends of the street
  for (const [z, ry] of [[-27, 0], [27, Math.PI]]) scene.add(mesh(new THREE.BoxGeometry(24, 5, 2), mat('#d8c8a8'), { z, y: 2.5, ry, receive: true }));

  // ---------- posts, wires and banderitas ----------
  const posts = [];
  for (const [x, z] of [[-7.8, -18], [7.8, -9], [-7.8, 1], [7.8, 10], [-7.8, 19]]) {
    scene.add(mesh(new THREE.CylinderGeometry(0.11, 0.14, 7.5, 10), mat('#8a8274'), { x, y: 3.75, z }));
    scene.add(mesh(new THREE.BoxGeometry(1.4, 0.12, 0.12), mat('#6b5a4a'), { x, y: 7, z, ry: Math.PI / 2 }));
    posts.push([x, z]);
  }
  scene.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12), mat('#7a8088', { metalness: 0.4 }), { x: 7.8, y: 6.1, z: 10.4 })); // a transformer
  const wireM = new THREE.LineBasicMaterial({ color: '#1b1b1b' });
  const sag = (a, b, drop, n = 16) => { const pts = []; for (let k = 0; k <= n; k++) { const f = k / n; pts.push(new THREE.Vector3(lerp(a.x, b.x, f), lerp(a.y, b.y, f) - Math.sin(f * Math.PI) * drop, lerp(a.z, b.z, f))); } return new THREE.BufferGeometry().setFromPoints(pts); };
  for (let k = 0; k < posts.length - 1; k++) for (const dy of [0, -0.25, 0.25]) scene.add(new THREE.Line(sag(new THREE.Vector3(posts[k][0], 6.95, posts[k][1] + dy), new THREE.Vector3(posts[k + 1][0], 6.95, posts[k + 1][1] + dy), 0.9), wireM));
  const flags = [];
  const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.16, 0, 0), new THREE.Vector3(0.16, 0, 0), new THREE.Vector3(0, -0.36, 0)]);
  flagGeo.computeVertexNormals();
  const FLAGC = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#ff8ae2', '#ff9f43', '#ffffff'];
  const bunting = new THREE.InstancedMesh(flagGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), 3 * 30);
  let fi = 0;
  for (const z of [-5, 3.5, 13]) {
    const a = new THREE.Vector3(-7.6, 5.2, z), b = new THREE.Vector3(7.6, 5.2, z + 0.6);
    scene.add(new THREE.Line(sag(a, b, 0.7), wireM));
    for (let k = 0; k < 30; k++) { const f = (k + 0.5) / 30; flags.push({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) - Math.sin(f * Math.PI) * 0.7, z: lerp(a.z, b.z, f), p: k * 0.7 + z }); bunting.setColorAt(fi++, new THREE.Color(FLAGC[k % FLAGC.length])); }
  }
  bunting.castShadow = true;
  scene.add(bunting);
  const dummy = new THREE.Object3D();

  // ---------- a mango tree, a basketball ring, a jeepney, an askal ----------
  scene.add(mesh(new THREE.CylinderGeometry(0.22, 0.32, 3.2, 9), mat('#6b4a2a'), { x: -8.6, y: 1.6, z: -3 }));
  for (const [dx, dy, dz, r] of [[0, 3.6, 0, 1.6], [0.9, 3.2, 0.6, 1.1], [-0.9, 3.3, -0.4, 1.2], [0.2, 4.4, -0.3, 1.1]]) scene.add(mesh(new THREE.IcosahedronGeometry(r, 1), mat('#3f7a35', { flatShading: true }), { x: -8.6 + dx, y: dy, z: -3 + dz }));
  scene.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), mat('#3a4a5a'), { x: 0, y: 1.6, z: -12.5 }));
  scene.add(mesh(new THREE.BoxGeometry(1.4, 0.9, 0.06), mat('#f4f1e6'), { x: 0, y: 3.2, z: -12.3 }));
  scene.add(mesh(new THREE.TorusGeometry(0.23, 0.025, 8, 20), mat('#ff6b3d'), { x: 0, y: 2.95, z: -12.0, rx: Math.PI / 2 }));
  // the jeepney, parked across the end of the street
  const jeep = new THREE.Group();
  const jtex = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#e8e8ea'; c.fillRect(0, 0, w, h); const cs = ['#e8384f', '#2f6fd6', '#ffd23f']; cs.forEach((col, k) => { c.fillStyle = col; c.fillRect(0, 70 + k * 12, w, 8); }); c.fillStyle = '#23242c'; for (let k = 0; k < 7; k++) c.fillRect(30 + k * 66, 14, 50, 44); c.fillStyle = '#e8384f'; c.font = '900 22px "Baloo 2", system-ui'; c.fillText('ANG PAG-IBIG NI INAY', 150, 122); });
  jeep.add(mesh(new THREE.BoxGeometry(4.6, 1.5, 1.9), new THREE.MeshStandardMaterial({ map: jtex, roughness: 0.5, metalness: 0.3 }), { y: 1.25 }));
  jeep.add(mesh(new THREE.BoxGeometry(1.3, 0.9, 1.8), mat('#c9ccd4', { metalness: 0.6, roughness: 0.3 }), { x: 2.9, y: 0.95 }));
  jeep.add(mesh(new THREE.BoxGeometry(4.8, 0.12, 2.1), mat('#e8384f'), { y: 2.05 }));
  const signTex = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); c.fillStyle = '#e8384f'; c.font = '900 36px "Baloo 2", system-ui'; c.textAlign = 'center'; c.fillText('CUBAO', w / 2, 46); });
  jeep.add(mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshStandardMaterial({ map: signTex }), { x: 2.2, y: 2.3, rz: 0, ry: Math.PI / 2 }));
  for (const [x, z] of [[1.7, 0.95], [1.7, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) jeep.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16), mat('#1b1b1b'), { x, y: 0.42, z, rx: Math.PI / 2 }));
  jeep.add(mesh(new THREE.ConeGeometry(0.12, 0.35, 6), mat('#e8e8e8', { metalness: 0.8, roughness: 0.2 }), { x: 3.5, y: 1.55 })); // a chrome horse, more or less
  jeep.position.set(-2.5, 0, -16); jeep.rotation.y = 0.12;
  scene.add(jeep);
  const dog = new THREE.Group();
  dog.add(mesh(new THREE.CapsuleGeometry(0.16, 0.45, 4, 8), mat('#b8864a'), { y: 0.18, rz: Math.PI / 2 }));
  dog.add(mesh(new THREE.SphereGeometry(0.14, 12, 10), mat('#b8864a'), { x: 0.38, y: 0.2 }));
  dog.add(mesh(new THREE.ConeGeometry(0.05, 0.1, 6), mat('#8a5a2b'), { x: 0.38, y: 0.34, z: 0.07 }));
  dog.add(mesh(new THREE.ConeGeometry(0.05, 0.1, 6), mat('#8a5a2b'), { x: 0.38, y: 0.34, z: -0.07 }));
  dog.position.set(8.0, 0, 5.5); dog.rotation.y = -0.5;
  scene.add(dog);

  // street lamps that come on at dusk
  const lamps = [];
  for (const [x, z] of [[7.8, -9], [-7.8, 1], [7.8, 10]]) {
    const bulb = mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff4c2', emissive: '#ffcf7a', emissiveIntensity: 0 }), { x: x - Math.sign(x) * 0.9, y: 6.4, z, cast: false });
    scene.add(bulb);
    scene.add(mesh(new THREE.BoxGeometry(0.9, 0.06, 0.06), mat('#6b6b6b'), { x: x - Math.sign(x) * 0.45, y: 6.55, z }));
    const pl = new THREE.PointLight('#ffcf7a', 0, 16, 1.6);
    pl.position.set(x - Math.sign(x) * 0.9, 6.2, z);
    scene.add(pl);
    lamps.push({ bulb, pl });
  }

  // ---------- the kids ----------
  function kidModel(k) {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const skin = mat(SKIN[k.i % SKIN.length]), shirt = mat(k.shirt), shorts = mat(k.i === 2 ? k.shirt : '#2a3a5a'), dark = mat(HAIR);
    const limb = (len, r, m, y) => { const g = new THREE.Group(); g.position.y = y; const cyl = mesh(new THREE.CapsuleGeometry(r, len, 3, 8), m, { y: -len / 2 - r }); g.add(cyl); return { g, cyl }; };
    const legL = limb(0.42, 0.065, skin, 0.62), legR = limb(0.42, 0.065, skin, 0.62);
    legL.g.position.x = -0.09; legR.g.position.x = 0.09;
    for (const L of [legL, legR]) {
      L.g.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 10), shorts, { y: -0.08 }));
      L.g.add(mesh(new THREE.BoxGeometry(0.11, 0.05, 0.2), mat(SLIPPERS[k.i]), { y: -0.6, z: 0.03 }));
      body.add(L.g);
    }
    const torso = k.i === 2
      ? mesh(new THREE.CylinderGeometry(0.15, 0.27, 0.62, 12), shirt, { y: 0.86 }) // Nene's dress
      : mesh(new THREE.CapsuleGeometry(0.16, 0.26, 4, 10), shirt, { y: 0.9 });
    body.add(torso);
    const armL = limb(0.34, 0.05, skin, 1.08), armR = limb(0.34, 0.05, skin, 1.08);
    armL.g.position.x = -0.22; armR.g.position.x = 0.22;
    for (const A of [armL, armR]) { A.g.add(mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.14, 8), shirt, { y: -0.06 })); body.add(A.g); }
    const head = new THREE.Group(); head.position.y = 1.36; body.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.17, 18, 14), skin));
    head.add(mesh(new THREE.SphereGeometry(0.18, 18, 10, 0, TAU, 0, Math.PI * 0.55), dark, { y: 0.02, rx: -0.25 }));
    for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), dark, { x: s * 0.06, y: 0.01, z: 0.155, cast: false }));
    if (k.i === 2) head.add(mesh(new THREE.BoxGeometry(0.3, 0.32, 0.08), dark, { y: -0.12, z: -0.14 })); // long hair
    if (k.i === 3) for (let c = 0; c < 7; c++) head.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), dark, { x: Math.cos(c) * 0.12, y: 0.12 + (c % 2) * 0.04, z: Math.sin(c) * 0.12 })); // Kulot's curls
    if (k.you) { head.add(mesh(new THREE.SphereGeometry(0.185, 16, 8, 0, TAU, 0, Math.PI * 0.42), mat('#ffd23f'), { y: 0.04 })); head.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.16), mat('#ffd23f'), { y: 0.06, z: 0.2 })); }
    if (k.i === 4) { head.add(mesh(new THREE.SphereGeometry(0.185, 16, 8, 0, TAU, 0, Math.PI * 0.42), mat('#2f2f3a'), { y: 0.04 })); head.add(mesh(new THREE.BoxGeometry(0.22, 0.03, 0.16), mat('#2f2f3a'), { y: 0.06, z: -0.2 })); } // Bong's cap, backwards
    const bandana = mesh(new THREE.TorusGeometry(0.175, 0.03, 8, 20), mat('#e8384f'), { y: 0.05, rx: Math.PI / 2 });
    head.add(bandana);
    const slipper = slipperModel(k.i);
    slipper.scale.setScalar(0.9);
    armR.g.add(slipper); slipper.position.set(0, -0.48, 0.05); slipper.rotation.set(Math.PI / 2, 0, 0);
    const tag = label(k.you ? 'IKAW' : k.name, k.you ? '#ffd23f' : '#fff8e1');
    tag.position.y = 1.85; root.add(tag);
    const tayaTag = label('TAYA', '#fff', '#e8384f', 0.8);
    tayaTag.position.y = 2.1; root.add(tayaTag);
    const ring = mesh(new THREE.RingGeometry(0.38, 0.48, 28), new THREE.MeshBasicMaterial({ color: k.you ? '#ffd23f' : '#e8384f', transparent: true, opacity: 0.7, depthWrite: false }), { rx: -Math.PI / 2, y: 0.02, cast: false });
    root.add(ring);
    scene.add(root);
    return { root, body, legL: legL.g, legR: legR.g, armL: armL.g, armR: armR.g, head, bandana, slipper, tag, tayaTag, ring, phase: Math.random() * TAU };
  }
  function slipperModel(i) {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.13); shape.bezierCurveTo(0.07, -0.13, 0.065, 0.02, 0.055, 0.07); shape.bezierCurveTo(0.05, 0.14, -0.05, 0.14, -0.055, 0.07); shape.bezierCurveTo(-0.065, 0.02, -0.07, -0.13, 0, -0.13);
    const sole = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: false }), mat(SLIPPERS[i], { roughness: 0.7 }));
    sole.rotation.x = -Math.PI / 2; sole.castShadow = true;
    g.add(sole);
    const strap = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.05, 0.024, 0.0), new THREE.Vector3(0, 0.05, -0.07), new THREE.Vector3(0.05, 0.024, 0.0)]), 12, 0.009, 6), mat('#f4f1e6'));
    strap.castShadow = true;
    g.add(strap);
    return g;
  }
  const kids = new Map();
  const slippers = new Map();

  // ---------- the lata ----------
  const labelTex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#e8384f'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd23f'; c.fillRect(0, 34, w, 60);
    c.fillStyle = '#e8384f'; c.font = '900 34px "Baloo 2", system-ui'; c.textAlign = 'center'; c.fillText('SARDINAS', w / 2, 76);
    c.fillStyle = '#fff'; c.font = '700 16px system-ui'; c.fillText('sa kamatis', w / 2, 116);
  });
  const tin = new THREE.MeshStandardMaterial({ color: '#c9ccd4', metalness: 0.8, roughness: 0.3 });
  const canMesh = mesh(new THREE.CylinderGeometry(CAN.r, CAN.r, CAN.h, 24), [new THREE.MeshStandardMaterial({ map: labelTex, metalness: 0.2, roughness: 0.5 }), tin, tin]);
  const canGroup = new THREE.Group(); canGroup.add(canMesh); scene.add(canGroup);

  // the throw preview: dots along the arc and a ring where it comes down
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }), 60);
  dots.count = 0; dots.frustumCulled = false; scene.add(dots);
  const landRing = mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }), { rx: -Math.PI / 2, y: 0.03, cast: false });
  landRing.visible = false; scene.add(landRing);

  // bits of dust, shine and confetti
  const MAXP = low ? 160 : 360;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false; scene.add(points);
  const parts = [];
  const emit = (x, y, z, color, n, speed = 2, up = 2, life = 0.8, g = 6) => { for (let k = 0; k < n && parts.length < MAXP; k++) { const a = Math.random() * TAU; parts.push({ x, y, z, vx: Math.cos(a) * speed * Math.random(), vy: up * (0.5 + Math.random()), vz: Math.sin(a) * speed * Math.random(), life, max: life, c: new THREE.Color(color), g }); } };

  // ---------- the camera ----------
  const cam = { yaw: 0, auto: true, pos: new THREE.Vector3(0, 4, 14), look: new THREE.Vector3(0, 1, 0), shake: 0 };
  const tmp = new THREE.Vector3();

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(0.3, r.width / Math.max(1, r.height));
    camera.fov = camera.aspect < 0.8 ? 68 : 55;
    camera.updateProjectionMatrix();
  }

  // The flat directions the camera is looking along, for turning stick input into world moves.
  function basis() {
    const f = new THREE.Vector3(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x };
  }

  function event(e, g) {
    const k = e.kid !== undefined ? g.kids[e.kid] : null;
    switch (e.type) {
      case 'land': emit(e.x, 0.05, e.z, '#cfc8b8', 8, 1.2, 0.8, 0.5); break;
      case 'knock': emit(0, 0.2, 0, '#fff4c2', 18, 3, 3, 0.6); for (const c of FLAGC) emit(0, 0.5, 0, c, 6, 3.5, 4.5, 1.4, 5); cam.shake = 0.18; break;
      case 'clang': emit(g.can.x, 0.1, g.can.z, '#ffffff', 6, 1.5, 1, 0.3); break;
      case 'tag': { const t = g.kids[e.taya]; emit(t.x, 1, t.z, '#ff5c5c', 16, 2.5, 2.5, 0.7); cam.shake = 0.12; break; }
      case 'canSet': emit(0, 0.1, 0, '#fff4c2', 10, 1, 1.2, 0.5); break;
      case 'dive': if (k) emit(k.x, 0.05, k.z, '#cfc8b8', 10, 1.5, 0.6, 0.5); break;
      case 'pickup': if (k) emit(k.x, 0.3, k.z, '#7cf29a', 8, 1.2, 1.5, 0.5); break;
      default: break;
    }
  }

  // ---------- each frame ----------
  function frame(g, dt, o = {}) {
    const t = performance.now() / 1000;
    const day = clamp(g.t / g.limit, 0, 1);
    // the evening: the sun sinks, the sky warms, then darkens; lamps and windows come on
    const sunEl = lerp(0.2, 0.02, day), sunAz = -0.9;
    const sd = new THREE.Vector3(Math.cos(sunEl) * Math.sin(sunAz), Math.sin(sunEl), Math.cos(sunEl) * Math.cos(sunAz));
    sun.position.copy(sd).multiplyScalar(40); sun.target.position.set(0, 0, 0);
    sun.intensity = lerp(3.2, 1.0, day); sun.color.set('#ffc890').lerp(new THREE.Color('#ff9a70'), day);
    hemi.intensity = lerp(1.6, 0.55, day);
    skyU.top.value.set('#6fa6e0').lerp(new THREE.Color('#27305e'), day); skyU.mid.value.set('#ffc98a').lerp(new THREE.Color('#d98a7a'), day); skyU.low.value.set('#ff9a6a').lerp(new THREE.Color('#6a3a5a'), day);
    skyU.sunDir.value.copy(sd);
    scene.fog.color.set('#f0b884').lerp(new THREE.Color('#4a3a5a'), day);
    const dusk = clamp((day - 0.62) / 0.3, 0, 1);
    for (const l of lamps) { l.pl.intensity = dusk * 30; l.bulb.material.emissiveIntensity = dusk * 2.5; }
    for (const m of glowWindows) m.emissiveIntensity = dusk * 0.18;
    renderer.toneMappingExposure = lerp(1.1, 1.25, day);
    // banderitas sway
    flags.forEach((f, k) => { dummy.position.set(f.x, f.y, f.z); dummy.rotation.set(Math.sin(t * 2 + f.p) * 0.25, 0, 0); dummy.updateMatrix(); bunting.setMatrixAt(k, dummy.matrix); });
    bunting.instanceMatrix.needsUpdate = true;
    dog.children[0].scale.y = 1 + Math.sin(t * 2) * 0.03;

    // the kids
    const ta = taya(g);
    for (const k of g.kids) {
      let m = kids.get(k.i);
      if (!m) { m = kidModel(k); kids.set(k.i, m); }
      m.root.position.set(k.x, 0, k.z);
      let yaw = k.yaw;
      if (o.aim && k.you) yaw = o.aim.yaw;
      m.root.rotation.y = lerpAngle(m.root.rotation.y, yaw, Math.min(1, dt * 14));
      const run = clamp(k.speed / 5, 0, 1.2);
      m.phase += dt * (4 + k.speed * 2.2);
      const swing = Math.sin(m.phase) * 0.85 * run;
      m.legL.rotation.x = swing; m.legR.rotation.x = -swing;
      m.armL.rotation.x = -swing * 0.8; m.armR.rotation.x = swing * 0.8;
      m.body.position.y = Math.abs(Math.sin(m.phase)) * 0.05 * run + (run < 0.05 ? Math.sin(t * 2 + k.i) * 0.006 : 0);
      m.body.rotation.x = run * 0.12;
      const tayaNow = k.role === 'taya';
      if (tayaNow && g.can.state === 'carried' && ta === k) { m.armL.rotation.x = -1.3; m.armR.rotation.x = -1.3; }
      if (k.anim.throwT > 0) { const f = 1 - k.anim.throwT / 0.35; m.armR.rotation.x = lerp(2.6, -1.1, f); m.body.rotation.y = lerp(-0.4, 0.3, f); }
      else m.body.rotation.y = 0;
      if (o.aim && k.you) { m.armR.rotation.x = 2.4 + Math.sin(t * 10) * 0.05; m.body.rotation.y = -0.35; m.legL.rotation.x = 0.25; m.legR.rotation.x = -0.2; }
      if (k.dive > 0) { m.body.rotation.x = 1.1; m.body.position.y = -0.35; m.armL.rotation.x = m.armR.rotation.x = -2.6; }
      else if (k.recover > 0) { m.body.rotation.x = 0.5; }
      if (k.anim.tagT > 0) { m.body.position.y += Math.sin((1 - k.anim.tagT) * Math.PI) * 0.3; m.root.rotation.y += (1 - k.anim.tagT) * TAU * 0.15; }
      m.bandana.visible = tayaNow;
      m.tayaTag.visible = tayaNow;
      m.tayaTag.position.y = 2.1 + Math.sin(t * 4) * 0.05;
      m.tag.visible = !tayaNow && !(k.you && o.mode === 'play'); // your ring marks you in play
      m.ring.visible = k.you || tayaNow;
      m.ring.material.color.set(tayaNow ? '#e8384f' : '#ffd23f');
      m.ring.scale.setScalar(tayaNow && k.count > 0 ? 1 + Math.sin(t * 12) * 0.15 : 1);
      m.slipper.visible = k.role === 'thrower' && k.hasSlip;
    }
    // the slippers out of hand
    for (const s of g.slips) {
      let m = slippers.get(s.owner);
      if (!m) { m = slipperModel(s.owner); scene.add(m); slippers.set(s.owner, m); }
      m.visible = s.state === 'air' || s.state === 'ground';
      if (!m.visible) continue;
      m.position.set(s.x, s.y, s.z);
      if (s.state === 'air') { m.rotation.set(s.spin, Math.atan2(s.vx, s.vz), 0); }
      else m.rotation.set(0, (s.owner * 1.7) % TAU, 0);
    }
    // the can
    const c = g.can;
    canGroup.position.set(c.x, c.y + (c.tilt > 0.5 ? CAN.r : CAN.h / 2), c.z);
    const dir = Math.atan2(c.vx || 0.001, c.vz || 0.001);
    if (c.state === 'up' || c.state === 'carried') canGroup.rotation.set(0, 0, 0);
    else { canGroup.rotation.set(0, dir, 0); canMesh.rotation.set(c.tilt, 0, 0); canMesh.rotateY(c.roll); }
    if (c.state === 'up' || c.state === 'carried') canMesh.rotation.set(0, 0, 0);
    // the throw preview
    if (o.aim && o.preview > 0) {
      const me = g.kids.find((k) => k.you);
      const p = predictThrow(me.x, me.z, o.aim.yaw, o.aim.power, c);
      const n = Math.max(2, Math.floor(p.path.length * o.preview));
      dots.count = Math.min(60, n);
      for (let k = 0; k < dots.count; k++) { const [x, y, z] = p.path[k]; dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1 - k / (n + 4)); dummy.updateMatrix(); dots.setMatrixAt(k, dummy.matrix); }
      dots.instanceMatrix.needsUpdate = true;
      dots.material.color.set(p.hit ? '#7cf29a' : '#ffffff');
      landRing.visible = o.preview >= 1;
      landRing.position.set(p.land[0], 0.03, p.land[1]);
      landRing.material.color.set(p.hit ? '#7cf29a' : '#ffffff');
    } else { dots.count = 0; landRing.visible = false; }
    // particles
    let n = 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y = Math.max(0.02, p.y + p.vy * dt); p.z += p.vz * dt;
    }
    for (const p of parts) { pPos[n * 3] = p.x; pPos[n * 3 + 1] = p.y; pPos[n * 3 + 2] = p.z; const a = clamp(p.life / p.max * 1.5, 0, 1); pCol[n * 3] = p.c.r * a; pCol[n * 3 + 1] = p.c.g * a; pCol[n * 3 + 2] = p.c.b * a; n++; }
    pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;

    // the camera: behind you, turning toward the can unless you've turned it yourself
    const me = g.kids.find((k) => k.you);
    if (o.mode === 'play' && me) {
      if (o.camYaw !== undefined && o.camYaw !== null) cam.yaw = o.camYaw;
      const aiming = !!o.aim;
      const back = aiming ? 2.6 : 5.2, up = aiming ? 1.7 : 2.8, side = aiming ? 0.55 : 0;
      const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
      tmp.set(me.x - fx * back + fz * side, up, me.z - fz * back - fx * side);
      cam.pos.lerp(tmp, Math.min(1, dt * (aiming ? 10 : 5)));
      const lookAhead = aiming ? 4 : 2.2;
      tmp.set(me.x + fx * lookAhead, aiming ? 0.8 : 1.1, me.z + fz * lookAhead);
      cam.look.lerp(tmp, Math.min(1, dt * 8));
    } else {
      const a = t * 0.12 + (o.mode === 'over' ? 1 : 0);
      tmp.set(Math.sin(a) * 11, 4.2, 4 + Math.cos(a) * 9);
      cam.pos.lerp(tmp, Math.min(1, dt * 2));
      cam.look.lerp(new THREE.Vector3(0, 0.8, 1.5), Math.min(1, dt * 2));
    }
    camera.position.copy(cam.pos);
    if (cam.shake > 0 && !o.reduced) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; }
    cam.shake = Math.max(0, cam.shake - dt * 0.8);
    camera.lookAt(cam.look);
    renderer.render(scene, camera);
  }

  // The yaw the camera should settle to: looking from you toward the can (or, as taya, toward home).
  function autoYaw(g) {
    const me = g.kids.find((k) => k.you);
    if (!me) return 0;
    if (me.role === 'taya') {
      const out = g.kids.filter((k) => k.role === 'thrower' && !isHome(k));
      const target = out.length ? out.reduce((a, b) => (Math.hypot(a.x - me.x, a.z - me.z) < Math.hypot(b.x - me.x, b.z - me.z) ? a : b)) : { x: 0, z: LINE_Z };
      if (g.can.state !== 'up' && g.can.state !== 'carried') return Math.atan2(g.can.x - me.x, g.can.z - me.z);
      if (g.can.state === 'carried') return Math.atan2(-me.x, -me.z);
      return Math.atan2(target.x - me.x, target.z - me.z);
    }
    if (!me.hasSlip) { const s = slipOf(g, me); if (s.state === 'ground') return Math.atan2(s.x - me.x, s.z - me.z); }
    if (!isHome(me) && me.hasSlip) return 0; // holding your slipper out in the field: look toward home
    return Math.atan2(g.can.x - me.x, g.can.z - me.z);
  }

  resize();
  void FIELD;
  return { frame, resize, event, basis, autoYaw, cam, renderer };
}

function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * k;
}
