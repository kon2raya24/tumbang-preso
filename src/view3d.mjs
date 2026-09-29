// The 3D eskinita for Tumbang Preso, in three.js. It reads the simulation (sim.mjs) and its events and
// never changes them. Everything is built from simple shapes and small canvas textures drawn pixel by
// pixel and magnified without smoothing, for a chunky, sunny look: no model or image files.
//
// Two cameras: first person (your own hands, holding your tsinelas) and a chase camera behind you.
import * as THREE from './vendor/three.module.min.js';
import { LINE_Z, CAN, predictThrow, isHome, slipOf, taya } from './sim.mjs';

const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const SKIN = ['#c98a5a', '#b87a4a', '#d9a06b', '#a86a3a', '#c48450'];
const HAIR = '#1b1320';
const SLIPPERS = ['#2f6fd6', '#ff9f43', '#ff8ae2', '#3fae5a', '#ffd23f'];
const SHORTS = ['#2a3a5a', '#3a3f4a', '#ff8ae2', '#6a5a3a', '#2a2a3a'];
const PX = 16; // wall texture pixels per metre: chunky on purpose
const FRONT = 7.8; // the house fronts, either side of the alley
const EYE = 1.3;

// A seeded random, so the street is built the same way every time.
let rs = 20260929;
const rnd = () => { rs = (rs * 16807) % 2147483647; return rs / 2147483647; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = (v) => clamp(Math.round(v * k), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
const R = (x, c, X, Y, W = 1, H = 1) => { x.fillStyle = c; x.fillRect(Math.round(X), Math.round(Y), Math.round(W), Math.round(H)); };

function canvasTex(w, h, draw, { repeat = null, pixel = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (pixel) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; }
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const MATS = new Map();
const mat = (color, o = {}) => { const key = color + JSON.stringify(o); if (!MATS.has(key)) MATS.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...o })); return MATS.get(key); };
const flat = (color, o = {}) => mat(color, { flatShading: true, ...o });
function mesh(geo, material, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, cast = true, receive = false } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
const box = (w, h, d, m, o) => mesh(new THREE.BoxGeometry(w, h, d), m, o);

// Merge every static mesh that shares a material into one, so the street costs a few dozen draws.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const key = `${o.material.uuid}:${o.castShadow}:${o.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const parts = list.map((m) => (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld));
    const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let at = 0;
    for (const g of parts) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, at * 2);
      at += c; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const merged = new THREE.Mesh(geo, list[0].material);
    merged.castShadow = list[0].castShadow; merged.receiveShadow = list[0].receiveShadow;
    for (const m of list) m.parent.remove(m);
    root.add(merged);
  }
}
function label(text, color = '#fff8e1', bg = 'rgba(20,16,24,0.7)', scale = 0.9) {
  const tex = canvasTex(256, 64, (x, w, h) => {
    x.fillStyle = bg; x.beginPath(); x.roundRect(8, 8, w - 16, h - 16, 24); x.fill();
    x.fillStyle = color; x.font = '800 34px "Baloo 2", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + 2);
  }, { pixel: false });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(scale, scale / 4, 1); s.renderOrder = 10;
  return s;
}
// A small painted sign, lettered at low resolution so it matches the walls.
function signTex(lines, bg, fg, w = 120, h = 36) {
  return canvasTex(w, h, (x) => {
    R(x, bg, 0, 0, w, h); R(x, shade(bg, 0.7), 0, h - 2, w, 2);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach(([text, size, weight = 800], k) => { x.font = `${weight} ${size}px "Baloo 2", system-ui, sans-serif`; x.fillText(text, w / 2, h * (lines.length === 1 ? 0.54 : 0.34 + k * 0.4), w - 6); });
  });
}

// ---------- the pixel painting of walls, windows and gates ----------
function drawWall(x, w, h, kind, color) {
  if (kind === 'block' || kind === 'bare') {
    // hollow blocks, 40 by 20 cm, with the mortar showing between
    const c = kind === 'bare' ? '#aaa69c' : color;
    R(x, shade(c, 0.84), 0, 0, w, h);
    for (let r = 0; r * 3 < h + 3; r++) for (let k = -1; k * 6 < w + 6; k++) R(x, shade(c, 0.95 + rnd() * 0.1), k * 6 + (r % 2) * 3, h - (r + 1) * 3 + 1, 5, 2);
  } else if (kind === 'brick') {
    R(x, shade(color, 1.18), 0, 0, w, h);
    for (let r = 0; r * 2 < h + 2; r++) for (let k = -1; k * 4 < w + 4; k++) R(x, shade(color, 0.88 + rnd() * 0.2), k * 4 + (r % 2) * 2, h - (r + 1) * 2 + 1, 3, 1);
  } else if (kind === 'wood') {
    for (let y = 0; y < h; y += 3) { R(x, shade(color, 0.92 + rnd() * 0.14), 0, y, w, 3); R(x, shade(color, 0.7), 0, y + 2, w, 1); }
    for (let k = 0; k < w; k += 8) for (let y = 1; y < h; y += 6) R(x, shade(color, 0.55), k + 3, y, 1, 1);
  } else {
    R(x, color, 0, 0, w, h);
    for (let k = 0; k < (w * h) / 6; k++) R(x, shade(color, 0.92 + rnd() * 0.14), rnd() * w, rnd() * h);
  }
}
function stains(x, w, h) {
  // rain splashed up from the ground, and streaks down from the top
  for (let k = 0; k < w; k++) R(x, 'rgba(60,50,40,0.16)', k, h - 2 - Math.floor(rnd() * 3), 1, 4);
  for (let k = 0; k < w / 10; k++) R(x, 'rgba(60,50,40,0.08)', rnd() * w, 0, 1 + Math.floor(rnd() * 2), 4 + rnd() * h * 0.5);
}
function drawWindow(x, X, Y, W, H, frame, grille, curtain) {
  R(x, frame, X - 1, Y - 1, W + 2, H + 2);
  R(x, '#34404c', X, Y, W, H);
  if (curtain) { R(x, curtain, X, Y, Math.floor(W / 2) - 1, H); R(x, shade(curtain, 0.8), X + 2, Y, 1, H); }
  for (let s = 1; s < H; s += 2) R(x, 'rgba(200,222,240,0.5)', X, Y + s, W, 1); // jalousie slats catching the sky
  for (let gx = X + 1; gx < X + W; gx += 3) R(x, grille, gx, Y, 1, H); // iron grille
  const cx = X + Math.floor(W / 2), cy = Y + Math.floor(H / 2);
  R(x, grille, X, cy, W, 1);
  for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]]) R(x, grille, cx + dx, cy + dy);
  R(x, shade(frame.startsWith('#') ? frame : '#dddddd', 0.78), X - 2, Y + H + 1, W + 4, 1); // the sill
}
function drawGate(x, X, Y, W, H, c) {
  R(x, shade(c, 0.55), X - 1, Y - 1, W + 2, H + 1);
  R(x, c, X, Y, W, H);
  for (let gx = X + 1; gx < X + W - 1; gx += 2) R(x, shade(c, 0.78), gx, Y + 3, 1, H - 4);
  R(x, shade(c, 1.25), X, Y + 2, W, 1); R(x, shade(c, 1.25), X, Y + Math.floor(H * 0.6), W, 1);
  R(x, '#2a2a2a', X + Math.floor(W / 2), Y, 1, H);
  R(x, '#e8e0c0', X + Math.floor(W / 2) + 1, Y + Math.floor(H * 0.55), 1, 1);
}
function drawDoor(x, X, Y, W, H, c) {
  R(x, '#f2eee4', X - 1, Y - 1, W + 2, H + 1);
  R(x, c, X, Y, W, H);
  R(x, shade(c, 0.8), X + 2, Y + 2, W - 4, Math.floor(H / 2) - 3); R(x, shade(c, 0.8), X + 2, Y + Math.floor(H / 2) + 1, W - 4, Math.floor(H / 2) - 3);
  R(x, '#ffd23f', X + W - 3, Y + Math.floor(H * 0.55), 1, 1);
}
function drawStore(x, X, Y, W, H) {
  R(x, '#6a4a2a', X - 1, Y - 1, W + 2, H + 3);
  R(x, '#2a2018', X, Y, W, H);
  const COLS = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#ff8ae2', '#ff9f43', '#f4f1e6'];
  for (let r = 0; r < Math.floor((H - 3) / 4); r++) {
    R(x, '#8a6a4a', X, Y + 4 + r * 4, W, 1); // a shelf
    for (let k = X + 1; k < X + W - 1; k += 2) if (rnd() < 0.85) R(x, pick(COLS), k, Y + 1 + r * 4, 1 + (rnd() < 0.3 ? 1 : 0), 3);
  }
  for (let k = 0; k < W; k += 3) R(x, pick(COLS), X + k, Y, 2, 2); // sachets hanging in strips
  for (let gx = X; gx < X + W; gx += 2) { if (gx > X + W / 2 - 4 && gx < X + W / 2 + 3) continue; R(x, '#1a1a1a', gx, Y, 1, H); } // the grille, with the little window to pay through
  R(x, '#1a1a1a', X, Y + Math.floor(H * 0.35), W, 1);
  R(x, '#8a5a30', X - 1, Y + H, W + 2, 2); // the counter
}

