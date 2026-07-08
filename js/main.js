import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================
// HAZIR 3D MODELLERİ YÜKLEME (Kenney Food Kit - CC0 lisanslı)
// ============================================================
const gltfLoader = new GLTFLoader();

function loadModel(path) {
  return new Promise((resolve) => {
    gltfLoader.load(
      path,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => {
        console.warn('Model yüklenemedi, primitif şekle geri dönülecek:', path, err);
        resolve(null);
      }
    );
  });
}

// Yemek modelleri (createFoodMesh içinde kullanılacak)
const MODEL_PATHS = {
  'Hamburger': 'assets/models/burger-cheese.glb',
  'Pizza': 'assets/models/pizza.glb',
  'Patates Kızartması': 'assets/models/fries.glb',
  'İçecek': 'assets/models/soda-glass.glb',
  'Sosisli': 'assets/models/hot-dog.glb',
  'Sandviç': 'assets/models/sandwich.glb',
};

// Sos şişesi modelleri (tezgahtaki sabit şişeler + görsel referans)
const CONDIMENT_MODEL_PATHS = {
  ketchup: 'assets/models/bottle-ketchup.glb',
  mustard: 'assets/models/bottle-musterd.glb',
  mayo: 'assets/models/bottle-oil.glb', // mayonez modeli yok, yağ şişesini beyaza boyayıp kullanıyoruz
};

// Mutfak istasyonu / araç modelleri
const STATION_MODEL_PATHS = {
  grill: 'assets/models/Stove.glb',
  fryer: 'assets/models/Air_Fryer.glb',
  oven: 'assets/models/Oven.glb',
  drink: 'assets/models/Vending_Machine.glb',
  extinguisher: 'assets/models/Fire_Extinguisher.glb',
  repair: 'assets/models/Crowbar.glb',
};

const loadedModels = {};
const loadedCondimentModels = {};
const loadedStationModels = {};

// Yükleme ekranını göster
const loadingDiv = document.getElementById('loading-overlay');

await Promise.all([
  ...Object.entries(MODEL_PATHS).map(async ([key, path]) => {
    loadedModels[key] = await loadModel(path);
  }),
  ...Object.entries(CONDIMENT_MODEL_PATHS).map(async ([key, path]) => {
    loadedCondimentModels[key] = await loadModel(path);
  }),
  ...Object.entries(STATION_MODEL_PATHS).map(async ([key, path]) => {
    loadedStationModels[key] = await loadModel(path);
  }),
]);

if (loadingDiv) loadingDiv.style.display = 'none';

// ============================================================
// SES EFEKTLERİ (dosya indirmeye gerek yok, tarayıcıda anlık üretiliyor)
// ============================================================
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } else if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function beep(freq, duration, type = 'sine', volume = 0.2, delay = 0) {
  const ctx = ensureAudio();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const startTime = ctx.currentTime + delay;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playPickup() { beep(1100, 0.05, 'square', 0.12); }
function playStartCook() { beep(500, 0.08, 'triangle', 0.15); }
function playReady() { beep(880, 0.12, 'sine', 0.2); beep(1320, 0.16, 'sine', 0.18, 0.09); }
function playServeGood() { beep(660, 0.09, 'triangle', 0.22); beep(990, 0.14, 'triangle', 0.22, 0.08); beep(1320, 0.18, 'triangle', 0.2, 0.16); }
function playServeMeh() { beep(440, 0.14, 'sine', 0.18); }
function playBroken() { beep(180, 0.25, 'sawtooth', 0.2); }

function playSizzleBurst(duration = 0.35) {
  const ctx = ensureAudio();
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2800;
  const gain = ctx.createGain();
  gain.gain.value = 0.12;
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start();
}

// Yangın alarmı: istasyon başına döngüsel bip sesi
const activeAlarms = new Map();
function startAlarmSound(station) {
  if (activeAlarms.has(station)) return;
  const id = setInterval(() => beep(1000, 0.13, 'square', 0.16), 380);
  activeAlarms.set(station, id);
}
function stopAlarmSound(station) {
  const id = activeAlarms.get(station);
  if (id) { clearInterval(id); activeAlarms.delete(station); }
}

// ============================================================
// TEMEL SAHNE
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ecae6);
scene.fog = new THREE.Fog(0x8ecae6, 12, 26);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();

// ============================================================
// IŞIKLANDIRMA
// ============================================================
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x5a4632, 1.1);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xfff2d6, 1.8);
sunLight.position.set(6, 9, 4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -8;
sunLight.shadow.camera.right = 8;
sunLight.shadow.camera.top = 8;
sunLight.shadow.camera.bottom = -8;
sunLight.shadow.camera.far = 25;
scene.add(sunLight);

const kitchenLight = new THREE.PointLight(0xffcf8a, 1.2, 8, 2);
kitchenLight.position.set(0, 2.6, -3.5);
scene.add(kitchenLight);

// ============================================================
// OYUNCU RIG
// ============================================================
const playerRig = new THREE.Group();
playerRig.position.set(0, 0, 3);
scene.add(playerRig);
playerRig.add(camera);

// ============================================================
// ELDİVEN ELLER + TAŞINAN EŞYA YUVASI
// ============================================================
function createGloveHand() {
  const group = new THREE.Group();
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const cuffMat = new THREE.MeshStandardMaterial({ color: 0x2a6f97, roughness: 0.6 });

  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), gloveMat);
  palm.scale.set(1.15, 0.85, 1.4);
  palm.position.set(0, 0, -0.04);
  palm.castShadow = true;
  group.add(palm);

  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.045, 2, 6), gloveMat);
    finger.rotation.x = Math.PI / 2;
    finger.position.set(-0.03 + i * 0.02, 0.01, -0.09);
    finger.castShadow = true;
    group.add(finger);
  }

  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.035, 2, 6), gloveMat);
  thumb.rotation.z = Math.PI / 3;
  thumb.position.set(-0.045, 0.005, -0.04);
  group.add(thumb);

  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 12), cuffMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, 0, 0.03);
  group.add(cuff);

  const holdSlot = new THREE.Group();
  holdSlot.position.set(0, 0.02, -0.12);
  group.add(holdSlot);
  group.userData.holdSlot = holdSlot;

  return group;
}

const controller1 = renderer.xr.getController(0);
const controller2 = renderer.xr.getController(1);
const glove1 = createGloveHand();
const glove2 = createGloveHand();
controller1.add(glove1);
controller2.add(glove2);
playerRig.add(controller1);
playerRig.add(controller2);
controller1.userData.holdSlot = glove1.userData.holdSlot;
controller2.userData.holdSlot = glove2.userData.holdSlot;
controller1.userData.isSelecting = false;
controller2.userData.isSelecting = false;
controller1.userData.carrying = null;
controller2.userData.carrying = null;

