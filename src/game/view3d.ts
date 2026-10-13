import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Game, Kind } from "@/game/sim";
import { vehiclePos } from "@/game/sim";
import {
  BUILDINGS,
  LANDMARKS,
  PARKS,
  PETROL,
  ROADS,
  TREES,
  WORLD_H,
  WORLD_W,
  buildingsNear,
  laneYaw,
} from "@/game/world";

const S = 0.1;

const INK = 0x14110e;
const PAPER = 0xf3ead7;
const MAIZE = 0xe8a317;
const CLAY = 0xc4553a;
const FLAG = 0x1f7a4d;
const ASPHALT = 0x2a2622;
const SOIL = 0x6b5344;
const GRASS = 0x3d5c45;
const SKY = 0xe4d2b4;
const ZENITH = 0x6f8fa8;
const SUN_COL = 0xffb25c;

// Tune the look here. Bloom only catches values above `bloomThreshold`, so lit
// paper surfaces stay clean while lights (x4 HDR) glow.
const FX = {
  exposure: 1.0,
  bloomStrength: 0.55,
  bloomRadius: 0.5,
  bloomThreshold: 1.5,
  vignette: 0.45,
  fovBase: 68,
  fovKick: 14,
};

const GRADE_VERT = `varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GRADE_FRAG = `uniform sampler2D tDiffuse;
uniform float uTime; uniform float uHeat; uniform float uVig;
varying vec2 vUv;
void main(){
  vec4 c = texture2D(tDiffuse, vUv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  c.rgb *= mix(vec3(0.90, 1.0, 1.10), vec3(1.08, 1.0, 0.90), smoothstep(0.1, 1.2, l));
  vec2 d = vUv - 0.5; float r = dot(d, d);
  c.rgb *= 1.0 - smoothstep(0.12, 0.62, r) * uVig;
  vec3 heat = mix(vec3(1.0, 0.12, 0.08), vec3(0.1, 0.25, 1.0), step(0.0, sin(uTime * 9.0)));
  c.rgb += heat * smoothstep(0.1, 0.6, r) * uHeat * (0.35 + 0.25 * sin(uTime * 18.0));
  gl_FragColor = c;
}`;
const SKY_VERT = `varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = `uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol;
varying vec3 vDir;
void main(){
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
  float s = max(dot(normalize(vDir), uSunDir), 0.0);
  col += uSunCol * (pow(s, 8.0) * 0.35 + pow(s, 120.0) * 1.2);
  gl_FragColor = vec4(col, 1.0);
}`;

function wx(x: number) {
  return x * S;
}
function wz(y: number) {
  return y * S;
}

function unitBox() {
  return new THREE.BoxGeometry(1, 1, 1);
}

function windowTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#d9cbb6";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#1c1915";
  for (let y = 6; y < 64; y += 16) {
    for (let x = 5; x < 64; x += 14) g.fillRect(x, y, 8, 9);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function matatuTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#f3ead7";
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = "#e8a317";
  g.fillRect(0, 0, 64, 7);
  g.fillStyle = "#c4553a";
  g.fillRect(0, 7, 64, 4);
  g.fillStyle = "#1f7a4d";
  g.fillRect(0, 26, 64, 6);
  g.fillStyle = "#14110e";
  g.fillRect(8, 14, 16, 8);
  g.fillRect(40, 14, 16, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const CAR_COLORS = [PAPER, CLAY, FLAG, INK, MAIZE, 0x8d7a68, 0x4a453e];

export type View3d = {
  resize: (width: number, height: number, dpr: number) => void;
  render: (
    g: Game,
    dt: number,
    reduce: boolean,
    target: { x: number; y: number } | null,
  ) => void;
  paintMap: (ctx: CanvasRenderingContext2D, g: Game, w: number, h: number) => void;
  dispose: () => void;
};

export function createView(canvas: HTMLCanvasElement): View3d {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(SKY, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = FX.exposure;
  const lowEnd =
    typeof navigator !== "undefined" &&
    ((navigator.hardwareConcurrency ?? 8) <= 4 || Math.min(window.innerWidth, window.innerHeight) < 420);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY, 70, 380);
  const sunDir = new THREE.Vector3(-60, 34, -35).normalize();
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(ZENITH) },
      uHorizon: { value: new THREE.Color(SKY) },
      uSunDir: { value: sunDir },
      uSunCol: { value: new THREE.Color(SUN_COL) },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyGeo = new THREE.SphereGeometry(500, 24, 12);
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.renderOrder = -1;
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  const camera = new THREE.PerspectiveCamera(FX.fovBase, 1, 0.2, 800);
  camera.position.set(wx(3200), 40, wz(3600));

  const hemi = new THREE.HemisphereLight(0xcfd9e6, SOIL, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc489, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -55;
  sc.right = 55;
  sc.top = 55;
  sc.bottom = -55;
  sc.near = 1;
  sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const track = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g);
    return g;
  };
  const trackM = <T extends THREE.Material>(m: T) => {
    mats.push(m);
    return m;
  };

  const ground = new THREE.Mesh(
    track(new THREE.PlaneGeometry(wx(WORLD_W) + 80, wz(WORLD_H) + 80)),
    trackM(new THREE.MeshLambertMaterial({ color: SOIL })),
  );
  ground.receiveShadow = true;
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(wx(WORLD_W / 2), 0, wz(WORLD_H / 2));
  scene.add(ground);

  const grassMat = trackM(new THREE.MeshLambertMaterial({ color: GRASS }));
  for (const park of PARKS) {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(wx(park.w), 0.08, wz(park.h))), grassMat);
    mesh.position.set(wx(park.x + park.w / 2), 0.04, wz(park.y + park.h / 2));
    scene.add(mesh);
  }

  const roadMat = trackM(new THREE.MeshLambertMaterial({ color: ASPHALT }));
  const lineMat = trackM(new THREE.MeshBasicMaterial({ color: MAIZE }));
  ROADS.forEach((road, i) => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(wx(road.w), 0.06, wz(road.h))), roadMat);
    mesh.receiveShadow = true;
    mesh.position.set(wx(road.x + road.w / 2), 0.06 + i * 0.001, wz(road.y + road.h / 2));
    scene.add(mesh);
    const vertical = road.axis === "v";
    const line = new THREE.Mesh(
      track(new THREE.BoxGeometry(vertical ? 0.18 : wx(road.w), 0.02, vertical ? wz(road.h) : 0.18)),
      lineMat,
    );
    line.position.set(wx(road.x + road.w / 2), 0.11, wz(road.y + road.h / 2));
    scene.add(line);
  });

  const win = windowTexture();
  const bldMat = trackM(
    new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map: win ?? undefined,
    }),
  );
  const bld = new THREE.InstancedMesh(track(unitBox()), bldMat, Math.max(1, BUILDINGS.length));
  bld.frustumCulled = false;
  bld.castShadow = true;
  bld.receiveShadow = true;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const district = [0xd9cbb6, 0xc4553a, 0x8d7a68, 0xe8a317, 0xf3ead7, 0x4a453e];
  BUILDINGS.forEach((b, i) => {
    const height = 7 + b.tall * 8 + (b.style === 0 ? 16 : 2);
    dummy.position.set(wx(b.x + b.w / 2), height / 2, wz(b.y + b.h / 2));
    dummy.scale.set(Math.max(0.6, wx(b.w)), height, Math.max(0.6, wz(b.h)));
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bld.setMatrixAt(i, dummy.matrix);
    tint.setHex(district[b.style % district.length] ?? PAPER);
    bld.setColorAt(i, tint);
  });
  if (BUILDINGS.length === 0) bld.count = 0;
  bld.instanceMatrix.needsUpdate = true;
  if (bld.instanceColor) bld.instanceColor.needsUpdate = true;
  scene.add(bld);

  const treeMat = trackM(new THREE.MeshLambertMaterial({ color: 0x2c4a34 }));
  const acaciaMat = trackM(new THREE.MeshLambertMaterial({ color: 0x6b7a3a }));
  const trunkMat = trackM(new THREE.MeshLambertMaterial({ color: 0x4a3828 }));
  const cones = new THREE.InstancedMesh(track(new THREE.ConeGeometry(1, 1, 6)), treeMat, Math.max(1, TREES.length));
  const acacias = new THREE.InstancedMesh(track(new THREE.ConeGeometry(1, 1, 6)), acaciaMat, Math.max(1, TREES.length));
  const trunks = new THREE.InstancedMesh(track(unitBox()), trunkMat, Math.max(1, TREES.length));
  cones.castShadow = true;
  acacias.castShadow = true;
  cones.frustumCulled = false;
  acacias.frustumCulled = false;
  trunks.frustumCulled = false;
  let ni = 0;
  let ai = 0;
  let ti = 0;
  TREES.forEach((tree) => {
    const mesh = tree.acacia ? acacias : cones;
    const index = tree.acacia ? ai++ : ni++;
    const height = tree.acacia ? 3.2 : 5.5;
    const radius = tree.acacia ? 4.2 : 1.8;
    dummy.position.set(wx(tree.x), 1.1 + height / 2, wz(tree.y));
    dummy.scale.set(radius, height, radius);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    dummy.position.set(wx(tree.x), 0.7, wz(tree.y));
    dummy.scale.set(0.25, 1.4, 0.25);
    dummy.updateMatrix();
    trunks.setMatrixAt(ti++, dummy.matrix);
  });
  cones.count = ni;
  acacias.count = ai;
  trunks.count = TREES.length;
  cones.instanceMatrix.needsUpdate = true;
  acacias.instanceMatrix.needsUpdate = true;
  trunks.instanceMatrix.needsUpdate = true;
  scene.add(cones, acacias, trunks);

  const canopyMat = trackM(new THREE.MeshLambertMaterial({ color: MAIZE }));
  const pumpMat = trackM(new THREE.MeshLambertMaterial({ color: INK }));
  for (const pump of PETROL) {
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(7, 0.25, 4.5)), canopyMat);
    roof.position.set(wx(pump.drawX), 3.1, wz(pump.drawY));
    const post = new THREE.Mesh(track(unitBox()), pumpMat);
    post.position.set(wx(pump.drawX), 1.5, wz(pump.drawY));
    post.scale.set(0.35, 3, 0.35);
    scene.add(roof, post);
  }

  const markMat = trackM(new THREE.MeshLambertMaterial({ color: PAPER }));
  for (const mark of LANDMARKS) {
    const h = mark.kind === "tower" ? 36 : mark.kind === "airport" ? 8 : mark.kind === "strip" ? 3 : mark.kind === "kicc" ? 18 : 12;
    const mesh = new THREE.Mesh(track(unitBox()), markMat);
    mesh.position.set(wx(mark.drawX), h / 2, wz(mark.drawY));
    const wide = mark.kind === "airport" ? 28 : mark.kind === "strip" ? 18 : mark.kind === "kicc" ? 10 : 7;
    const deep = mark.kind === "airport" ? 14 : mark.kind === "strip" ? 6 : 7;
    mesh.scale.set(wide, h, deep);
    scene.add(mesh);
  }

  const sizes: Record<Kind, [number, number, number]> = {
    matatu: [2.4, 2.3, 6.4],
    car: [1.8, 1.4, 4.2],
    truck: [2.5, 2.8, 8],
    boda: [0.7, 1.3, 2.1],
  };
  const traffic: { kind: Kind; mesh: THREE.InstancedMesh; ids: number[] }[] = [];
  let trafficReady = false;
  let tails: THREE.InstancedMesh | null = null;
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  tailMat.color.setHex(0xff2a1a).multiplyScalar(4);
  mats.push(tailMat);

  function ensureTraffic(g: Game) {
    if (trafficReady) return;
    trafficReady = true;
    tails = new THREE.InstancedMesh(track(unitBox()), tailMat, Math.max(2, g.vehicles.length * 2));
    tails.frustumCulled = false;
    scene.add(tails);
    const ids: Record<Kind, number[]> = { matatu: [], car: [], boda: [], truck: [] };
    g.vehicles.forEach((v, i) => ids[v.kind].push(i));
    const stripe = matatuTexture();
    (Object.keys(ids) as Kind[]).forEach((kind) => {
      const list = ids[kind];
      const mat =
        kind === "matatu"
          ? trackM(new THREE.MeshLambertMaterial({ color: 0xffffff, map: stripe ?? undefined }))
          : trackM(new THREE.MeshLambertMaterial({ color: 0xffffff }));
      const mesh = new THREE.InstancedMesh(track(unitBox()), mat, Math.max(1, list.length));
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      if (list.length === 0) mesh.count = 0;
      list.forEach((id, n) => {
        const color = CAR_COLORS[(id * 3) % CAR_COLORS.length] ?? PAPER;
        mesh.setColorAt(n, tint.setHex(kind === "truck" ? 0x4a3828 : color));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      traffic.push({ kind, mesh, ids: list });
    });
  }

  function makeVan(lightColor: number) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      track(new THREE.BoxGeometry(2.1, 1.6, 4.6)),
      trackM(new THREE.MeshLambertMaterial({ color: PAPER })),
    );
    body.position.y = 1.15;
    const bar = new THREE.Mesh(
      track(new THREE.BoxGeometry(1.6, 0.22, 0.4)),
      trackM(new THREE.MeshBasicMaterial({ color: lightColor })),
    );
    bar.position.set(0, 2.05, -0.4);
    group.add(body, bar);
    body.castShadow = true;
    group.visible = false;
    scene.add(group);
    return { group, bar };
  }
  const cops = [0, 1, 2, 3, 4].map((i) => makeVan(i % 2 === 0 ? CLAY : MAIZE));

  const heli = new THREE.Group();
  const cabin = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 0.7, 2.6)), trackM(new THREE.MeshLambertMaterial({ color: PAPER })));
  cabin.position.y = 0.4;
  const tail = new THREE.Mesh(track(new THREE.BoxGeometry(0.22, 0.16, 1.7)), trackM(new THREE.MeshLambertMaterial({ color: INK })));
  tail.position.set(0, 0.55, 1.7);
  const tailRotor = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.7, 0.08)), trackM(new THREE.MeshLambertMaterial({ color: INK })));
  tailRotor.position.set(0.12, 0.55, 2.45);
  const rotor = new THREE.Mesh(track(new THREE.BoxGeometry(4.4, 0.05, 0.18)), trackM(new THREE.MeshLambertMaterial({ color: INK })));
  rotor.position.y = 0.9;
  const heliBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.5, 0.12, 0.2)), trackM(new THREE.MeshBasicMaterial({ color: CLAY })));
  heliBar.position.set(0, 0.85, -0.6);
  heli.add(cabin, tail, tailRotor, rotor, heliBar);
  heli.visible = false;
  scene.add(heli);

  const bike = new THREE.Group();
  const bikeMat = trackM(new THREE.MeshLambertMaterial({ color: MAIZE }));
  const deck = new THREE.Mesh(track(new THREE.BoxGeometry(0.42, 0.28, 1.35)), bikeMat);
  deck.position.set(0, 0.62, 0.12);
  const tank = new THREE.Mesh(track(new THREE.BoxGeometry(0.28, 0.22, 0.46)), bikeMat);
  tank.position.set(0, 0.78, -0.18);
  const wheelGeo = track(new THREE.CylinderGeometry(0.36, 0.36, 0.14, 12));
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = trackM(new THREE.MeshLambertMaterial({ color: 0x1a1814 }));
  const fork = new THREE.Group();
  fork.position.set(0, 0.55, -0.78);
  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.position.set(0, -0.18, 0);
  const bars = new THREE.Mesh(track(new THREE.BoxGeometry(0.62, 0.05, 0.08)), trackM(new THREE.MeshLambertMaterial({ color: INK })));
  bars.position.set(0, 0.42, 0.02);
  fork.add(frontWheel, bars);
  const backWheel = new THREE.Mesh(wheelGeo, wheelMat);
  backWheel.position.set(0, 0.36, 0.72);
  const cloth = trackM(new THREE.MeshLambertMaterial({ color: 0x24352c }));
  const riderRig = new THREE.Group();
  riderRig.position.set(0, 0.82, 0.12);
  const torso = new THREE.Mesh(track(new THREE.BoxGeometry(0.38, 0.48, 0.26)), cloth);
  torso.position.set(0, 0.28, 0);
  const helmetMat = trackM(new THREE.MeshLambertMaterial({ color: MAIZE }));
  const helmet = new THREE.Mesh(track(new THREE.SphereGeometry(0.18, 10, 8)), helmetMat);
  helmet.position.set(0, 0.62, -0.02);
  const armGeo = track(new THREE.BoxGeometry(0.1, 0.34, 0.1));
  const armL = new THREE.Mesh(armGeo, cloth);
  armL.position.set(-0.22, 0.34, -0.16);
  armL.rotation.z = 0.5;
  armL.rotation.x = 0.8;
  const armR = new THREE.Mesh(armGeo, cloth);
  armR.position.set(0.22, 0.34, -0.16);
  armR.rotation.z = -0.5;
  armR.rotation.x = 0.8;
  riderRig.add(torso, helmet, armL, armR);
  bike.add(deck, tank, fork, backWheel, riderRig);
  bike.rotation.order = "YXZ";
  bike.scale.setScalar(1.45);
  bike.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  scene.add(bike);

  const head = new THREE.SpotLight(0xfff1d0, 0, 28, 0.55, 0.4, 1.2);
  head.position.set(0, 1.1, 0.4);
  head.target.position.set(0, 0.6, 4);
  bike.add(head, head.target);

  const rainCount = 420;
  const rainGeo = track(new THREE.BufferGeometry());
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 40;
    rainPos[i * 3 + 1] = Math.random() * 18;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rainMat = trackM(new THREE.PointsMaterial({ color: 0xc8d4e0, size: 0.08, transparent: true, opacity: 0.55, depthWrite: false }));
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.visible = false;
  scene.add(rain);

  const blob = new THREE.Mesh(
    track(new THREE.CircleGeometry(1.1, 14)),
    trackM(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false })),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  scene.add(blob);

  const beacon = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.35, 0.35, 16, 8)),
    trackM(new THREE.MeshBasicMaterial({ color: MAIZE, transparent: true, opacity: 0.85 })),
  );
  beacon.visible = false;
  scene.add(beacon);

  const target0 = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: lowEnd ? 0 : 4,
  });
  const composer = new EffectComposer(renderer, target0);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(256, 256),
    FX.bloomStrength,
    FX.bloomRadius,
    FX.bloomThreshold,
  );
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uHeat: { value: 0 },
      uVig: { value: FX.vignette },
    },
    vertexShader: GRADE_VERT,
    fragmentShader: GRADE_FRAG,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  let heat = 0;
  const dayTop = new THREE.Color(ZENITH);
  const dayHor = new THREE.Color(SKY);
  const nightTop = new THREE.Color(0x1a2433);
  const nightHor = new THREE.Color(0x2a2018);
  const duskTop = new THREE.Color(0x6a4a3a);
  const duskHor = new THREE.Color(0xe8a070);

  const desired = new THREE.Vector3();
  const look = new THREE.Vector3();
  const gaze = new THREE.Vector3();
  let snapped = true;
  let lastPhase: Game["phase"] | "" = "";
  let roll = 0;
  let pitch = 0;
  let prevYaw = 0;
  let prevSpeed = 0;
  let rideTime = 0;
  let calm = false;

  function placeVehicle(mesh: THREE.InstancedMesh, index: number, x: number, z: number, yaw: number, size: [number, number, number]) {
    dummy.position.set(x, size[1] / 2 + (calm ? 0 : Math.abs(Math.sin(rideTime * 10 + index)) * 0.05), z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(size[0], size[1], size[2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  return {
    resize(width, height, dpr) {
      renderer.setPixelRatio(Math.min(1.5, dpr));
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      composer.setPixelRatio(Math.min(1.5, dpr));
      composer.setSize(Math.max(1, width), Math.max(1, height));
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    render(g, dt, reduce, target) {
      ensureTraffic(g);
      rideTime = g.time;
      calm = reduce;
      const fx = -Math.sin(g.yaw);
      const fz = -Math.cos(g.yaw);
      bike.position.set(wx(g.x), 0, wz(g.y));
      const yawDelta = Math.atan2(Math.sin(g.yaw - prevYaw), Math.cos(g.yaw - prevYaw));
      prevYaw = g.yaw;
      const speed01 = Math.min(1, Math.abs(g.speed) / 270);
      const wantRoll = reduce ? 0 : Math.max(-0.32, Math.min(0.32, -yawDelta * 7));
      roll += (wantRoll - roll) * 0.25;
      const accel = g.speed - prevSpeed;
      prevSpeed = g.speed;
      const wantPitch = reduce ? 0 : Math.max(-0.1, Math.min(0.16, -accel * 0.0035));
      pitch += (wantPitch - pitch) * 0.18;
      const bob = reduce ? 0 : Math.sin(g.time * (6 + speed01 * 20)) * 0.025 * speed01;
      bike.position.y = bob;
      bike.rotation.y = g.yaw;
      bike.rotation.z = roll;
      bike.rotation.x = pitch;
      fork.rotation.y = Math.max(-0.4, Math.min(0.4, -roll * 1.6));
      riderRig.rotation.x = 0.28 + speed01 * 0.32;
      riderRig.position.y = 0.82 + bob * 0.4;
      const spin = g.speed * S * dt * 1.6;
      frontWheel.rotation.x += spin;
      backWheel.rotation.x += spin;
      cloth.color.setHex(g.carried ? FLAG : 0x24352c);
      blob.position.set(wx(g.x), 0.04, wz(g.y));

      for (const bucket of traffic) {
        const size = sizes[bucket.kind];
        bucket.ids.forEach((id, n) => {
          const v = g.vehicles[id];
          if (!v) return;
          const p = vehiclePos(v);
          const yaw = laneYaw(p.lane.axis, p.lane.dir);
          placeVehicle(bucket.mesh, n, wx(p.x), wz(p.y), yaw, size);
          if (tails) {
            const sn = Math.sin(yaw);
            const cs = Math.cos(yaw);
            for (let side = 0; side < 2; side++) {
              const lx = (side === 0 ? -1 : 1) * size[0] * 0.32;
              const lz = size[2] / 2 + 0.03;
              dummy.position.set(wx(p.x) + lx * cs + lz * sn, size[1] * 0.45, wz(p.y) - lx * sn + lz * cs);
              dummy.rotation.set(0, yaw, 0);
              dummy.scale.set(0.34, 0.22, 0.12);
              dummy.updateMatrix();
              tails.setMatrixAt(id * 2 + side, dummy.matrix);
            }
          }
        });
        bucket.mesh.instanceMatrix.needsUpdate = true;
      }
      if (tails) tails.instanceMatrix.needsUpdate = true;

      const flash = Math.sin(g.time * 14) > 0 ? CLAY : MAIZE;
      cops.forEach((cop, i) => {
        const src = g.cops[i];
        cop.group.visible = Boolean(src) && g.phase !== "title";
        if (!src) return;
        cop.group.position.set(wx(src.x), Math.abs(Math.sin(g.time * 16 + i)) * 0.05, wz(src.y));
        cop.group.rotation.order = "YXZ";
        cop.group.rotation.y = src.yaw;
        cop.group.rotation.z = Math.sin(g.time * 3 + i) * 0.04;
        (cop.bar.material as THREE.MeshBasicMaterial).color.setHex(flash).multiplyScalar(4);
      });

      if (g.heli && g.phase === "play") {
        heli.visible = true;
        heli.position.set(wx(g.heli.x), 16, wz(g.heli.y));
        heli.rotation.y = g.heli.yaw;
        rotor.rotation.y += dt * 24;
        tailRotor.rotation.x += dt * 32;
        (heliBar.material as THREE.MeshBasicMaterial).color.setHex(flash).multiplyScalar(4);
      } else {
        heli.visible = false;
      }

      if (target && g.phase === "play" && Math.hypot(target.x - g.x, target.y - g.y) > 30) {
        beacon.visible = true;
        beacon.position.set(wx(target.x), 8, wz(target.y));
        (beacon.material as THREE.MeshBasicMaterial).color
          .setHex(g.stars > 0 ? CLAY : g.carried ? FLAG : MAIZE)
          .multiplyScalar(2.5);
      } else {
        beacon.visible = false;
      }

      if (g.phase !== lastPhase) {
        lastPhase = g.phase;
        snapped = true;
      }

      if (g.phase === "title") {
        desired.set(wx(g.camX) + 18, 42, wz(g.camY) + 28);
        look.set(wx(g.camX), 4, wz(g.camY));
      } else {
        let camX = wx(g.x) - fx * 7.4;
        let camZ = wz(g.y) - fz * 7.4;
        let camY = 3.5 + Math.min(1.8, Math.abs(g.speed) * 0.003);
        const back = 120;
        const near = buildingsNear(g.x - fx * back, g.y - fz * back, 70);
        for (const b of near) {
          const px = g.x - fx * back;
          const pz = g.y - fz * back;
          if (px > b.x && px < b.x + b.w && pz > b.y && pz < b.y + b.h) camY = Math.max(camY, 16);
        }
        if (!reduce && g.shake > 0.4) {
          camX += (Math.random() - 0.5) * g.shake * 0.03;
          camY += (Math.random() - 0.5) * g.shake * 0.02;
        }
        desired.set(camX, camY, camZ);
        look.set(wx(g.x) + fx * 9, 1.1, wz(g.y) + fz * 9);
      }

      const k = snapped || reduce ? 1 : 1 - Math.exp(-3.2 * Math.max(0.001, dt));
      camera.position.lerp(desired, k);
      gaze.lerp(look, k);
      camera.lookAt(gaze);
      snapped = false;

      const playing = g.phase === "play";
      const wantFov =
        reduce || !playing ? FX.fovBase : FX.fovBase + speed01 * FX.fovKick + Math.min(6, g.shake * 0.4);
      camera.fov += (wantFov - camera.fov) * 0.1;
      camera.updateProjectionMatrix();

      skyDome.position.copy(camera.position);
      sun.target.position.set(Math.round(bike.position.x / 2) * 2, 0, Math.round(bike.position.z / 2) * 2);
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 120);

      const day = g.day ?? 0.72;
      const night = day < 0.22 || day > 0.78;
      const dusk = (day > 0.68 && day < 0.82) || (day > 0.18 && day < 0.28);
      const sunAmt = night ? 0.12 : dusk ? 0.55 : 1;
      sun.intensity = 1.9 * sunAmt * (1 - (g.rain ?? 0) * 0.45);
      hemi.intensity = 0.55 * (night ? 0.35 : 1);
      const top = night ? nightTop : dusk ? duskTop : dayTop;
      const hor = night ? nightHor : dusk ? duskHor : dayHor;
      (skyMat.uniforms.uTop.value as THREE.Color).lerp(top, 0.08);
      (skyMat.uniforms.uHorizon.value as THREE.Color).lerp(hor, 0.08);
      head.intensity = night ? 2.4 : dusk ? 0.6 : 0;
      const wet = (g.rain ?? 0) > 0.2;
      rain.visible = wet && !reduce;
      if (wet) {
        rain.position.copy(camera.position);
        const arr = rainGeo.attributes.position.array as Float32Array;
        for (let i = 1; i < arr.length; i += 3) {
          arr[i] -= 18 * dt;
          if (arr[i] < 0) arr[i] = 18;
        }
        rainGeo.attributes.position.needsUpdate = true;
      }

      const wantHeat = playing && g.stars >= 2 && !reduce ? Math.min(1, (g.stars - 1) / 3) : 0;
      heat += (wantHeat - heat) * 0.08;
      grade.uniforms.uHeat.value = heat;
      grade.uniforms.uTime.value = g.time;
      bloom.strength = FX.bloomStrength + speed01 * 0.15;
      composer.render(dt);
    },
    paintMap(ctx, g, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(20,17,14,0.78)";
      ctx.fillRect(0, 0, w, h);
      const sx = (w - 10) / WORLD_W;
      const sy = (h - 10) / WORLD_H;
      ctx.strokeStyle = "rgba(243,234,215,0.45)";
      ctx.lineWidth = 2;
      for (const road of ROADS) {
        ctx.strokeRect(5 + road.x * sx, 5 + road.y * sy, Math.max(2, road.w * sx), Math.max(2, road.h * sy));
      }
      ctx.fillStyle = "#3d5c45";
      for (const park of PARKS) ctx.fillRect(5 + park.x * sx, 5 + park.y * sy, park.w * sx, park.h * sy);
      if (g.phase !== "title") {
        ctx.fillStyle = "#c4553a";
        for (const cop of g.cops) ctx.fillRect(5 + cop.x * sx - 2, 5 + cop.y * sy - 2, 4, 4);
        if (g.heli) {
          ctx.fillStyle = "#e8a317";
          ctx.fillRect(5 + g.heli.x * sx - 2, 5 + g.heli.y * sy - 3, 5, 5);
        }
        ctx.fillStyle = "#f3ead7";
        ctx.beginPath();
        ctx.arc(5 + g.x * sx, 5 + g.y * sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    dispose() {
      composer.dispose();
      target0.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      renderer.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      win?.dispose();
    },
  };
}