// One storey of a house front, painted to size.
function storeyTex(wm, hm, s) {
  const w = Math.round(wm * PX), h = Math.round(hm * PX);
  return canvasTex(w, h, (x) => {
    drawWall(x, w, h, s.kind, s.color);
    R(x, shade(s.trim, 1), 0, 0, w, 1);
    const win = (cx, wy) => drawWindow(x, cx - 9, h - wy, 18, 15, s.trim, s.grille, rnd() < 0.5 ? pick(['#e8384f', '#ffd23f', '#3fae5a', '#ff8ae2', '#6fa6e0']) : null);
    if (s.floor === 0) {
      if (s.store) { drawStore(x, Math.round(w * 0.18), h - 34, Math.round(w * 0.56), 22); drawDoor(x, w - 22, h - 34, 15, 34, '#7a4a2a'); }
      else if (s.door === 'gate') { const gw = Math.min(40, Math.round(w * 0.5)); drawGate(x, s.flip ? w - gw - 4 : 4, h - 36, gw, 36, s.gate); win(s.flip ? 20 : w - 18, 34); }
      else { drawDoor(x, s.flip ? w - 22 : 7, h - 34, 15, 34, s.gate); win(s.flip ? 22 : w - 20, 34); }
    } else {
      const n = w > 70 ? 2 : 1;
      for (let r = 0; r * 44 + 30 < h; r++) for (let k = 0; k < n; k++) win(n === 1 ? w / 2 : w * (0.28 + k * 0.44), 30 + r * 44);
    }
    if (s.poster) { const px0 = Math.round(rnd() * (w - 12)); R(x, '#f4f1e6', px0, h - 22, 9, 12); R(x, pick(['#e8384f', '#2f6fd6']), px0 + 1, h - 21, 7, 4); R(x, '#555', px0 + 2, h - 15, 5, 1); R(x, '#555', px0 + 2, h - 13, 4, 1); }
    stains(x, w, h);
  });
}