// Not: Gerçek kontrolcü modeli (grip) bilinçli olarak eklenmiyor —
// sadece eldiven görünsün istiyoruz, kontrolcü cihazının kendisi görünmemeli.
const controllers = [controller1, controller2];

// ============================================================
// ZEMİNLER
// ============================================================
const shopGroup = new THREE.Group();
scene.add(shopGroup);

const floorCanvas = document.createElement('canvas');
floorCanvas.width = 128; floorCanvas.height = 128;
const fctx = floorCanvas.getContext('2d');
fctx.fillStyle = '#c99a5b';
fctx.fillRect(0, 0, 128, 128);
fctx.fillStyle = '#b8874a';
fctx.fillRect(0, 0, 64, 64);
fctx.fillRect(64, 64, 64, 64);
const floorTex = new THREE.CanvasTexture(floorCanvas);
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(7, 7);

// Tek parça iç mekan zemini (dışarı yok, hepsi tek küçük dükkan)
const shopFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })
);
shopFloor.rotation.x = -Math.PI / 2;
shopFloor.position.set(0, 0, -1);
shopFloor.receiveShadow = true;
shopGroup.add(shopFloor);

// Kapının hemen dışında görünen küçük bir eşik (müşterilerin belirdiği yer, dışarı hissi verir ama harita büyümez)
const doorstepFloor = new THREE.Mesh(
  new THREE.PlaneGeometry(2.2, 1.2),
  new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 1 })
);
doorstepFloor.rotation.x = -Math.PI / 2;
doorstepFloor.position.set(0, 0.001, 3.6);
doorstepFloor.receiveShadow = true;
scene.add(doorstepFloor);

// ============================================================
// DÜKKAN DUVARLARI + TEZGAH + ÇATI
// ============================================================
const wallMat = new THREE.MeshStandardMaterial({ color: 0xf3e0b8, roughness: 0.95 });
function makeWall(w, h, d, x, y, z) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  wall.position.set(x, y, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  shopGroup.add(wall);
  return wall;
}
makeWall(8, 3, 0.2, 0, 1.5, -5);   // arka duvar
makeWall(0.2, 3, 8, -4, 1.5, -1);  // sol duvar
makeWall(0.2, 3, 8, 4, 1.5, -1);   // sağ duvar

// Ön duvar - ortada kapı boşluğu bırakan iki parça (artık tamamen kapalı bir kutu, sadece kapıdan giriliyor)
makeWall(3.1, 3, 0.2, -2.45, 1.5, 3);
makeWall(3.1, 3, 0.2, 2.45, 1.5, 3);
makeWall(8, 0.9, 0.2, 0, 2.95, 3); // kapının üstündeki lento

// Tavan (artık kapalı bir iç mekan olduğu için üstü de kapatıyoruz)
const ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 1, side: THREE.DoubleSide })
);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.set(0, 3.4, -1);
shopGroup.add(ceiling);

const counterMat = new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.7 });
const counterTopMat = new THREE.MeshStandardMaterial({ color: 0x3d3d3d, roughness: 0.4 });
function makeCounterSegment(w, x) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, 0.4), counterMat);
  base.position.set(x, 0.45, 0.6);
  base.castShadow = true;
  base.receiveShadow = true;
  shopGroup.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 0.06, 0.45), counterTopMat);
  top.position.set(x, 0.93, 0.6);
  top.receiveShadow = true;
  shopGroup.add(top);
}
makeCounterSegment(2.6, -2.2);
makeCounterSegment(2.6, 2.2);

const roof = new THREE.Mesh(
  new THREE.BoxGeometry(8.2, 0.15, 3),
  new THREE.MeshStandardMaterial({ color: 0x9c2f2f, roughness: 0.8 })
);
roof.position.set(0, 3.05, -0.5);
roof.castShadow = true;
shopGroup.add(roof);

// Tabela
const signCanvas = document.createElement('canvas');
signCanvas.width = 512; signCanvas.height = 128;
const sctx = signCanvas.getContext('2d');
sctx.fillStyle = '#c0392b';
sctx.fillRect(0, 0, 512, 128);
sctx.fillStyle = '#ffffff';
sctx.font = 'bold 64px sans-serif';
sctx.textAlign = 'center';
sctx.textBaseline = 'middle';
sctx.fillText('USTAŞEF', 256, 64);
const signTex = new THREE.CanvasTexture(signCanvas);
const sign = new THREE.Mesh(
  new THREE.PlaneGeometry(2.4, 0.6),
  new THREE.MeshBasicMaterial({ map: signTex })
);
sign.position.set(0, 2.9, -4.89);
shopGroup.add(sign);

// --- Dekor: duvar posterleri + saksı bitkiler (dükkanı sıcak/dolu hissettirmek için) ---
function makePosterTexture(lines, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 340;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 340);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 236, 320);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? 'bold 30px sans-serif' : 'bold 22px sans-serif';
    ctx.fillText(line, 128, 90 + i * 45);
  });
  return new THREE.CanvasTexture(canvas);
}

const poster1 = new THREE.Mesh(
  new THREE.PlaneGeometry(0.8, 1.05),
  new THREE.MeshBasicMaterial({ map: makePosterTexture(['🍕', 'Taze', 'Pizza'], '#b5651d') })
);
poster1.position.set(-3.98, 1.8, -3.5);
poster1.rotation.y = Math.PI / 2;
shopGroup.add(poster1);

const poster2 = new THREE.Mesh(
  new THREE.PlaneGeometry(0.8, 1.05),
  new THREE.MeshBasicMaterial({ map: makePosterTexture(['🍔', 'Günün', 'Menüsü'], '#2a6f97') })
);
poster2.position.set(3.98, 1.8, -3.5);
poster2.rotation.y = -Math.PI / 2;
shopGroup.add(poster2);

function createPottedPlant(x, z) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.13, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: 0xa15c3e, roughness: 0.8 })
  );
  pot.position.y = 0.11;
  pot.castShadow = true;
  g.add(pot);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x3f7d40, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), foliageMat);
    leaf.position.set((Math.random() - 0.5) * 0.15, 0.3 + i * 0.14, (Math.random() - 0.5) * 0.15);
    leaf.scale.setScalar(0.9 - i * 0.12);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  shopGroup.add(g);
}
createPottedPlant(-3.7, -4.6);
createPottedPlant(3.7, -4.6);

// ============================================================
// SKOR HUD
// ============================================================
let score = 0;
let tips = 0;
let highScore = Number(localStorage.getItem('ustasef_highscore') || 0);

const hudCanvas = document.createElement('canvas');
hudCanvas.width = 512; hudCanvas.height = 150;
const hctx = hudCanvas.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudCanvas);
function drawHUD() {
  hctx.clearRect(0, 0, 512, 150);
  hctx.fillStyle = 'rgba(20,20,20,0.85)';
  roundRect(hctx, 4, 4, 504, 142, 20);
  hctx.fill();
  hctx.fillStyle = '#ffd166';
  hctx.font = 'bold 40px sans-serif';
  hctx.textAlign = 'center';
  hctx.textBaseline = 'middle';
  hctx.fillText(`Puan: ${score}   Bahsis: ${tips}TL`, 256, 55);
  hctx.font = 'bold 24px sans-serif';
  hctx.fillStyle = '#9ad1ff';
  hctx.fillText(`Rekor: ${highScore}`, 256, 105);
  hudTex.needsUpdate = true;
}
function checkHighScore() {
  if (score > highScore) {
    highScore = score;
    try { localStorage.setItem('ustasef_highscore', String(highScore)); } catch (e) { /* depolama kapalıysa sorun değil */ }
  }
}
drawHUD();
const hudPanel = new THREE.Mesh(
  new THREE.PlaneGeometry(1.6, 0.47),
  new THREE.MeshBasicMaterial({ map: hudTex, transparent: true })
);
hudPanel.position.set(0, 2.3, -4.85);
shopGroup.add(hudPanel);

// ============================================================
// METİN BALONU YARDIMCILARI
// ============================================================
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, cx, cy, maxWidth, lineHeight) {
  const words = text.split(' ');
  let lines = [];
  let current = '';
  for (const w of words) {
    const test = current ? current + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineHeight));
}