export function createView(canvas, { low = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.25 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#dce9f2', 30, 95);
  const world = new THREE.Group(); scene.add(world);
  const add = (...o) => world.add(...o);
  const wires = []; // every wire in the street, drawn as one set of line segments
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 260);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  // ---------- light: a bright afternoon, turning golden toward six ----------
  const hemi = new THREE.HemisphereLight('#e4f1ff', '#bfae94', 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  sun.target.position.set(0, 0, -6);

  const skyU = { top: { value: new THREE.Color('#5ea8ec') }, mid: { value: new THREE.Color('#a9d4f5') }, low: { value: new THREE.Color('#e8f1f4') }, sunDir: { value: new THREE.Vector3(-0.4, 0.8, -0.45).normalize() }, glow: { value: new THREE.Color('#fff6dc') } };
  add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; uniform vec3 sunDir; uniform vec3 glow; varying vec3 v; void main(){ float h = v.y; vec3 c = h > 0.1 ? mix(mid, top, smoothstep(0.1, 0.7, h)) : mix(low, mid, smoothstep(-0.05, 0.1, h)); float s = max(dot(v, sunDir), 0.0); c += glow * (pow(s, 90.0) * 1.4 + pow(s, 8.0) * 0.18); gl_FragColor = vec4(c, 1.0); }',
  })));
  // puffy clouds, far off
  const cloudM = flat('#ffffff', { emissive: '#eef4fa', emissiveIntensity: 0.55, fog: false, roughness: 1 });
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4, r = 110 + rnd() * 40, cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = 26 + rnd() * 22;
    for (let p = 0; p < 4 + Math.floor(rnd() * 3); p++) { const s = 5 + rnd() * 6; const m = mesh(new THREE.IcosahedronGeometry(s, 1), cloudM, { x: cx + (p - 2) * 6 + rnd() * 3, y: cy + rnd() * 3, z: cz + rnd() * 4, cast: false }); m.scale.y = 0.6; add(m); }
  }

  // ---------- the ground: a concrete eskinita, a cross street at the far end ----------
  const Z0 = -25.5, Z1 = 24, GW = FRONT * 2;
  const G = 12; // pixels per metre
  const groundTex = canvasTex(Math.round(GW * G), Math.round((Z1 - Z0) * G), (x, w, h) => {
    const gx = (m) => (m + FRONT) * G, gz = (m) => (m - Z0) * G;
    R(x, '#bdb6a8', 0, 0, w, h);
    for (let k = 0; k < w * h * 0.25; k++) R(x, shade('#bdb6a8', 0.96 + rnd() * 0.07), rnd() * w, rnd() * h);
    for (let z = Z0 + 3; z < Z1; z += 3) R(x, 'rgba(90,82,72,0.35)', 0, gz(z), w, 1); // expansion joints
    R(x, 'rgba(90,82,72,0.25)', gx(0), 0, 1, h);
    // the canals at the edges, with their gratings, and sand swept against the walls
    for (const s of [-1, 1]) {
      const c0 = s < 0 ? gx(-FRONT) : gx(FRONT - 0.45);
      R(x, '#6a665e', c0, 0, 0.45 * G, h);
      for (let y = 0; y < h; y += 3) R(x, '#4a463e', c0, y, 0.45 * G, 1);
      for (let k = 0; k < 90; k++) R(x, 'rgba(196,170,120,0.55)', s < 0 ? c0 + 0.45 * G + rnd() * 6 : c0 - rnd() * 6, rnd() * h, 2 + rnd() * 3, 2);
    }
    // cracks, oil, bottle caps, leaves near the tree
    for (let k = 0; k < 18; k++) { let px = rnd() * w, pz = rnd() * h; const dx = rnd() < 0.5 ? 1 : 0; for (let s = 0; s < 10; s++) { R(x, 'rgba(90,82,72,0.35)', px, pz); if (dx) px += 1; else pz += 1; if (rnd() < 0.4) { if (dx) pz += rnd() < 0.5 ? 1 : -1; else px += rnd() < 0.5 ? 1 : -1; } } }
    for (let k = 0; k < 7; k++) { const cx = rnd() * w, cz = rnd() * h; for (let p = 0; p < 30; p++) R(x, 'rgba(60,56,52,0.1)', cx + (rnd() - 0.5) * 14, cz + (rnd() - 0.5) * 8, 2, 2); }
    for (let k = 0; k < 24; k++) R(x, pick(['#e8384f', '#2f6fd6', '#ffd23f', '#e8e8e8']), rnd() * w, rnd() * h);
    for (let k = 0; k < 160; k++) R(x, pick(['#7a9a3a', '#a8883a', '#5a7a2a']), rnd() * w, gz(Z0) + rnd() * 6 * G, 2, 1);
  });
  add(mesh(new THREE.PlaneGeometry(GW, Z1 - Z0), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }), { rx: -Math.PI / 2, z: (Z0 + Z1) / 2, cast: false, receive: true }));
  const asphalt = canvasTex(128, 16, (x, w, h) => { R(x, '#56575a', 0, 0, w, h); for (let k = 0; k < 500; k++) R(x, shade('#56575a', 0.85 + rnd() * 0.3), rnd() * w, rnd() * h); for (let k = 0; k < w; k += 8) R(x, '#e8c84a', k, 8, 4, 1); }, { repeat: [4, 1] });
  add(mesh(new THREE.PlaneGeometry(90, 6.5), new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 }), { rx: -Math.PI / 2, z: Z0 - 3.25, y: -0.01, cast: false, receive: true }));
  add(mesh(new THREE.PlaneGeometry(400, 400), mat('#b3ad9e'), { rx: -Math.PI / 2, y: -0.03, cast: false, receive: true }));
  // the chalk: the circle, the line, and a piko
  const CH = 24, CX0 = -7, CX1 = 7, CZ0 = -9, CZ1 = 11.5;
  const chalkTex = canvasTex((CX1 - CX0) * CH, (CZ1 - CZ0) * CH, (x, w, h) => {
    const cx = (m) => (m - CX0) * CH, cz = (m) => (m - CZ0) * CH, C = 'rgba(252,250,244,0.92)';
    for (let a = 0; a < TAU; a += 0.02) R(x, C, cx(Math.cos(a) * CAN.circle), cz(Math.sin(a) * CAN.circle), 2, 2);
    let wob = 0;
    for (let m = -6.6; m < 6.6; m += 1 / CH) { wob = clamp(wob + (rnd() - 0.5) * 0.6, -1.5, 1.5); R(x, C, cx(m), cz(LINE_Z) + wob, 2, 3); }
    x.fillStyle = C; x.font = '800 30px "Baloo 2", system-ui'; x.textAlign = 'center'; x.fillText('TUMBANG PRESO', cx(0), cz(LINE_Z + 3.4)); x.font = '800 18px "Baloo 2", system-ui'; x.fillText('LINYA', cx(5.2), cz(LINE_Z + 0.9));
    const sq = (px, pz, n = '') => { for (let t = 0; t < 1; t += 0.02) { R(x, C, cx(px + t), cz(pz), 1, 1); R(x, C, cx(px + t), cz(pz + 1), 1, 1); R(x, C, cx(px), cz(pz + t), 1, 1); R(x, C, cx(px + 1), cz(pz + t), 1, 1); } if (n) { x.font = '700 14px "Baloo 2", system-ui'; x.fillText(n, cx(px + 0.5), cz(pz + 0.65)); } };
    for (let k = 0; k < 3; k++) sq(-6.4, -7 + k, String(k + 1));
    sq(-6.9, -4, '4'); sq(-5.9, -4, '5'); sq(-6.4, -3, '6'); sq(-6.4, -2, 'LANGIT');
  });
  const chalk = mesh(new THREE.PlaneGeometry(CX1 - CX0, CZ1 - CZ0), new THREE.MeshStandardMaterial({ map: chalkTex, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }), { rx: -Math.PI / 2, y: 0.005, x: (CX0 + CX1) / 2, z: (CZ0 + CZ1) / 2, cast: false, receive: true });
  add(chalk);

  // ---------- the houses, shoulder to shoulder on both sides ----------
  const WALLS = ['#f4a58c', '#9fdcb8', '#ffe07a', '#8fc8f0', '#f6f1e6', '#f7b7d0', '#c8b8f0', '#ffc27a', '#b8e07a'];
  const GATES = ['#2e7d4a', '#b8322a', '#2f5fae', '#6a4a8a', '#3a3a3a'];
  const roofSheet = canvasTex(32, 32, (x, w, h) => { for (let k = 0; k < w; k++) R(x, k % 2 ? '#d6d8dc' : '#9ea2aa', k, 0, 1, h); for (let k = 0; k < 18; k++) R(x, 'rgba(170,80,40,0.55)', rnd() * w, rnd() * h, 2 + rnd() * 4, 1 + rnd() * 3); }, { repeat: [6, 3] });
  const rusty = canvasTex(32, 32, (x, w, h) => { for (let k = 0; k < w; k++) R(x, k % 2 ? '#b8764a' : '#8a5236', k, 0, 1, h); for (let k = 0; k < 24; k++) R(x, 'rgba(90,40,20,0.5)', rnd() * w, rnd() * h, 2 + rnd() * 5, 1 + rnd() * 3); }, { repeat: [6, 3] });
  const sheetM = new THREE.MeshStandardMaterial({ map: roofSheet, roughness: 0.6, metalness: 0.3 }), rustM = new THREE.MeshStandardMaterial({ map: rusty, roughness: 0.6, metalness: 0.3 });
  const grilleTex = canvasTex(16, 16, (x, w, h) => { R(x, '#1e1e1e', 0, 0, w, 1); R(x, '#1e1e1e', 0, h - 2, w, 2); for (let k = 0; k < w; k += 3) R(x, '#1e1e1e', k, 0, 1, h); R(x, '#1e1e1e', 0, 7, w, 1); }, { repeat: [4, 1] });
  const grilleM = new THREE.MeshStandardMaterial({ map: grilleTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  const tankM = flat('#2f6fd6', { roughness: 0.5 });
  const ledgeM = flat('#ece6da');
  const shirtC = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#ff8ae2', '#ffffff', '#ff9f43'];
  const laundry = [];
  function house(side, z0, wm, o) {
    const d = 7, h1 = 3, h2 = o.h2 || 0, over = o.over || 0, zc = z0 + wm / 2;
    const base = flat(o.color);
    const facade = (tex, w, h, x, y) => add(mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), { x, y, z: zc, ry: -side * Math.PI / 2, cast: false, receive: true }));
    const s = { kind: o.kind, color: o.color, trim: o.trim, grille: '#1e1e1e', gate: o.gate, door: o.door, store: o.store, flip: rnd() < 0.5, poster: rnd() < 0.3 };
    add(box(d, h1, wm, base, { x: side * (FRONT + d / 2), y: h1 / 2, z: zc, receive: true }));
    facade(storeyTex(wm, h1, { ...s, floor: 0 }), wm, h1, side * (FRONT - 0.01), h1 / 2);
    let top = h1, face = FRONT;
    if (h2) {
      face = FRONT - over;
      const up = { ...s, kind: o.kind2 || o.kind, color: o.color2 || o.color, floor: 1 };
      add(box(d, h2, wm, flat(up.color), { x: side * (face + d / 2), y: h1 + h2 / 2, z: zc, receive: true }));
      facade(storeyTex(wm, h2, up), wm, h2, side * (face - 0.01), h1 + h2 / 2);
      add(box(0.3 + over, 0.16, wm + 0.06, ledgeM, { x: side * (face + (0.3 + over) / 2 - 0.12), y: h1, z: zc }));
      if (o.balcony) {
        add(box(0.9, 0.1, wm - 0.4, ledgeM, { x: side * (face - 0.45), y: h1 + 0.05, z: zc }));
        add(mesh(new THREE.PlaneGeometry(wm - 0.4, 0.9), grilleM, { x: side * (face - 0.9), y: h1 + 0.5, z: zc, ry: Math.PI / 2, cast: false }));
        // the wash, hung on the balcony rail
        for (let k = 0; k < Math.floor(wm * 1.4); k++) { const c = box(0.02, 0.28 + rnd() * 0.2, 0.26 + rnd() * 0.12, flat(pick(shirtC)), { x: side * (face - 0.92), y: h1 + 0.72, z: z0 + 0.5 + k * 0.6 }); c.geometry.translate(0, -0.12, 0); scene.add(c); laundry.push({ m: c, p: rnd() * TAU }); }
      }
      top = h1 + h2;
    }
    if (o.roof === 'flat') {
      add(box(0.16, 0.5, wm, base, { x: side * (face + 0.08), y: top + 0.25, z: zc }));
      if (o.tank) { add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.1, 10), tankM, { x: side * (face + 2.2), y: top + 0.55, z: zc + (rnd() - 0.5) * (wm - 1.5) })); }
      if (o.antenna) { const ax = side * (face + 1.2), az = zc - wm / 4; add(box(0.04, 2.4, 0.04, mat('#8a8a8a'), { x: ax, y: top + 1.2, z: az })); for (let k = 0; k < 4; k++) add(box(0.03, 0.03, 1.1 - k * 0.2, mat('#8a8a8a'), { x: ax, y: top + 1.6 + k * 0.22, z: az })); }
    } else {
      // a lean-to roof of corrugated sheet, high at the back, its eave over the alley
      const rise = 1.1, run = d + 0.6, a = Math.atan2(rise, run), len = Math.hypot(rise, run);
      const sh = new THREE.Shape([new THREE.Vector2(side * (face - 0.6), top), new THREE.Vector2(side * (FRONT + d), top), new THREE.Vector2(side * (FRONT + d), top + rise * ((FRONT + d - face + 0.6) / run))]);
      const wedge = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: wm, bevelEnabled: false }), base);
      wedge.position.z = z0; wedge.castShadow = true; add(wedge);
      const sheet = box(len + 0.2, 0.05, wm + 0.3, o.rust ? rustM : sheetM, { x: side * (face - 0.6 + run / 2), y: top + rise / 2 + 0.04, z: zc, rz: side * a });
      add(sheet);
    }
    if (o.store) store(side, zc, wm);
    return { face, top };
  }

  // the sari-sari store, with its sign, its awning and its tambayan out front
  function store(side, zc, wm) {
    const sx = side * (FRONT - 0.02);
    const sign = signTex([['SARI-SARI STORE', 22], ['ni Aling Nena · may yelo', 12, 700]], '#f4f1e6', '#c0182e', 160, 44);
    add(mesh(new THREE.PlaneGeometry(3.4, 0.95), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.7 }), { x: sx - side * 0.05, y: 3.65, z: zc, ry: -side * Math.PI / 2, cast: false }));
    const stripes = canvasTex(16, 8, (x, w, h) => { for (let k = 0; k < w; k += 4) { R(x, '#e8384f', k, 0, 2, h); R(x, '#f6f1e6', k + 2, 0, 2, h); } R(x, '#b8182e', 0, h - 1, w, 1); }, { repeat: [6, 1] });
    add(box(1.3, 0.05, wm - 1, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }), { x: side * (FRONT - 0.62), y: 2.62, z: zc, rz: side * 0.28 }));
    const small = signTex([['PA-LOAD DITO', 14]], '#ffd23f', '#1b1b1b', 72, 20);
    add(mesh(new THREE.PlaneGeometry(0.9, 0.25), new THREE.MeshStandardMaterial({ map: small }), { x: sx - side * 0.02, y: 2.1, z: zc + wm / 2 - 0.7, ry: -side * Math.PI / 2, cast: false }));
    // a red cooler of ice candy, two monobloc chairs and a bench
    const cx = side * (FRONT - 0.3);
    add(box(0.36, 0.42, 0.55, flat('#d62f3f'), { x: cx, y: 0.21, z: zc + 1.6 }));
    add(box(0.38, 0.06, 0.57, flat('#f4f1e6'), { x: cx, y: 0.45, z: zc + 1.6 }));
    const ic = signTex([['ICE CANDY ₱5', 12]], '#f4f1e6', '#2f6fd6', 56, 16);
    add(mesh(new THREE.PlaneGeometry(0.34, 0.1), new THREE.MeshStandardMaterial({ map: ic }), { x: cx - side * 0.185, y: 0.28, z: zc + 1.6, ry: -side * Math.PI / 2, cast: false }));
    for (const dz of [-1.6, -0.9]) chair(side * (FRONT - 0.34), zc + dz, -side * Math.PI / 2 + (rnd() - 0.5) * 0.4);
    add(box(0.36, 0.42, 1.5, flat('#8a5a2b'), { x: side * (FRONT - 0.3), y: 0.21, z: zc - 2.9 }));
  }
  const plastic = flat('#f2f2ee', { roughness: 0.5 });
  function chair(x, z, ry) {
    const g = new THREE.Group();
    g.add(box(0.44, 0.05, 0.42, plastic, { y: 0.42 }));
    g.add(box(0.44, 0.42, 0.05, plastic, { y: 0.66, z: -0.2, rx: -0.12 }));
    for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) g.add(box(0.04, 0.42, 0.04, plastic, { x: lx, y: 0.21, z: lz }));
    g.position.set(x, 0, z); g.rotation.y = ry;
    add(g);
  }

  for (const side of [-1, 1]) {
    let z = -25;
    while (z < 23) {
      let wm = 4 + Math.floor(rnd() * 5) * 0.5;
      const store = side === 1 && z <= -4 && z + wm > -4;
      if (store) wm = 5.5;
      wm = Math.min(wm, 23 - z);
      if (wm < 2) break;
      const kind = store ? 'plain' : pick(['block', 'block', 'plain', 'brick', 'bare']);
      const floors = store || rnd() < 0.8 ? 2 : 1;
      const color = store ? '#9fdcb8' : kind === 'brick' ? pick(['#c8583a', '#b84a3a', '#d8704a']) : pick(WALLS);
      house(side, z, wm, {
        kind, color, trim: pick(['#f6f1e6', '#f6f1e6', '#6a4a2a', '#2f5fae']), gate: pick(GATES), door: store ? null : pick(['gate', 'gate', 'door']), store,
        h2: floors === 2 ? 2.6 + Math.floor(rnd() * 3) * 0.3 : 0, over: !store && rnd() < 0.35 ? 0.5 : 0, balcony: !store && rnd() < 0.3,
        kind2: rnd() < 0.3 ? 'wood' : null, color2: rnd() < 0.4 ? pick(WALLS) : null,
        roof: rnd() < 0.45 ? 'flat' : 'gi', rust: rnd() < 0.4, tank: rnd() < 0.7, antenna: rnd() < 0.5,
      });
      z += wm;
    }
  }
  // the far side of the cross street, and the dead end behind home
  let fx = -30;
  while (fx < 30) {
    const wm = 5 + Math.floor(rnd() * 4), h = 3 + Math.floor(rnd() * 3) * 2.6, color = pick(WALLS);
    add(box(wm, h, 6, flat(color), { x: fx + wm / 2, y: h / 2, z: Z0 - 9.5, receive: true }));
    add(mesh(new THREE.PlaneGeometry(wm, h), new THREE.MeshStandardMaterial({ map: storeyTex(wm, h, { kind: pick(['block', 'plain']), color, trim: '#f6f1e6', grille: '#1e1e1e', gate: pick(GATES), door: 'gate', floor: h > 4 ? 1 : 0 }), roughness: 0.95 }), { x: fx + wm / 2, y: h / 2, z: Z0 - 6.49, cast: false, receive: true }));
    fx += wm;
  }
  for (let hx = -FRONT; hx < FRONT; hx += 5.2) {
    const wm = Math.min(5.2, FRONT - hx), color = pick(WALLS);
    add(box(wm, 5.6, 5, flat(color), { x: hx + wm / 2, y: 2.8, z: Z1 + 2.5, receive: true }));
    add(mesh(new THREE.PlaneGeometry(wm, 5.6), new THREE.MeshStandardMaterial({ map: storeyTex(wm, 5.6, { kind: 'block', color, trim: '#f6f1e6', grille: '#1e1e1e', gate: pick(GATES), floor: 1 }), roughness: 0.95 }), { x: hx + wm / 2, y: 2.8, z: Z1 - 0.01, ry: Math.PI, cast: false, receive: true }));
  }

  // ---------- poles, wires, banderitas and a birthday tarpaulin ----------
  const poleM = flat('#9a9488');
  const wireM = new THREE.LineBasicMaterial({ color: '#1b1b1b' });
  const sag = (a, b, drop, n = 16) => { let px = a.x, py = a.y, pz = a.z; for (let k = 1; k <= n; k++) { const f = k / n, x = lerp(a.x, b.x, f), y = lerp(a.y, b.y, f) - Math.sin(f * Math.PI) * drop, z = lerp(a.z, b.z, f); wires.push(px, py, pz, x, y, z); px = x; py = y; pz = z; } };
  const posts = [[-7.45, -21], [7.45, -13], [-7.45, -4], [7.45, 6], [-7.45, 14], [7.45, 21]];
  for (const [x, z] of posts) {
    add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 8, 8), poleM, { x, y: 4, z }));
    add(box(0.12, 0.12, 1.6, flat('#6b5a4a'), { x, y: 7.5, z }));
  }
  add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 10), flat('#7a8088', { metalness: 0.4 }), { x: 7.25, y: 6.4, z: 6 })); // a transformer
  for (let k = 0; k < posts.length - 1; k++) for (const dz of [-0.6, 0, 0.6]) (sag(new THREE.Vector3(posts[k][0], 7.45, posts[k][1] + dz), new THREE.Vector3(posts[k + 1][0], 7.45, posts[k + 1][1] + dz), 0.8));
  for (let k = 0; k < 14; k++) { const [px, pz] = pick(posts), tz = pz + (rnd() - 0.5) * 10; (sag(new THREE.Vector3(px, 7.2, pz), new THREE.Vector3(-Math.sign(px) * (FRONT - 0.1), 4.8 + rnd(), tz), 0.4, 10)); } // wires to the houses, in a tangle
  const flags = [];
  const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.17, 0, 0), new THREE.Vector3(0.17, 0, 0), new THREE.Vector3(0, -0.4, 0)]);
  flagGeo.computeVertexNormals();
  const FLAGC = ['#e8384f', '#ffd23f', '#2f6fd6', '#3fae5a', '#ff8ae2', '#ff9f43', '#ffffff'];
  const STRINGS = [-15, -8, -1.5, 5, 11.5, 18], PER = 34;
  const bunting = new THREE.InstancedMesh(flagGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), STRINGS.length * PER);
  let fi = 0;
  STRINGS.forEach((z, s) => {
    const a = new THREE.Vector3(-FRONT + 0.3, 5.3 + (s % 2) * 0.4, z), b = new THREE.Vector3(FRONT - 0.3, 5.5 - (s % 2) * 0.3, z + 1.4);
    (sag(a, b, 0.8));
    for (let k = 0; k < PER; k++) { const f = (k + 0.5) / PER; flags.push({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) - Math.sin(f * Math.PI) * 0.8, z: lerp(a.z, b.z, f), p: k * 0.7 + z }); bunting.setColorAt(fi++, new THREE.Color(FLAGC[(k + s) % FLAGC.length])); }
  });
  bunting.castShadow = true;
  scene.add(bunting);
  const dummy = new THREE.Object3D();
  const tarpTex = canvasTex(200, 56, (x, w, h) => {
    R(x, '#ff5fa2', 0, 0, w, h);
    for (let k = 0; k < 40; k++) R(x, pick(['#ffd23f', '#ffffff', '#7cf29a']), rnd() * w, rnd() * h, 2, 2);
    R(x, '#f6d7b8', 8, 8, 40, 40); R(x, '#d9d9d9', 12, 10, 32, 12); R(x, '#8a5a3a', 14, 20, 28, 26); R(x, '#1b1320', 20, 28, 4, 3); R(x, '#1b1320', 32, 28, 4, 3); R(x, '#c0182e', 24, 38, 8, 2); // Lola, smiling
    x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.font = '800 15px "Baloo 2", system-ui'; x.fillText('MALIGAYANG KAARAWAN', 124, 20);
    x.font = '800 22px "Baloo 2", system-ui'; x.fillStyle = '#ffd23f'; x.fillText('LOLA ISKA!', 124, 42); x.font = '700 10px "Baloo 2", system-ui'; x.fillStyle = '#fff'; x.fillText('ika-80 · mula sa inyong mga apo', 124, 53);
  });
  const tarp = mesh(new THREE.PlaneGeometry(5.2, 1.46, 8, 1), new THREE.MeshStandardMaterial({ map: tarpTex, side: THREE.DoubleSide, roughness: 0.8 }), { y: 4.6, z: -19.5, cast: true });
  scene.add(tarp);
  (sag(new THREE.Vector3(-FRONT + 0.2, 5.5, -19.5), new THREE.Vector3(FRONT - 0.2, 5.5, -19.5), 0.25));

  // ---------- a mango tree, a basketball ring, a fishball cart, an askal, plants ----------
  const leafM = [flat('#3f8a35'), flat('#4f9a3f'), flat('#2f7a2f')];
  function tree(x, z, s) {
    add(mesh(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 4 * s, 7), flat('#6b4a2a'), { x, y: 2 * s, z }));
    for (let k = 0; k < 7; k++) add(mesh(new THREE.IcosahedronGeometry((1.4 + rnd() * 0.9) * s, 0), pick(leafM), { x: x + (rnd() - 0.5) * 3.2 * s, y: (4.2 + rnd() * 1.8) * s, z: z + (rnd() - 0.5) * 2.4 * s }));
  }
  tree(1.5, Z0 - 13.5, 1.9);
  tree(-10, Z0 - 13, 1.4);
  add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8), flat('#3a4a5a'), { x: -6.8, y: 1.7, z: -23.5 }));
  add(box(0.06, 0.9, 1.2, flat('#f4f1e6'), { x: -6.7, y: 3.3, z: -23.5 }));
  add(mesh(new THREE.TorusGeometry(0.23, 0.025, 6, 16), flat('#ff6b3d'), { x: -6.4, y: 3.0, z: -23.5, rx: Math.PI / 2 }));
  // Manong's fishball cart, out past the field
  const cart = new THREE.Group();
  cart.add(box(1.4, 0.8, 0.7, flat('#2f8fd6'), { y: 0.75 }));
  cart.add(box(1.46, 0.06, 0.76, flat('#dcdcdc', { metalness: 0.5 }), { y: 1.17 }));
  cart.add(mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.1, 12), flat('#2a2a2a'), { x: -0.35, y: 1.25 }));
  for (let k = 0; k < 8; k++) cart.add(mesh(new THREE.SphereGeometry(0.04, 5, 4), flat(k % 3 ? '#e8b060' : '#ff8a3a'), { x: -0.35 + (rnd() - 0.5) * 0.3, y: 1.31, z: (rnd() - 0.5) * 0.3 }));
  for (const wz of [-0.4, 0.4]) cart.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), flat('#1b1b1b'), { x: 0.3, y: 0.3, z: wz, rx: Math.PI / 2 }));
  cart.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), flat('#dcdcdc'), { x: 0.5, y: 1.9 }));
  const umb = canvasTex(16, 4, (x, w, h) => { for (let k = 0; k < w; k += 2) R(x, ['#e8384f', '#ffd23f', '#2f6fd6', '#f6f1e6'][(k / 2) % 4], k, 0, 2, h); });
  cart.add(mesh(new THREE.ConeGeometry(1.1, 0.5, 8, 1, true), new THREE.MeshStandardMaterial({ map: umb, side: THREE.DoubleSide, roughness: 0.8 }), { x: 0.5, y: 2.75 }));
  const cs = signTex([['FISHBALL', 13], ['kikiam · kwek-kwek', 9, 700]], '#ffd23f', '#c0182e', 64, 26);
  cart.add(mesh(new THREE.PlaneGeometry(0.9, 0.36), new THREE.MeshStandardMaterial({ map: cs }), { y: 0.8, z: 0.36, cast: false }));
  cart.position.set(5.2, 0, -13.5); cart.rotation.y = -Math.PI / 2 + 0.2;
  add(cart);
  const dog = new THREE.Group();
  dog.add(box(0.26, 0.2, 0.62, flat('#c8945a'), { y: 0.14 }));
  const dogHead = box(0.22, 0.2, 0.24, flat('#c8945a'), { y: 0.24, z: 0.36 });
  dog.add(dogHead);
  for (const s of [-1, 1]) dog.add(box(0.05, 0.1, 0.06, flat('#8a5a2b'), { x: s * 0.08, y: 0.38, z: 0.34 }));
  const tail = box(0.05, 0.05, 0.24, flat('#c8945a'), { y: 0.24, z: -0.4, rx: 0.5 });
  dog.add(tail);
  dog.position.set(-7.1, 0, -11); dog.rotation.y = 0.9;
  scene.add(dog);
  // potted plants, drums of water, and signs on the walls
  const potC = ['#b8643a', '#2f6fd6', '#e8384f', '#f4f1e6', '#3fae5a'];
  for (let k = 0; k < 22; k++) {
    const side = rnd() < 0.5 ? -1 : 1, z = -24 + rnd() * 46;
    if (side === 1 && z > -5 && z < 2) continue;
    const g = new THREE.Group(), n = 1 + Math.floor(rnd() * 3);
    for (let p = 0; p < n; p++) {
      const pz = p * 0.42, pc = pick(potC), tall = rnd() < 0.3;
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 8), flat(pc), { y: 0.13, z: pz }));
      if (tall) for (let l = 0; l < 5; l++) g.add(mesh(new THREE.ConeGeometry(0.05, 0.6, 4), pick(leafM), { y: 0.5, z: pz + (rnd() - 0.5) * 0.12, x: (rnd() - 0.5) * 0.12, rz: (rnd() - 0.5) * 0.4 }));
      else for (let l = 0; l < 3; l++) g.add(mesh(new THREE.IcosahedronGeometry(0.14 + rnd() * 0.08, 0), pick(leafM), { y: 0.36 + rnd() * 0.1, z: pz + (rnd() - 0.5) * 0.15, x: (rnd() - 0.5) * 0.15 }));
    }
    g.position.set(side * (FRONT - 0.25), 0, z);
    add(g);
  }
  for (const [x, z] of [[-7.4, 3.2], [7.4, 12.5], [-7.4, -16]]) add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 10), flat('#2f6fd6', { roughness: 0.5 }), { x, y: 0.44, z }));
  for (const [text, bg, fg, side, z, y] of [['BAWAL UMIHI DITO!', '#f4f1e6', '#c0182e', -1, -7, 1.9], ['BAWAL MAGTAPON NG BASURA', '#2e7d4a', '#ffffff', 1, 14, 2.1], ['MAY ICE WATER', '#2f6fd6', '#ffffff', -1, 9.5, 2.0]]) {
    const t = signTex([[text, text.length > 16 ? 10 : 13]], bg, fg, 110, 22);
    add(mesh(new THREE.PlaneGeometry(1.3, 0.26), new THREE.MeshStandardMaterial({ map: t }), { x: side * (FRONT - 0.03), y, z, ry: -side * Math.PI / 2, cast: false }));
  }
  // a jeepney that goes by on the cross street now and then
  const jeep = new THREE.Group();
  const jtex = canvasTex(96, 24, (c, w, h) => { R(c, '#e8e8ea', 0, 0, w, h); ['#e8384f', '#2f6fd6', '#ffd23f'].forEach((col, k) => R(c, col, 0, 14 + k * 3, w, 2)); for (let k = 0; k < 7; k++) R(c, '#23242c', 6 + k * 12, 3, 9, 8); });
  jeep.add(box(4.6, 1.5, 1.9, new THREE.MeshStandardMaterial({ map: jtex, roughness: 0.5, metalness: 0.3 }), { y: 1.25 }));
  jeep.add(box(1.3, 0.9, 1.8, flat('#c9ccd4', { metalness: 0.6, roughness: 0.3 }), { x: 2.9, y: 0.95 }));
  jeep.add(box(4.8, 0.12, 2.1, flat('#e8384f'), { y: 2.05 }));
  const jsign = signTex([['CUBAO', 16]], '#ffffff', '#e8384f', 48, 16);
  jeep.add(mesh(new THREE.PlaneGeometry(1.4, 0.4), new THREE.MeshStandardMaterial({ map: jsign }), { x: 1.0, y: 2.35, z: 0.9, cast: false }));
  for (const [x, z] of [[1.7, 0.95], [1.7, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) jeep.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), flat('#1b1b1b'), { x, y: 0.42, z, rx: Math.PI / 2 }));
  jeep.position.set(-40, 0, Z0 - 3.2);
  scene.add(jeep);

  // lamps on the poles, lit when it gets late
  const lamps = [];
  for (const [x, z] of posts.slice(1, 5)) {
    const bulb = mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff4c2', emissive: '#ffcf7a', emissiveIntensity: 0 }), { x: x - Math.sign(x) * 0.9, y: 6.6, z, cast: false });
    add(bulb, box(0.9, 0.06, 0.06, flat('#6b6b6b'), { x: x - Math.sign(x) * 0.45, y: 6.75, z }));
    lamps.push(bulb);
  }

  // ---------- the kids ----------
  function faceTex(i) {
    return canvasTex(32, 24, (x) => {
      for (const X of [9, 20]) { R(x, '#ffffff', X, 9, 3, 4); R(x, '#1b1320', X + 1, 10, 2, 3); R(x, '#ffffff', X + 1, 10); R(x, HAIR, X - (i === 3 ? 1 : 0), 7 - (i === 2 ? 1 : 0), 4, 1); }
      if (i % 2) { R(x, '#7a2a2a', 13, 17, 6, 1); R(x, '#7a2a2a', 12, 16); R(x, '#7a2a2a', 19, 16); } else { R(x, '#7a2a2a', 14, 17, 4, 1); }
      R(x, 'rgba(255,110,110,0.35)', 6, 14, 3, 2); R(x, 'rgba(255,110,110,0.35)', 23, 14, 3, 2);
    });
  }
  function kidModel(k) {
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const skin = flat(SKIN[k.i % SKIN.length]), shirt = flat(k.shirt), shorts = flat(SHORTS[k.i % SHORTS.length]), hair = flat(HAIR);
    const leg = (sx) => { const g = new THREE.Group(); g.position.set(sx, 0.5, 0); g.add(box(0.1, 0.42, 0.11, skin, { y: -0.23 })); g.add(box(0.13, 0.04, 0.25, flat(SLIPPERS[k.i]), { y: -0.47, z: 0.04 })); body.add(g); return g; };
    const legL = leg(-0.085), legR = leg(0.085);
    if (k.i === 2) body.add(mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.52, 8), shirt, { y: 0.72 })); // Nene's dress
    else { body.add(box(0.32, 0.17, 0.2, shorts, { y: 0.55 })); body.add(box(0.34, 0.36, 0.21, shirt, { y: 0.8 })); }
    if (k.i === 3) for (let s = 0; s < 3; s++) body.add(box(0.345, 0.04, 0.215, flat('#f4f1e6'), { y: 0.7 + s * 0.1 })); // Kulot's stripes
    const arm = (sx) => { const g = new THREE.Group(); g.position.set(sx, 0.95, 0); g.add(box(0.12, 0.13, 0.13, shirt, { y: -0.05 })); g.add(box(0.08, 0.28, 0.08, skin, { y: -0.23 })); g.add(box(0.09, 0.08, 0.09, skin, { y: -0.4 })); body.add(g); return g; };
    const armL = arm(-0.23), armR = arm(0.23);
    const head = new THREE.Group(); head.position.y = 1.18; body.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(SKIN[k.i % SKIN.length])));
    head.add(mesh(new THREE.SphereGeometry(0.203, 12, 8, Math.PI / 2 - 0.75, 1.5, Math.PI / 2 - 0.5, 1.0), new THREE.MeshStandardMaterial({ map: faceTex(k.i), transparent: true, alphaTest: 0.3, roughness: 0.8 }), { cast: false }));
    for (const s of [-1, 1]) head.add(box(0.04, 0.07, 0.05, mat(SKIN[k.i % SKIN.length]), { x: s * 0.2, y: -0.01 })); // ears
    const cap = (c, back) => { head.add(mesh(new THREE.SphereGeometry(0.214, 10, 6, 0, TAU, 0, Math.PI * 0.45), flat(c), { y: 0.03 })); head.add(box(0.24, 0.03, 0.16, flat(c), { y: 0.07, z: back ? -0.24 : 0.24 })); };
    if (k.you) cap('#ffd23f', false);
    else if (k.i === 4) cap('#2f3f6a', true); // Bong's cap, backwards
    else {
      head.add(mesh(new THREE.SphereGeometry(0.215, 10, 6, 0, TAU, 0, Math.PI * 0.5), hair, { y: 0.01, rx: -0.3 }));
      if (k.i === 1) for (let s = 0; s < 6; s++) head.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 4), hair, { x: Math.cos(s) * 0.09, y: 0.21, z: Math.sin(s) * 0.09 - 0.02, rx: -0.4 + (s % 2) * 0.3 })); // Buboy's spikes
      if (k.i === 2) { head.add(box(0.36, 0.34, 0.1, hair, { y: -0.12, z: -0.14 })); for (const s of [-1, 1]) head.add(mesh(new THREE.IcosahedronGeometry(0.08, 0), hair, { x: s * 0.24, y: 0.02, z: -0.08 })); } // Nene's long hair and pigtails
      if (k.i === 3) for (let c = 0; c < 9; c++) head.add(mesh(new THREE.IcosahedronGeometry(0.075, 0), hair, { x: Math.cos(c * 0.7) * 0.15, y: 0.13 + (c % 2) * 0.05, z: Math.sin(c * 0.7) * 0.13 - 0.03 })); // Kulot's curls
    }
    const bandana = mesh(new THREE.TorusGeometry(0.205, 0.03, 6, 16), flat('#e8384f'), { y: 0.06, rx: Math.PI / 2 });
    head.add(bandana);
    const slipper = slipperModel(k.i);
    armR.add(slipper); slipper.position.set(0, -0.44, 0.06); slipper.rotation.set(Math.PI / 2, 0, 0);
    const tag = label(k.you ? 'IKAW' : k.name, k.you ? '#ffd23f' : '#fff8e1');
    tag.position.y = 1.78; root.add(tag);
    const tayaTag = label('TAYA', '#fff', '#e8384f', 0.8);
    tayaTag.position.y = 2.02; root.add(tayaTag);
    const ring = mesh(new THREE.RingGeometry(0.38, 0.48, 28), new THREE.MeshBasicMaterial({ color: k.you ? '#ffd23f' : '#e8384f', transparent: true, opacity: 0.75, depthWrite: false }), { rx: -Math.PI / 2, y: 0.02, cast: false });
    root.add(ring);
    root.traverse((o) => { if (o.isMesh && o !== ring) { o.geometry.computeBoundingSphere(); o.castShadow = o.geometry.boundingSphere.radius > 0.12 && !o.material.transparent; } });
    scene.add(root);
    return { root, body, legL, legR, armL, armR, head, bandana, slipper, tag, tayaTag, ring, phase: Math.random() * TAU };
  }
  function slipperModel(i) {
    const g = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.13); shape.bezierCurveTo(0.07, -0.13, 0.065, 0.02, 0.055, 0.07); shape.bezierCurveTo(0.05, 0.14, -0.05, 0.14, -0.055, 0.07); shape.bezierCurveTo(-0.065, 0.02, -0.07, -0.13, 0, -0.13);
    const sole = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.024, bevelEnabled: false, curveSegments: 6 }), flat(SLIPPERS[i], { roughness: 0.7 }));
    sole.rotation.x = -Math.PI / 2; sole.castShadow = true;
    g.add(sole);
    const strap = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.05, 0.026, 0.0), new THREE.Vector3(0, 0.055, -0.07), new THREE.Vector3(0.05, 0.026, 0.0)]), 10, 0.01, 5), flat('#f4f1e6'));
    strap.castShadow = true;
    g.add(strap);
    return g;
  }
  const kids = new Map();
  const slippers = new Map();

  // ---------- the lata ----------
  const labelTex = canvasTex(64, 32, (c, w, h) => {
    R(c, '#e8384f', 0, 0, w, h); R(c, '#ffd23f', 0, 8, w, 16);
    c.fillStyle = '#c0182e'; c.font = '800 11px "Baloo 2", system-ui'; c.textAlign = 'center'; c.fillText('SARDINAS', w / 2, 20);
    R(c, '#ffffff', 0, 27, w, 1);
  });
  const tin = new THREE.MeshStandardMaterial({ color: '#c9ccd4', metalness: 0.8, roughness: 0.3 });
  const canMats = [new THREE.MeshStandardMaterial({ map: labelTex, metalness: 0.2, roughness: 0.5 }), tin, tin];
  const canMesh = mesh(new THREE.CylinderGeometry(CAN.r, CAN.r, CAN.h, 20), canMats);
  const canGroup = new THREE.Group(); canGroup.add(canMesh); scene.add(canGroup);

  // the throw preview: dots along the arc and a ring where it comes down
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 }), 60);
  dots.count = 0; dots.frustumCulled = false; scene.add(dots);
  const landRing = mesh(new THREE.RingGeometry(0.16, 0.24, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }), { rx: -Math.PI / 2, y: 0.03, cast: false });
  landRing.visible = false; scene.add(landRing);

  // bits of dust, shine and confetti
  const MAXP = low ? 160 : 360;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, depthWrite: false }));
  points.frustumCulled = false; scene.add(points);
  const parts = [];
  const emit = (x, y, z, color, n, speed = 2, up = 2, life = 0.8, g = 6) => { for (let k = 0; k < n && parts.length < MAXP; k++) { const a = Math.random() * TAU; parts.push({ x, y, z, vx: Math.cos(a) * speed * Math.random(), vy: up * (0.5 + Math.random()), vz: Math.sin(a) * speed * Math.random(), life, max: life, c: new THREE.Color(color), g }); } };

  // ---------- your own hands, for the first-person camera ----------
  const fp = new THREE.Group(); camera.add(fp);
  const fpSkin = flat(SKIN[0]), fpShirt = flat('#e8384f');
  const fpDark = flat(shade(SKIN[0], 0.82));
  function fpArm(sx) {
    const g = new THREE.Group(), fore = new THREE.Group(); g.add(fore);
    const arm = mesh(new THREE.CylinderGeometry(0.038, 0.05, 0.36, 7), fpSkin, { z: 0.1, rx: Math.PI / 2, cast: false });
    fore.add(arm);
    fore.add(box(0.1, 0.1, 0.09, fpSkin, { z: -0.11, cast: false })); // the palm
    fore.add(box(0.1, 0.045, 0.07, fpDark, { y: 0.045, z: -0.16, cast: false })); // curled fingers
    fore.add(box(0.1, 0.045, 0.07, fpSkin, { y: -0.005, z: -0.17, cast: false }));
    fore.add(box(0.035, 0.035, 0.07, fpSkin, { x: -sx * 0.055, y: 0.03, z: -0.12, rz: sx * 0.4, cast: false })); // the thumb
    fore.add(mesh(new THREE.CylinderGeometry(0.062, 0.066, 0.12, 7), fpShirt, { z: 0.3, rx: Math.PI / 2, cast: false })); // the sleeve
    fp.add(g);
    return { g, fore };
  }
  const fpR = fpArm(1), fpL = fpArm(-1);
  const fpSlip = slipperModel(0); fpSlip.scale.setScalar(1.6); fpSlip.traverse((o) => { o.castShadow = false; });
  fpR.fore.add(fpSlip); fpSlip.position.set(0, 0.03, -0.26); fpSlip.rotation.set(Math.PI / 2 - 0.25, 0, 0.12);
  const fpCan = new THREE.Mesh(canMesh.geometry, canMats); fpCan.scale.setScalar(1.25); fp.add(fpCan); fpCan.position.set(0, -0.2, -0.5);
  const fpState = { phase: 0, dip: 0, aimT: 0 };
  const pose = (arm, px, py, pz, rx, ry, rz, k) => { arm.g.position.x = lerp(arm.g.position.x, px, k); arm.g.position.y = lerp(arm.g.position.y, py, k); arm.g.position.z = lerp(arm.g.position.z, pz, k); arm.fore.rotation.x = lerp(arm.fore.rotation.x, rx, k); arm.fore.rotation.y = lerp(arm.fore.rotation.y, ry, k); arm.fore.rotation.z = lerp(arm.fore.rotation.z, rz, k); };

  function hands(g, me, o, dt, t) {
    const k = Math.min(1, dt * 14), run = clamp(me.speed / 5, 0, 1.2);
    fpState.phase += dt * (4 + me.speed * 2.2);
    const bob = o.reduced ? 0 : Math.sin(fpState.phase) * 0.05 * run, dip = (fpState.dip = Math.max(0, fpState.dip - dt * 3)) * 0.12;
    const carrying = g.can.state === 'carried' && taya(g) === me;
    fpCan.visible = carrying;
    fpSlip.visible = me.role === 'thrower' && me.hasSlip;
    fpState.aimT = o.aim ? Math.min(1, fpState.aimT + dt * 7) : 0;
    if (me.anim.throwT > 0 && me.role === 'thrower') {
      // the swing: from the wind-up, forward and down
      const f = 1 - me.anim.throwT / 0.35, e = f * f * (3 - 2 * f);
      pose(fpR, lerp(0.5, 0.16, e), lerp(-0.28, -0.44, e), lerp(-0.5, -0.66, e), lerp(0.75, 0.1, e), lerp(0.25, 0.1, e), 0, 1);
      pose(fpL, -0.36, -0.8, -0.5, 0.2, -0.2, 0, k);
    } else if (o.aim) {
      const a = fpState.aimT, pw = o.aim.power, tr = o.reduced ? 0 : Math.sin(t * 34) * 0.004 * pw;
      pose(fpR, lerp(0.46, 0.5 + pw * 0.02, a) + tr, lerp(-0.42, -0.28 + pw * 0.02, a), lerp(-0.52, -0.5 + pw * 0.04, a), lerp(0.4, 0.75, a), lerp(0.2, 0.25, a), lerp(0.05, 0.2, a), 1);
      pose(fpL, -0.36, -0.8, -0.5, 0.3, -0.2, 0, k);
    } else if (me.dive > 0) {
      pose(fpR, 0.22, -0.2, -0.6, 0.6, 0.1, 0, Math.min(1, dt * 30)); pose(fpL, -0.22, -0.2, -0.6, 0.6, -0.1, 0, Math.min(1, dt * 30));
    } else if (carrying) {
      pose(fpR, 0.2, -0.36 + bob * 0.3, -0.46, 0.25, -0.5, 0, k); pose(fpL, -0.2, -0.36 + bob * 0.3, -0.46, 0.25, 0.5, 0, k);
      fpCan.position.set(0, -0.26 + bob * 0.3, -0.52);
    } else if (me.role === 'thrower' && me.hasSlip) {
      pose(fpR, 0.46, -0.42 + bob - dip, -0.52 + Math.cos(fpState.phase) * 0.02 * run, 0.4, 0.2, 0.05, k);
      pose(fpL, -0.36, run > 0.3 ? -0.46 - bob : -0.8, -0.5, 0.3, -0.2, 0, k);
    } else {
      // empty hands: they pump when you run
      const show = run > 0.3 || me.role === 'taya';
      pose(fpR, 0.36, (show ? -0.46 : -0.8) + bob - dip, -0.5, 0.3, 0.2, 0, k);
      pose(fpL, -0.36, (show ? -0.46 : -0.8) - bob - dip, -0.5, 0.3, -0.2, 0, k);
    }
  }

  // ---------- the camera ----------
  const cam = { yaw: 0, pitch: 0, pos: new THREE.Vector3(0, 2, 13), look: new THREE.Vector3(0, 1.4, -8), shake: 0, firstPerson: false };
  const tmp = new THREE.Vector3();

  function resize() {
    const r = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = Math.max(0.3, r.width / Math.max(1, r.height));
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
      case 'land': emit(e.x, 0.05, e.z, '#e8e0d0', 8, 1.2, 0.8, 0.5); break;
      case 'knock': emit(0, 0.2, 0, '#fff4c2', 18, 3, 3, 0.6); for (const c of FLAGC) emit(0, 0.5, 0, c, 6, 3.5, 4.5, 1.4, 5); cam.shake = 0.14; break;
      case 'clang': emit(g.can.x, 0.1, g.can.z, '#ffffff', 6, 1.5, 1, 0.3); break;
      case 'tag': { const t = g.kids[e.taya]; emit(t.x, 1, t.z, '#ff5c5c', 16, 2.5, 2.5, 0.7); cam.shake = g.kids[e.kid].you || t.you ? 0.2 : 0.08; break; }
      case 'canSet': emit(0, 0.1, 0, '#fff4c2', 10, 1, 1.2, 0.5); break;
      case 'dive': if (k) emit(k.x, 0.05, k.z, '#e8e0d0', 10, 1.5, 0.6, 0.5); break;
      case 'pickup': if (k) { emit(k.x, 0.3, k.z, '#7cf29a', 8, 1.2, 1.5, 0.5); if (k.you) fpState.dip = 1; } break;
      default: break;
    }
  }

  // ---------- each frame ----------
  function frame(g, dt, o = {}) {
    const t = performance.now() / 1000;
    const day = clamp(g.t / g.limit, 0, 1);
    // the afternoon: the sun lowers and warms; at the very end the lamps come on
    const sunEl = lerp(0.95, 0.5, day), sunAz = -2.4;
    const sd = new THREE.Vector3(Math.cos(sunEl) * Math.sin(sunAz), Math.sin(sunEl), Math.cos(sunEl) * Math.cos(sunAz));
    sun.position.copy(sd).multiplyScalar(50).add(sun.target.position);
    sun.intensity = lerp(2.7, 2.3, day); sun.color.set('#fff1dc').lerp(new THREE.Color('#ffc890'), day);
    hemi.intensity = lerp(2.0, 1.6, day);
    skyU.top.value.set('#5ea8ec').lerp(new THREE.Color('#6a8ad0'), day); skyU.mid.value.set('#a9d4f5').lerp(new THREE.Color('#f0c8a0'), day); skyU.low.value.set('#e8f1f4').lerp(new THREE.Color('#ffd8b0'), day);
    skyU.sunDir.value.copy(sd);
    scene.fog.color.set('#dce9f2').lerp(new THREE.Color('#f2d8c0'), day);
    const late = clamp((day - 0.8) / 0.2, 0, 1);
    for (const b of lamps) b.material.emissiveIntensity = late * 2.2;
    // banderitas, the wash and the tarpaulin in the breeze
    flags.forEach((f, k) => { dummy.position.set(f.x, f.y, f.z); dummy.rotation.set(Math.sin(t * 2 + f.p) * 0.25, 0, 0); dummy.updateMatrix(); bunting.setMatrixAt(k, dummy.matrix); });
    bunting.instanceMatrix.needsUpdate = true;
    for (const l of laundry) l.m.rotation.z = Math.sin(t * 1.6 + l.p) * 0.12;
    tarp.rotation.x = Math.sin(t * 1.1) * 0.05;
    tail.rotation.y = Math.sin(t * 9) * 0.5; dogHead.rotation.y = Math.sin(t * 0.4) * 0.4;
    jeep.position.x = ((t * 6) % 140) - 50; // across, then gone for a while

    const me = g.kids.find((k) => k.you);
    const fpNow = o.mode === 'play' && o.view !== 'chase' && !!me;
    cam.firstPerson = fpNow;
    fp.visible = fpNow;
    // the kids
    const ta = taya(g);
    for (const k of g.kids) {
      let m = kids.get(k.i);
      if (!m) { m = kidModel(k); kids.set(k.i, m); }
      m.root.visible = !(fpNow && k.you);
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
      const near = fpNow && Math.hypot(k.x - me.x, k.z - me.z) < 2.4; // right next to you, a name tag only gets in the way
      if (tayaNow && g.can.state === 'carried' && ta === k) { m.armL.rotation.x = -1.3; m.armR.rotation.x = -1.3; }
      if (k.anim.throwT > 0) { const f = 1 - k.anim.throwT / 0.35; m.armR.rotation.x = lerp(2.6, -1.1, f); m.body.rotation.y = lerp(-0.4, 0.3, f); }
      else m.body.rotation.y = 0;
      if (o.aim && k.you) { m.armR.rotation.x = 2.4 + Math.sin(t * 10) * 0.05; m.body.rotation.y = -0.35; m.legL.rotation.x = 0.25; m.legR.rotation.x = -0.2; }
      if (k.dive > 0) { m.body.rotation.x = 1.1; m.body.position.y = -0.35; m.armL.rotation.x = m.armR.rotation.x = -2.6; }
      else if (k.recover > 0) { m.body.rotation.x = 0.5; }
      if (k.anim.tagT > 0) { m.body.position.y += Math.sin((1 - k.anim.tagT) * Math.PI) * 0.3; m.root.rotation.y += (1 - k.anim.tagT) * TAU * 0.15; }
      m.bandana.visible = tayaNow;
      m.tayaTag.visible = tayaNow && !near;
      m.tayaTag.position.y = 2.02 + Math.sin(t * 4) * 0.05;
      m.tag.visible = !tayaNow && !(k.you && o.mode === 'play') && !near;
      m.ring.visible = (k.you && !fpNow) || tayaNow;
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
    // the can (hidden in the world while it's in your own hands)
    const c = g.can;
    canGroup.visible = !(fpNow && c.state === 'carried' && ta === me);
    canGroup.position.set(c.x, c.y + (c.tilt > 0.5 ? CAN.r : CAN.h / 2), c.z);
    const dir = Math.atan2(c.vx || 0.001, c.vz || 0.001);
    if (c.state === 'up' || c.state === 'carried') { canGroup.rotation.set(0, 0, 0); canMesh.rotation.set(0, 0, 0); }
    else { canGroup.rotation.set(0, dir, 0); canMesh.rotation.set(c.tilt, 0, 0); canMesh.rotateY(c.roll); }
    // the throw preview
    if (o.aim && o.preview > 0) {
      const p = predictThrow(me.x, me.z, o.aim.yaw, o.aim.power, c);
      const n = Math.max(2, Math.floor(p.path.length * o.preview));
      // in first person the arc starts at your eyes: skip the dots too close to see
      const skip = fpNow ? p.path.findIndex(([x, , z]) => Math.hypot(x - me.x, z - me.z) > 1.4) : 0;
      dots.count = 0;
      for (let k = Math.max(0, skip); k < n && dots.count < 60; k++) { const [x, y, z] = p.path[k]; dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar((1 - k / (n + 4)) * (fpNow ? 1 + Math.hypot(x - me.x, y - EYE, z - me.z) * 0.3 : 1)); dummy.updateMatrix(); dots.setMatrixAt(dots.count++, dummy.matrix); }
      dots.instanceMatrix.needsUpdate = true;
      dots.material.color.set(p.hit ? '#3fdc6a' : '#ffffff');
      landRing.visible = o.preview >= 1;
      landRing.position.set(p.land[0], 0.03, p.land[1]);
      landRing.material.color.set(p.hit ? '#3fdc6a' : '#ffffff');
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

    const shake = cam.shake > 0 && !o.reduced ? cam.shake : 0;
    cam.shake = Math.max(0, cam.shake - dt * 0.8);
    const fov = camera.aspect < 0.8 ? (fpNow ? 84 : 70) : fpNow ? 72 : 58;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (fpNow) {
      // first person: your eyes, bobbing as you run, ducking when you dive
      const run = clamp(me.speed / 5, 0, 1.2);
      let y = EYE + (o.reduced ? 0 : Math.abs(Math.sin(fpState.phase)) * 0.05 * run), pitch = o.camPitch || 0;
      if (me.dive > 0) { y = 0.6; pitch -= 0.2; } else if (me.recover > 0) y = 0.95;
      if (me.anim.tagT > 0) y -= Math.sin((1 - me.anim.tagT) * Math.PI) * 0.25;
      camera.position.set(me.x + (Math.random() - 0.5) * shake, y + (Math.random() - 0.5) * shake, me.z);
      camera.rotation.set(pitch, o.camYaw + Math.PI, 0);
      cam.pos.copy(camera.position);
      hands(g, me, o, dt, t);
    } else {
      if (o.mode === 'play' && me) {
        // the chase camera: behind you, turning toward the can unless you've turned it yourself
        if (o.camYaw !== undefined && o.camYaw !== null) cam.yaw = o.camYaw;
        const aiming = !!o.aim;
        const back = aiming ? 2.6 : 5.2, up = aiming ? 1.7 : 2.8, side = aiming ? 0.55 : 0;
        const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
        tmp.set(me.x - fx * back + fz * side, up, me.z - fz * back - fx * side);
        cam.pos.lerp(tmp, Math.min(1, dt * (aiming ? 10 : 5)));
        tmp.set(me.x + fx * (aiming ? 4 : 2.2), aiming ? 0.8 : 1.1, me.z + fz * (aiming ? 4 : 2.2));
        cam.look.lerp(tmp, Math.min(1, dt * 8));
      } else {
        // the menus: standing at the line, looking down the alley
        const over = o.mode === 'over';
        tmp.set(Math.sin(t * 0.07) * 1.4 + (over ? -2 : 0), over ? 2.2 : 1.7, over ? 4.5 : 12.5 + Math.sin(t * 0.05) * 0.6);
        cam.pos.lerp(tmp, Math.min(1, dt * 2));
        cam.look.lerp(tmp.set(Math.sin(t * 0.09) * 0.8, over ? 0.6 : 1.5, over ? 0 : -8), Math.min(1, dt * 2));
      }
      camera.position.copy(cam.pos);
      camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
      camera.lookAt(cam.look);
    }
    renderer.render(scene, camera);
  }

  // The yaw the camera should settle to: looking from you toward the can (or, as taya, toward the kids).
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

  const wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wires), 3));
  add(new THREE.LineSegments(wireGeo, wireM));
  mergeStatic(world);

  resize();
  return { frame, resize, event, basis, autoYaw, cam, renderer };
}

function lerpAngle(a, b, k) {
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * k;
}