function makeTextSprite(text, opts = {}) {
  const canvas = document.createElement('canvas');
  const scaleFactor = 4;
  canvas.width = 256 * scaleFactor;
  canvas.height = 96 * scaleFactor;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.95)';
  roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 40);
  ctx.fill();
  ctx.strokeStyle = opts.border || '#333';
  ctx.lineWidth = 6;
  roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 40);
  ctx.stroke();

  ctx.fillStyle = opts.color || '#111';
  ctx.font = `bold ${34 * scaleFactor / 4}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  wrapText(ctx, text, canvas.width / 2, canvas.height / 2, canvas.width - 60, 40);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.9, 0.34, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function makeStatusSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.4, 0.4, 1);
  sprite.visible = false;
  sprite.userData.canvas = canvas;
  sprite.userData.ctx = canvas.getContext('2d');
  sprite.userData.tex = tex;
  return sprite;
}

function drawProgressRing(sprite, progress, color) {
  const ctx = sprite.userData.ctx;
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.arc(64, 64, 50, -Math.PI / 2, -Math.PI / 2 + Math.max(0, Math.min(1, progress)) * Math.PI * 2);
  ctx.stroke();
  sprite.userData.tex.needsUpdate = true;
  sprite.visible = true;
}

function drawIcon(sprite, label, bg) {
  const ctx = sprite.userData.ctx;
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 68);
  sprite.userData.tex.needsUpdate = true;
  sprite.visible = true;
}

// ============================================================
// YEMEK MODELLERİ
// ============================================================
const FOOD_MATS = {
  bunTop: new THREE.MeshStandardMaterial({ color: 0xd9a25c, roughness: 0.75 }),
  bunBottom: new THREE.MeshStandardMaterial({ color: 0xc98a45, roughness: 0.75 }),
  patty: new THREE.MeshStandardMaterial({ color: 0x5a3320, roughness: 0.8 }),
  cheese: new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.5 }),
  lettuce: new THREE.MeshStandardMaterial({ color: 0x6bbf59, roughness: 0.9 }),
  tomato: new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }),
  crust: new THREE.MeshStandardMaterial({ color: 0xe8c179, roughness: 0.8 }),
  sauce: new THREE.MeshStandardMaterial({ color: 0xa32f1f, roughness: 0.6 }),
  pepperoni: new THREE.MeshStandardMaterial({ color: 0x7a2020, roughness: 0.6 }),
  friesBox: new THREE.MeshStandardMaterial({ color: 0xd6273c, roughness: 0.7 }),
  fry: new THREE.MeshStandardMaterial({ color: 0xf3c94b, roughness: 0.55 }),
  cup: new THREE.MeshStandardMaterial({ color: 0x3a6ea5, roughness: 0.4 }),
  lid: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
  straw: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
};

function buildHamburger() {
  const g = new THREE.Group();
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.4), FOOD_MATS.bunBottom);
  bottom.rotation.x = Math.PI;
  bottom.position.y = 0.018;
  g.add(bottom);
  const patty = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.018, 14), FOOD_MATS.patty);
  patty.position.y = 0.033;
  g.add(patty);
  const cheese = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.09), FOOD_MATS.cheese);
  cheese.position.y = 0.045;
  cheese.rotation.y = Math.PI / 4;
  g.add(cheese);
  const lettuce = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.01, 10), FOOD_MATS.lettuce);
  lettuce.position.y = 0.052;
  g.add(lettuce);
  const tomato = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.008, 10), FOOD_MATS.tomato);
  tomato.position.y = 0.06;
  g.add(tomato);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), FOOD_MATS.bunTop);
  top.position.y = 0.065;
  g.add(top);
  g.userData.condimentSlot = 0.078;
  return g;
}

function buildPizza() {
  const g = new THREE.Group();
  const crust = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.078, 0.012, 20), FOOD_MATS.crust);
  g.add(crust);
  const sauce = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.004, 20), FOOD_MATS.sauce);
  sauce.position.y = 0.009;
  g.add(sauce);
  const cheeseTop = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.004, 20), FOOD_MATS.cheese);
  cheeseTop.position.y = 0.012;
  g.add(cheeseTop);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const r = 0.04;
    const pepperoni = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 10), FOOD_MATS.pepperoni);
    pepperoni.position.set(Math.cos(angle) * r, 0.016, Math.sin(angle) * r);
    g.add(pepperoni);
  }
  g.userData.condimentSlot = 0.02;
  return g;
}

function buildFries() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.07, 4), FOOD_MATS.friesBox);
  box.rotation.y = Math.PI / 4;
  box.position.y = 0.035;
  g.add(box);
  for (let i = 0; i < 7; i++) {
    const fry = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.07, 0.007), FOOD_MATS.fry);
    const angle = (Math.random() - 0.5) * 0.6;
    fry.position.set((Math.random() - 0.5) * 0.03, 0.08 + Math.random() * 0.015, (Math.random() - 0.5) * 0.03);
    fry.rotation.z = angle;
    fry.rotation.x = (Math.random() - 0.5) * 0.4;
    g.add(fry);
  }
  g.userData.condimentSlot = 0.1;
  return g;
}

function buildDrink() {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.09, 14), FOOD_MATS.cup);
  cup.position.y = 0.045;
  g.add(cup);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 14), FOOD_MATS.lid);
  lid.position.y = 0.094;
  g.add(lid);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 8), FOOD_MATS.straw);
  straw.position.set(0.008, 0.13, 0);
  straw.rotation.z = 0.15;
  g.add(straw);
  return g;
}

// --- Ara ürünler (yarı-mamül aşamalar için basit şekiller, hazır model yok) ---
function buildPatty() {
  const g = new THREE.Group();
  const patty = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 14), FOOD_MATS.patty);
  patty.position.y = 0.01;
  g.add(patty);
  return g;
}

function buildCookedSausage() {
  const g = new THREE.Group();
  const sausageMat = new THREE.MeshStandardMaterial({ color: 0x8a4a2f, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.11, 4, 8), sausageMat);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.02;
  g.add(body);
  return g;
}

function buildRawDough() {
  const g = new THREE.Group();
  const dough = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.078, 0.014, 20), FOOD_MATS.crust);
  g.add(dough);
  return g;
}

function buildEmptyCup() {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.09, 14), FOOD_MATS.cup);
  cup.position.y = 0.045;
  g.add(cup);
  return g;
}

function buildFilledCup() {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.09, 14), FOOD_MATS.cup);
  cup.position.y = 0.045;
  g.add(cup);
  const liquidMat = new THREE.MeshStandardMaterial({ color: 0x6a3d1f, roughness: 0.3 });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.075, 14), liquidMat);
  liquid.position.y = 0.05;
  g.add(liquid);
  return g;
}

// Modellerin oyun içinde kullanışlı boyuta gelmesi için ölçek çarpanları
// (Kenney modelleri farklı gerçek-dünya boyutlarında geliyor, burada dengeliyoruz)
const MODEL_SCALE = {
  'Hamburger': 0.09,
  'Pizza': 0.075,
  'Patates Kızartması': 0.085,
  'İçecek': 0.08,
  'Sosisli': 0.09,
  'Sandviç': 0.09,
};

function cloneModelAsFood(itemName) {
  const source = loadedModels[itemName];
  if (!source) return null;
  const clone = source.clone(true);
  const scale = MODEL_SCALE[itemName] || 0.1;
  clone.scale.setScalar(scale);

  // Zemine oturması için alt sınırı hesaplayıp yukarı kaydır
  const box = new THREE.Box3().setFromObject(clone);
  clone.position.y -= box.min.y;

  const topY = box.max.y - box.min.y;
  clone.userData.condimentSlot = topY + 0.005;
  clone.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return clone;
}

function createFoodMesh(itemName) {
  // Ara ürünler: hazır 3D modeli yok, basit şekillerle temsil ediliyor
  if (itemName === 'Köfte') return buildPatty();
  if (itemName === 'Pişmiş Sosis') return buildCookedSausage();
  if (itemName === 'Açılmış Hamur') return buildRawDough();
  if (itemName === 'Boş Bardak') return buildEmptyCup();
  if (itemName === 'Dolu Bardak') return buildFilledCup();

  const modelMesh = cloneModelAsFood(itemName);
  if (modelMesh) return modelMesh;

  // Model yüklenemediyse (ör. internet sorunu) eski primitif şekle geri dön
  let mesh;
  if (itemName === 'İçecek') mesh = buildDrink();
  else if (itemName === 'Pizza') mesh = buildPizza();
  else if (itemName === 'Hamburger') mesh = buildHamburger();
  else mesh = buildFries();
  mesh.traverse((obj) => { if (obj.isMesh) obj.castShadow = true; });
  return mesh;
}

// Ketçap/mayonez/hardal ile üstüne sos ekleme (sadece Hamburger üzerinde görsel efekt)
const CONDIMENT_COLORS = { ketchup: 0xd6272a, mustard: 0xf2c200, mayo: 0xf3ecd8 };
function addCondimentDrizzle(foodGroup, type) {
  if (!foodGroup || foodGroup.userData.condimentSlot === undefined) return;
  const drizzle = new THREE.Mesh(
    new THREE.TorusGeometry(0.03, 0.005, 6, 12),
    new THREE.MeshStandardMaterial({ color: CONDIMENT_COLORS[type], roughness: 0.35 })
  );
  drizzle.rotation.x = Math.PI / 2;
  drizzle.position.y = foodGroup.userData.condimentSlot + 0.003;
  drizzle.scale.setScalar(0.6 + Math.random() * 0.3);
  foodGroup.add(drizzle);
  foodGroup.userData.condimentSlot += 0.004;
}

// ============================================================
// MUTFAK İSTASYONLARI (etkileşimli)
// ============================================================
const COOK_TIME = 3.0;
const FIRE_CHANCE = 0.18;
const BREAK_CHANCE = 0.12;
const EXTINGUISH_HOLD = 1.4;
const REPAIR_HOLD = 1.8;
const INTERACT_RANGE = 1.35;

const stations = [];

function createStation(name, color, x, z, opts = {}) {
  const size = opts.size || [0.8, 0.9, 0.6];
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  let topHeight = size[1]; // etiket/durum ikonu bu yüksekliğin üstüne yerleşecek
  const modelSource = opts.modelKey ? loadedStationModels[opts.modelKey] : null;

  if (modelSource) {
    // Gerçek 3D model kullan (Kenney/Poly Pizza kaynaklı)
    const modelClone = modelSource.clone(true);
    const rawBox = new THREE.Box3().setFromObject(modelClone);
    const rawHeight = rawBox.max.y - rawBox.min.y || 1;
    const targetHeight = opts.modelHeight || size[1];
    const scale = targetHeight / rawHeight;
    modelClone.scale.setScalar(scale);

    const box = new THREE.Box3().setFromObject(modelClone);
    let baseY = -box.min.y;

    if (opts.pedestal) {
      const pedestalHeight = 0.35;
      const pedestal = new THREE.Mesh(
        new THREE.BoxGeometry(size[0] * 0.9, pedestalHeight, size[2] * 0.9),
        new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.2 })
      );
      pedestal.position.y = pedestalHeight / 2;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      group.add(pedestal);
      baseY += pedestalHeight;
    }

    modelClone.position.y = baseY;
    if (opts.modelRotationY) modelClone.rotation.y = opts.modelRotationY;

    modelClone.traverse((obj) => {
      if (obj.isMesh) { obj.castShadow = true; obj.receiveShadow = true; }
    });
    group.add(modelClone);
    topHeight = targetHeight + (opts.pedestal ? 0.35 : 0);

    // Zeminde ayırt edici renkli bir taban halkası (istasyonu tanımayı kolaylaştırır)
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(Math.max(size[0], size[2]) * 0.55, Math.max(size[0], size[2]) * 0.55, 0.015, 24),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.12 })
    );
    pad.position.y = 0.008;
    pad.receiveShadow = true;
    group.add(pad);
  } else {
    // Model yoksa/yüklenemediyse eski primitif kutu tasarımı
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25 })
    );
    body.position.y = size[1] / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.35, metalness: 0.5 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(size[0] * 0.7, size[1] * 0.55, 0.02), panelMat);
    panel.position.set(0, size[1] * 0.5, size[2] / 2 + 0.011);
    group.add(panel);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(size[0] * 1.01, 0.04, size[2] * 1.01),
      new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.4, emissive: color, emissiveIntensity: 0.15 })
    );
    stripe.position.y = size[1] * 0.12;
    group.add(stripe);

    const topAccent = new THREE.Mesh(
      new THREE.BoxGeometry(size[0] * 1.02, 0.03, size[2] * 1.02),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.4, metalness: 0.3 })
    );
    topAccent.position.y = size[1] + 0.015;
    group.add(topAccent);

    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const legPositions = [
      [-size[0] / 2 + 0.05, -size[2] / 2 + 0.05],
      [size[0] / 2 - 0.05, -size[2] / 2 + 0.05],
      [-size[0] / 2 + 0.05, size[2] / 2 - 0.05],
      [size[0] / 2 - 0.05, size[2] / 2 - 0.05],
    ];
    for (const [lx, lz] of legPositions) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.08, 8), legMat);
      leg.position.set(lx, 0.04, lz);
      leg.castShadow = true;
      group.add(leg);
    }
  }

  const labelSprite = makeTextSprite(name, { bg: 'rgba(0,0,0,0.6)', color: '#fff', border: '#000' });
  labelSprite.scale.set(0.5, 0.19, 1);
  labelSprite.position.set(0, topHeight + 0.35, 0);
  group.add(labelSprite);

  const statusSprite = makeStatusSprite();
  statusSprite.position.set(0, topHeight + 0.7, 0);
  group.add(statusSprite);

  group.userData = {
    stationName: name,
    type: opts.type,
    produces: opts.produces,
    state: 'idle',
    progress: 0,
    useCount: 0,
    statusSprite,
    holdTimer: 0,
    cookTime: opts.cookTime || COOK_TIME,
    requiresCarry: opts.requiresCarry || null,
  };

  shopGroup.add(group);
  stations.push(group);
  return group;
}

createStation('Izgara', 0x8b3a3a, -3, -4, { type: 'cook', produces: 'Köfte', modelKey: 'grill', modelHeight: 0.62 });
createStation('Fritöz', 0xd2691e, -1.5, -4, { type: 'cook', produces: 'Patates Kızartması', modelKey: 'fryer', modelHeight: 0.5, size: [0.8, 0.5, 0.6] });
const firinStation = createStation('Fırın (Pizza)', 0x5a3825, 0, -4, { type: 'cook', produces: 'Pizza', size: [0.9, 1.1, 0.7], modelKey: 'oven', modelHeight: 1.05, requiresCarry: 'Açılmış Hamur' });
const icecekMakinesi = createStation('İçecek Makinesi', 0x3a6ea5, 1.5, -4, { type: 'special', size: [0.7, 1.4, 0.6], modelKey: 'drink', modelHeight: 1.4 });
const hazirlikTezgahi = createStation('Hazırlık Tezgahı', 0x777777, 3, -4, { type: 'assemble', produces: 'Sandviç', size: [1.2, 0.9, 0.6], cookTime: 1.6 });
createStation('Sosis Standı', 0xb5651d, -1.5, -2.3, { type: 'cook', produces: 'Pişmiş Sosis', size: [0.65, 0.75, 0.5] });
createStation('Hamur Açma Tezgahı', 0xdaa06d, 1.1, -2.3, { type: 'assemble', produces: 'Açılmış Hamur', size: [0.7, 0.85, 0.55], cookTime: 1.2 });

const extinguisherStation = createStation('Yangın Tüpü', 0xcc0000, -3.6, -1, { type: 'tool', size: [0.25, 0.6, 0.25], modelKey: 'extinguisher', modelHeight: 0.4, pedestal: true });
const repairStation = createStation('Tamir Standı', 0x444444, 3.6, -1, { type: 'tool', size: [0.4, 0.6, 0.3], modelKey: 'repair', modelHeight: 0.35, modelRotationY: Math.PI / 4, pedestal: true });
extinguisherStation.userData.state = 'tool';
repairStation.userData.state = 'tool';

// Ketçap / Mayonez / Hardal standı (hazırlık tezgahının hemen yanında, sabit sos şişeleri)
const condimentStation = new THREE.Group();
condimentStation.position.set(3, 0, -3.3);
const condimentTable = new THREE.Mesh(
  new THREE.BoxGeometry(0.9, 0.75, 0.35),
  new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6 })
);
condimentTable.position.y = 0.375;
condimentTable.castShadow = true;
condimentTable.receiveShadow = true;
condimentStation.add(condimentTable);

const CONDIMENT_DEFS = [
  { key: 'ketchup', color: 0xd6272a, label: 'Ketçap', x: -0.28, tint: null },
  { key: 'mustard', color: 0xf2c200, label: 'Hardal', x: 0, tint: null },
  { key: 'mayo', color: 0xf3ecd8, label: 'Mayonez', x: 0.28, tint: 0xf5f0e6 }, // yağ şişesi modelini mayoneze benzet
];
const condimentBottles = [];
for (const def of CONDIMENT_DEFS) {
  const bottle = new THREE.Group();
  bottle.position.set(def.x, 0.75, 0);

  const modelSource = loadedCondimentModels[def.key];
  if (modelSource) {
    const modelClone = modelSource.clone(true);
    const rawBox = new THREE.Box3().setFromObject(modelClone);
    const rawHeight = rawBox.max.y - rawBox.min.y || 1;
    const targetHeight = 0.2; // gerçekçi şişe yüksekliği (~20 cm)
    modelClone.scale.setScalar(targetHeight / rawHeight);
    const box2 = new THREE.Box3().setFromObject(modelClone);
    modelClone.position.y -= box2.min.y;
    if (def.tint) {
      modelClone.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          obj.material = obj.material.clone();
          obj.material.color = new THREE.Color(def.tint);
        }
      });
    }
    modelClone.traverse((obj) => { if (obj.isMesh) obj.castShadow = true; });
    bottle.add(modelClone);
  } else {
    // Model yüklenemediyse eski primitif şişe
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.4 })
    );
    body.position.y = 0.08;
    body.castShadow = true;
    bottle.add(body);
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(0.02, 0.04, 10),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
    );
    cap.position.y = 0.18;
    bottle.add(cap);
  }

  const label = makeTextSprite(def.label, { bg: 'rgba(255,255,255,0.9)', color: '#111' });
  label.scale.set(0.28, 0.1, 1);
  label.position.set(0, 0.32, 0);
  bottle.add(label);
  bottle.userData = { condimentKey: def.key, worldPos: new THREE.Vector3() };
  condimentStation.add(bottle);
  condimentBottles.push(bottle);
}
shopGroup.add(condimentStation);

function attachFire(station) {
  if (station.userData.fireMesh) return;
  const fire = new THREE.Mesh(
    new THREE.ConeGeometry(0.15, 0.35, 8),
    new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.85 })
  );
  fire.position.set(0, 1.1, 0);
  station.add(fire);
  station.userData.fireMesh = fire;
  const fireLight = new THREE.PointLight(0xff5500, 1.5, 2.5, 2);
  fireLight.position.set(0, 1.2, 0);
  station.add(fireLight);
  station.userData.fireLight = fireLight;
  startAlarmSound(station);
}
function removeFire(station) {
  if (station.userData.fireMesh) {
    station.remove(station.userData.fireMesh);
    station.remove(station.userData.fireLight);
    station.userData.fireMesh = null;
    station.userData.fireLight = null;
  }
  stopAlarmSound(station);
}

// ============================================================
// MÜŞTERİ TİPLERİ (5 farklı görünüm + kendine özgü diyalog havuzu)
// ============================================================
const ORDER_ITEMS = ['Pizza', 'Hamburger', 'Patates Kızartması', 'İçecek', 'Sosisli', 'Sandviç'];

const CUSTOMER_TYPES = [
  {
    name: 'Aceleci Ofis Çalışanı',
    shirt: 0x264653, skin: 0xf1c27d, hair: 0x2b2b2b,
    lines: [
      'Çabuk olabilir miyiz, öğle molam bitiyor! {item} istiyorum.',
      'Bir {item}, hızlıca lütfen!',
      'Toplantıya geç kalıyorum, {item} verir misin?',
    ],
  },
  {
    name: 'Neşeli Öğrenci',
    shirt: 0xe9c46a, skin: 0xffddb0, hair: 0x6b4226,
    lines: [
      'Selam usta! Bir {item} alabilir miyim?',
      '{item} çok özledim, bir tane rica etsem?',
      'Arkadaşlarla buluşacağız, {item} lütfen!',
    ],
  },
  {
    name: 'Sakin Emekli',
    shirt: 0x8d99ae, skin: 0xe8b98a, hair: 0xcccccc,
    lines: [
      'Merhaba evladım, bir {item} rica edeceğim.',
      'Acelem yok, güzelce bir {item} hazırla yeter.',
      'Bugün canım {item} çekti de.',
    ],
  },
  {
    name: 'Sportmen Genç',
    shirt: 0x2a9d8f, skin: 0xc68642, hair: 0x1a1a1a,
    lines: [
      'Antrenmandan geliyorum, {item} lazım bana!',
      'Kaptan, bir {item} at şöyle!',
      'Enerjim bitti, {item} imdada yetişsin.',
    ],
  },
  {
    name: 'Meraklı Turist',
    shirt: 0xe76f51, skin: 0xffe0bd, hair: 0x4a3222,
    lines: [
      'Bir {item} istiyorum lütfen!',
      'Buranın ünlü {item}\'inden bir tane alabilir miyim?',
      'Tavsiyeniz {item} mi? Öyleyse onu deneyeyim!',
    ],
  },
];

const LEAVE_HAPPY_LINES = [
  'Teşekkürler, afiyet olsun bana!',
  'Harikaydı, tekrar gelirim!',
  'Eline sağlık usta!',
];
const LEAVE_ANGRY_LINES = [
  'Çok bekledim, vazgeçtim!',
  'Bu kadar sabrım yetmez...',
  'Başka yere gidiyorum!',
];
const LEAVE_WRONG_ITEM_LINES = [
  'Ben bunu istememiştim ama...',
  'Yanlış geldi galiba, neyse alayım.',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

class Customer {
  constructor(spawnPos, queuePos) {
    this.typeIndex = Math.floor(Math.random() * CUSTOMER_TYPES.length);
    this.type = CUSTOMER_TYPES[this.typeIndex];

    this.group = new THREE.Group();
    this.group.position.copy(spawnPos);
    this.queuePos = queuePos;
    this.state = 'walking_in';
    this.waitTime = 0;
    this.maxWait = 28;
    this.order = randomFrom(ORDER_ITEMS);
    this.walkT = Math.random() * 10;

    this.buildBody();
    this.showBubble(randomFrom(this.type.lines).replace('{item}', this.order));

    scene.add(this.group);
  }

  buildBody() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: this.type.shirt, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: this.type.skin, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: this.type.hair, roughness: 0.9 });

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), bodyMat);
    this.torso.position.y = 0.95;
    this.torso.castShadow = true;
    this.group.add(this.torso);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skinMat);
    this.head.position.y = 1.55;
    this.head.castShadow = true;
    this.group.add(this.head);

    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 1.6;
    this.group.add(hair);

    const armGeo = new THREE.CapsuleGeometry(0.05, 0.35, 2, 6);
    this.armL = new THREE.Mesh(armGeo, bodyMat);
    this.armL.position.set(-0.28, 1.0, 0);
    this.armR = this.armL.clone();
    this.armR.position.set(0.28, 1.0, 0);
    this.group.add(this.armL, this.armR);

    const legGeo = new THREE.CapsuleGeometry(0.07, 0.45, 2, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x2b2b40, roughness: 0.8 });
    this.legL = new THREE.Mesh(legGeo, legMat);
    this.legL.position.set(-0.1, 0.4, 0);
    this.legR = this.legL.clone();
    this.legR.position.set(0.1, 0.4, 0);
    this.group.add(this.legL, this.legR);

    this.orderIcon = createFoodMesh(this.order);
    this.orderIcon.position.set(0.3, 1.9, 0);
    this.orderIcon.scale.set(1.4, 1.4, 1.4);
    this.group.add(this.orderIcon);
  }

  showBubble(text) {
    if (this.bubble) this.group.remove(this.bubble);
    this.bubble = makeTextSprite(text);
    this.bubble.position.set(0, 2.05, 0);
    this.group.add(this.bubble);
  }

  update(dt) {
    this.walkT += dt;

    if (this.state === 'walking_in') {
      const dir = new THREE.Vector3().subVectors(this.queuePos, this.group.position);
      const dist = dir.length();
      if (dist > 0.05) {
        dir.normalize();
        this.group.position.addScaledVector(dir, Math.min(dist, dt * 1.1));
        this.group.lookAt(this.queuePos.x, this.group.position.y, this.queuePos.z);
        this.walkBob(true);
      } else {
        this.state = 'waiting';
      }
    } else if (this.state === 'waiting') {
      this.walkBob(false);
      this.waitTime += dt;
      if (this.waitTime > this.maxWait) {
        this.leave('angry');
      }
    } else if (this.state === 'leaving') {
      const exitPos = new THREE.Vector3(this.group.position.x, 0, 5.5);
      const dir = new THREE.Vector3().subVectors(exitPos, this.group.position);
      const dist = dir.length();
      if (dist > 0.1) {
        dir.normalize();
        this.group.position.addScaledVector(dir, dt * 1.3);
        this.group.lookAt(exitPos.x, this.group.position.y, exitPos.z);
        this.walkBob(true);
      } else {
        this.markForRemoval = true;
      }
    }
  }

  walkBob(active) {
    const t = this.walkT * 6;
    if (active) {
      this.group.position.y = Math.abs(Math.sin(t)) * 0.03;
      this.legL.rotation.x = Math.sin(t) * 0.5;
      this.legR.rotation.x = -Math.sin(t) * 0.5;
      this.armL.rotation.x = -Math.sin(t) * 0.4;
      this.armR.rotation.x = Math.sin(t) * 0.4;
    } else {
      const idle = Math.sin(this.walkT * 1.5) * 0.015;
      this.torso.position.y = 0.95 + idle;
      this.head.position.y = 1.55 + idle;
      this.legL.rotation.x = 0;
      this.legR.rotation.x = 0;
    }
  }

  serve(itemName) {
    if (this.state !== 'waiting') return false;
    const correct = itemName === this.order;
    if (correct) {
      score += 10;
      tips += Math.max(5, 20 - Math.floor(this.waitTime));
      this.showBubble(randomFrom(LEAVE_HAPPY_LINES));
      playServeGood();
    } else {
      score += 2;
      tips += 2;
      this.showBubble(randomFrom(LEAVE_WRONG_ITEM_LINES));
      playServeMeh();
    }
    checkHighScore();
    drawHUD();
    this.orderIcon.visible = false;
    this.state = 'leaving';
    return true;
  }

  leave(reason) {
    if (reason === 'angry') {
      this.showBubble(randomFrom(LEAVE_ANGRY_LINES));
    }
    this.state = 'leaving';
  }

  dispose() {
    scene.remove(this.group);
  }
}

const customers = [];
// Kuyruk noktaları artık kapının hemen içinde, tezgahın önünde (küçük iç mekana uygun)
// Tek seferde SADECE TEK müşteri: bir önceki tamamen ayrılmadan yenisi gelmez.
const QUEUE_SPOTS = [
  new THREE.Vector3(0, 0, 1.8),
];

for (let i = 0; i < QUEUE_SPOTS.length; i++) {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.3, 20),
    new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide })
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.copy(QUEUE_SPOTS[i]).setY(0.01);
  scene.add(marker);
}

let spawnCooldown = 3;
const SPAWN_INTERVAL = 2.5; // müşteri gidince yeni müşteri gelmeden önceki kısa bekleme

function trySpawnCustomer() {
  if (customers.length > 0) return; // önceki müşteri (servis edilene/gidene kadar) sahnede olduğu sürece yenisi gelmez
  const spawnPos = new THREE.Vector3(0, 0, 4.3);
  customers.push(new Customer(spawnPos, QUEUE_SPOTS[0]));
}

function getFrontCustomer() {
  return customers.find((c) => c.state === 'waiting');
}

// ============================================================
// İSTASYON ETKİLEŞİM MANTIĞI
// ============================================================
function distanceXZ(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function nearestStationTo(position, maxDist = INTERACT_RANGE) {
  let best = null, bestDist = Infinity;
  for (const st of stations) {
    const d = distanceXZ(position, st.position);
    if (d < maxDist && d < bestDist) { best = st; bestDist = d; }
  }
  return best;
}

function handleTriggerPress(controller) {
  const worldPos = new THREE.Vector3();
  controller.getWorldPosition(worldPos);
  const carrying = controller.userData.carrying;

  const station = nearestStationTo(worldPos);

  // --- Elde bir şey taşırken özel istasyon dönüşümleri ---
  if (carrying && station) {
    const data = station.userData;

    // Hazırlık Tezgahı: Köfte -> Hamburger, Pişmiş Sosis -> Sosisli (anlık birleştirme)
    if (station === hazirlikTezgahi) {
      if (carrying === 'Köfte') {
        giveCarry(controller, 'Hamburger');
        playReady();
        return;
      }
      if (carrying === 'Pişmiş Sosis') {
        giveCarry(controller, 'Sosisli');
        playReady();
        return;
      }
    }

    // Fırın: Açılmış Hamur getirip pişirmeyi başlatma
    if (station === firinStation && carrying === 'Açılmış Hamur' && data.state === 'idle') {
      clearCarry(controller);
      data.state = 'cooking';
      data.progress = 0;
      playStartCook();
      playSizzleBurst(0.4);
      return;
    }

    // İçecek Makinesi: Boş Bardak -> Dolu Bardak -> İçecek (kapak kapatma)
    if (station === icecekMakinesi) {
      if (carrying === 'Boş Bardak') {
        giveCarry(controller, 'Dolu Bardak');
        playSizzleBurst(0.2);
        return;
      }
      if (carrying === 'Dolu Bardak') {
        giveCarry(controller, 'İçecek');
        playPickup();
        return;
      }
    }
  }

  if (carrying) {
    // Sos şişesi kontrolü (ketçap/mayonez/hardal)
    const bottleWorldPos = new THREE.Vector3();
    for (const bottle of condimentBottles) {
      bottle.getWorldPosition(bottleWorldPos);
      if (distanceXZ(worldPos, bottleWorldPos) < 0.45 && Math.abs(worldPos.y - bottleWorldPos.y) < 0.5) {
        addCondimentDrizzle(controller.userData.carryMesh, bottle.userData.condimentKey);
        return;
      }
    }

    const front = getFrontCustomer();
    if (front) {
      const custDist = distanceXZ(worldPos, front.group.position);
      if (custDist < 2.2) {
        front.serve(carrying);
        clearCarry(controller);
        return;
      }
    }
    return;
  }

  // --- Eli boşken istasyon etkileşimleri ---
  if (!station) return;
  const data = station.userData;

  if (data.type === 'tool') return;

  // İçecek Makinesi: eli boşken her zaman yeni bardak verir (sınırsız kaynak)
  if (station === icecekMakinesi) {
    giveCarry(controller, 'Boş Bardak');
    playPickup();
    return;
  }

  // Belirli bir malzeme gerektiren istasyon (ör. Fırın) eli boşken çalışmaz
  if (data.state === 'idle') {
    if (data.requiresCarry) return;
    data.state = 'cooking';
    data.progress = 0;
    playStartCook();
    if (data.type === 'cook') playSizzleBurst(0.4);
  } else if (data.state === 'ready') {
    giveCarry(controller, data.produces);
    playPickup();
    data.state = 'idle';
    data.statusSprite.visible = false;
  }
}

function giveCarry(controller, itemName) {
  clearCarry(controller);
  const mesh = createFoodMesh(itemName);
  controller.userData.holdSlot.add(mesh);
  controller.userData.carrying = itemName;
  controller.userData.carryMesh = mesh;
}

function clearCarry(controller) {
  if (controller.userData.carryMesh) {
    controller.userData.holdSlot.remove(controller.userData.carryMesh);
    controller.userData.carryMesh = null;
  }
  controller.userData.carrying = null;
}

controllers.forEach((c) => {
  c.addEventListener('selectstart', () => {
    c.userData.isSelecting = true;
    handleTriggerPress(c);
  });
  c.addEventListener('selectend', () => {
    c.userData.isSelecting = false;
  });
});

function updateToolInteractions(dt) {
  let extinguishing = false;
  let repairing = false;

  for (const controller of controllers) {
    if (!controller.userData.isSelecting) continue;
    const worldPos = new THREE.Vector3();
    controller.getWorldPosition(worldPos);

    if (distanceXZ(worldPos, extinguisherStation.position) < INTERACT_RANGE + 0.3) {
      extinguishing = true;
    }
    if (distanceXZ(worldPos, repairStation.position) < INTERACT_RANGE + 0.3) {
      repairing = true;
    }
  }

  for (const st of stations) {
    const data = st.userData;
    if (data.state === 'fire') {
      if (extinguishing) {
        data.holdTimer += dt;
        drawProgressRing(data.statusSprite, 1 - data.holdTimer / EXTINGUISH_HOLD, '#3aa0ff');
        if (data.holdTimer >= EXTINGUISH_HOLD) {
          data.state = 'idle';
          data.holdTimer = 0;
          removeFire(st);
          data.statusSprite.visible = false;
        }
      } else {
        data.holdTimer = Math.max(0, data.holdTimer - dt * 0.5);
      }
    } else if (data.state === 'broken') {
      if (repairing) {
        data.holdTimer += dt;
        drawProgressRing(data.statusSprite, data.holdTimer / REPAIR_HOLD, '#8bd450');
        if (data.holdTimer >= REPAIR_HOLD) {
          data.state = 'idle';
          data.holdTimer = 0;
          data.statusSprite.visible = false;
        }
      } else {
        data.holdTimer = Math.max(0, data.holdTimer - dt * 0.5);
      }
    }
  }
}

function updateStations(dt) {
  for (const st of stations) {
    const data = st.userData;
    if (data.type === 'tool' || data.type === 'special') continue;

    if (data.state === 'cooking') {
      data.progress += dt / data.cookTime;
      drawProgressRing(data.statusSprite, data.progress, '#ffb703');
      if (data.progress >= 1) {
        data.useCount++;
        if (data.type === 'cook' && Math.random() < FIRE_CHANCE) {
          data.state = 'fire';
          data.holdTimer = 0;
          attachFire(st);
          drawIcon(data.statusSprite, 'YANGIN', '#ff5500');
        } else if (data.type === 'cook' && Math.random() < BREAK_CHANCE) {
          data.state = 'broken';
          data.holdTimer = 0;
          playBroken();
          drawIcon(data.statusSprite, 'ARIZA', '#555555');
        } else {
          data.state = 'ready';
          playReady();
          drawIcon(data.statusSprite, 'HAZIR', '#2a9d8f');
        }
      }
    }
  }
}

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// VR GİRİŞ
// ============================================================
document.getElementById('vr-button-container').appendChild(
  VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'bounded-floor'] })
);

// ============================================================
// RENDER LOOP
// ============================================================
// ============================================================
// LOKOMOSYON (kontrolcü joystick ile yürüme + snap-turn ile dönme)
// ============================================================
const MOVE_SPEED = 1.7; // metre/saniye
const SNAP_TURN_ANGLE = THREE.MathUtils.degToRad(30);
const snapTurnState = { ready: true };

function rotatePlayerAroundCamera(angle) {
  const camWorldPos = new THREE.Vector3();
  camera.getWorldPosition(camWorldPos);
  playerRig.position.sub(camWorldPos);
  playerRig.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
  playerRig.position.add(camWorldPos);
  playerRig.rotation.y += angle;
}

function updateLocomotion(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;

  for (const source of session.inputSources) {
    if (!source.gamepad || !source.handedness) continue;
    const axes = source.gamepad.axes;
    // Quest Touch kontrolcülerde thumbstick genelde axes[2]/axes[3], bazı tarayıcılarda axes[0]/axes[1]
    const x = Math.abs(axes[2] || 0) > Math.abs(axes[0] || 0) ? axes[2] : axes[0];
    const y = Math.abs(axes[3] || 0) > Math.abs(axes[1] || 0) ? axes[3] : axes[1];

    if (source.handedness === 'left') {
      if (Math.abs(x) > 0.15 || Math.abs(y) > 0.15) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
        playerRig.position.addScaledVector(forward, -y * MOVE_SPEED * dt);
        playerRig.position.addScaledVector(right, x * MOVE_SPEED * dt);
      }
    } else if (source.handedness === 'right') {
      if (Math.abs(x) < 0.3) snapTurnState.ready = true;
      if (snapTurnState.ready && Math.abs(x) > 0.6) {
        rotatePlayerAroundCamera(x > 0 ? -SNAP_TURN_ANGLE : SNAP_TURN_ANGLE);
        snapTurnState.ready = false;
      }
    }
  }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);

  updateLocomotion(dt);

  spawnCooldown -= dt;
  if (spawnCooldown <= 0) {
    trySpawnCustomer();
    spawnCooldown = SPAWN_INTERVAL;
  }

  for (let i = customers.length - 1; i >= 0; i--) {
    customers[i].update(dt);
    if (customers[i].markForRemoval) {
      customers[i].dispose();
      customers.splice(i, 1);
    }
  }

  updateStations(dt);
  updateToolInteractions(dt);

  const t = clock.elapsedTime;
  kitchenLight.intensity = 1.2 * (1 + Math.sin(t * 1.2) * 0.03);

  for (const st of stations) {
    if (st.userData.fireMesh) {
      st.userData.fireMesh.scale.setScalar(1 + Math.sin(t * 12) * 0.15);
    }
  }

  renderer.render(scene, camera);
});
