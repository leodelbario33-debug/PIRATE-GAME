import * as THREE from "three";
import type { CraftDef, MerchantKind } from "./types";

// ----------------------------- utilidades -----------------------------
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const angDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// Altura de ola en CPU — DEBE coincidir con el shader del mar.
export function waveH(x: number, z: number, t: number) {
  let h = 1.05 * Math.sin(x * 0.045 + t * 0.9 + z * 0.02);
  h += 0.5 * Math.sin(z * 0.075 - t * 1.25 + x * 0.012);
  h += 0.25 * Math.sin((x + z) * 0.11 + t * 1.7);
  return h;
}

const SEA_VERT = `
uniform float uT;
varying vec3 vW; varying float vH;
float wh(vec2 p, float t){
  float h = 1.05*sin(p.x*0.045 + t*0.9 + p.y*0.02);
  h += 0.5*sin(p.y*0.075 - t*1.25 + p.x*0.012);
  h += 0.25*sin((p.x+p.y)*0.11 + t*1.7);
  return h;
}
void main(){
  vec3 p = position;
  vec2 wp = vec2(p.x, -p.y);
  float h = wh(wp, uT);
  p.z += h;
  vH = h;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const SEA_FRAG = `
uniform float uT; uniform vec3 uCam; uniform vec3 uSunDir; uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vW; varying float vH;
float wh(vec2 p, float t){
  float h = 1.05*sin(p.x*0.045 + t*0.9 + p.y*0.02);
  h += 0.5*sin(p.y*0.075 - t*1.25 + p.x*0.012);
  h += 0.25*sin((p.x+p.y)*0.11 + t*1.7);
  return h;
}
void main(){
  float e = 1.6;
  vec2 g = vec2(vW.x, vW.z);
  float hl = wh(g - vec2(e,0.0), uT); float hr = wh(g + vec2(e,0.0), uT);
  float hb = wh(g - vec2(0.0,e), uT); float hf = wh(g + vec2(0.0,e), uT);
  vec3 n = normalize(vec3(hl - hr, 2.0*e, hb - hf));
  vec3 V = normalize(uCam - vW);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 deep = vec3(0.006, 0.055, 0.085);
  vec3 shal = vec3(0.015, 0.19, 0.23);
  vec3 col = mix(deep, shal, clamp(vH*0.22 + 0.38, 0.0, 1.0));
  float spec = pow(max(dot(reflect(-uSunDir, n), V), 0.0), 140.0);
  col += vec3(1.0, 0.6, 0.28) * spec * 1.6;
  vec3 skyR = mix(vec3(0.04, 0.14, 0.18), vec3(0.85, 0.42, 0.18), pow(1.0 - max(n.y, 0.0), 2.0));
  col = mix(col, skyR, fres * 0.6);
  col += vec3(0.7, 0.82, 0.82) * smoothstep(1.15, 1.75, vH) * 0.3;
  float d = distance(uCam, vW);
  float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
  col = mix(col, uFogColor, clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSea(fogColor: number, fogDensity: number) {
  const geo = new THREE.PlaneGeometry(14000, 14000, 170, 170);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(-0.55, 0.18, -0.8).normalize() },
      uFogColor: { value: new THREE.Color(fogColor) },
      uFogDensity: { value: fogDensity },
    },
    vertexShader: SEA_VERT,
    fragmentShader: SEA_FRAG,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

const SKY_VERT = `varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `
uniform vec3 uCam; uniform vec3 uSunDir;
varying vec3 vP;
void main(){
  vec3 d = normalize(vP - uCam);
  float y = d.y;
  vec3 top = vec3(0.012, 0.05, 0.09);
  vec3 mid = vec3(0.05, 0.19, 0.25);
  vec3 hor = vec3(0.98, 0.42, 0.14);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, y));
  c = mix(c, top, smoothstep(0.2, 0.65, y));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  c += vec3(1.0, 0.5, 0.16) * pow(s, 20.0) * 0.85;
  c += vec3(1.0, 0.78, 0.45) * pow(s, 320.0) * 1.5;
  c = mix(c, vec3(0.02, 0.045, 0.06), smoothstep(0.0, -0.18, y));
  gl_FragColor = vec4(c, 1.0);
}`;

export function makeSky() {
  const geo = new THREE.SphereGeometry(6400, 24, 14);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() }, uSunDir: { value: new THREE.Vector3(-0.55, 0.18, -0.8).normalize() } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -10;
  return m;
}

export function makeClouds() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x14262e, transparent: true, opacity: 0.85, fog: true });
  for (let i = 0; i < 14; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(120, 260), 7, 5), mat);
    puff.scale.set(rand(2.2, 4), rand(0.35, 0.6), rand(1.2, 2));
    puff.position.set(rand(-3800, 3800), rand(320, 620), rand(-3800, 3800));
    g.add(puff);
  }
  return g;
}

// ----------------------------- materiales -----------------------------
const M = {
  hullDark: new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.55, metalness: 0.25, flatShading: true }),
  hullRed: new THREE.MeshStandardMaterial({ color: 0x7a1f14, roughness: 0.8, flatShading: true }),
  hullBlue: new THREE.MeshStandardMaterial({ color: 0x16233a, roughness: 0.7, flatShading: true }),
  deckSteel: new THREE.MeshStandardMaterial({ color: 0x2c3947, roughness: 0.9, flatShading: true }),
  white: new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.5, flatShading: true }),
  superWhite: new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.6, flatShading: true }),
  windowGlow: new THREE.MeshStandardMaterial({ color: 0x0a0f14, emissive: 0xffb85c, emissiveIntensity: 0.9, roughness: 0.3 }),
  windowBlue: new THREE.MeshStandardMaterial({ color: 0x0d1b26, emissive: 0x1a3a4d, emissiveIntensity: 0.6, roughness: 0.3 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.45, metalness: 0.6, flatShading: true }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0a0d11, roughness: 0.7, metalness: 0.3, flatShading: true }),
  black: new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.6, metalness: 0.4, flatShading: true }),
  orange: new THREE.MeshStandardMaterial({ color: 0xe8621c, roughness: 0.6, flatShading: true }),
  sand: new THREE.MeshStandardMaterial({ color: 0x9c8258, roughness: 1, flatShading: true }),
  palm: new THREE.MeshStandardMaterial({ color: 0x1d5c38, roughness: 0.9, flatShading: true }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1, flatShading: true }),
  patrolWhite: new THREE.MeshStandardMaterial({ color: 0xcdd6dc, roughness: 0.5, flatShading: true }),
  netGlow: new THREE.MeshStandardMaterial({ color: 0x1a0a00, emissive: 0xff9a2e, emissiveIntensity: 2.2, roughness: 0.4 }),
  subHull: new THREE.MeshStandardMaterial({ color: 0x0c1116, roughness: 0.35, metalness: 0.7, flatShading: true }),
};

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  return m;
}

// ----------------------------- lanchas del jugador -----------------------------
export interface PlayerRig {
  group: THREE.Group;
  turret: THREE.Group;
  muzzle: THREE.Object3D;
  enginePuffs: THREE.Object3D[];
  bowAnchor: THREE.Object3D;
  sternAnchor: THREE.Object3D;
  peri?: { yaw: THREE.Group; pitch: THREE.Group; muzzle: THREE.Object3D };
}

export function buildGoFast(def: CraftDef): PlayerRig {
  const g = new THREE.Group();
  // casco: proa hacia +Z
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 13), M.hullDark);
  hull.position.y = 0.55;
  g.add(hull);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.7, 4, 4, 1), M.hullDark);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(1, 1, 0.55);
  bow.position.set(0, 0.5, 8.4);
  g.add(bow);
  // franjas
  g.add(box(3.5, 0.28, 13.05, M.orange, 0, 0.9, 0));
  // consola central
  g.add(box(1.8, 1.1, 1.6, M.dark, 0, 1.6, 1.2));
  g.add(box(1.6, 0.5, 0.15, M.windowBlue, 0, 2.05, 1.95));
  // asientos y detalles
  g.add(box(2.2, 0.5, 2.4, M.black, 0, 1.35, -1.2));
  g.add(box(0.5, 0.8, 0.5, M.steel, 1.2, 1.5, 3.4));
  // 4 motores fueraborda gigantes
  const enginePuffs: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const e = new THREE.Group();
    e.add(box(0.75, 1.15, 1.5, M.black, 0, 0.55, 0));
    e.add(box(0.65, 0.5, 1.2, M.dark, 0, 1.25, -0.2));
    e.add(box(0.3, 0.9, 0.3, M.steel, 0, -0.3, -0.55));
    const px = -1.26 + i * 0.84;
    e.position.set(px, 0.4, -6.9);
    g.add(e);
    const puff = new THREE.Object3D();
    puff.position.set(px, 0.2, -7.9);
    g.add(puff);
    enginePuffs.push(puff);
  }
  // torreta con ametralladora en proa
  const turret = new THREE.Group();
  turret.position.set(0, 1.35, 3.6);
  const mount = box(0.5, 0.7, 0.5, M.steel);
  mount.position.y = 0.35;
  turret.add(mount);
  const gunBody = box(0.32, 0.36, 1.9, M.black, 0, 0.95, 0.5);
  turret.add(gunBody);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), M.steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.98, 1.9);
  turret.add(barrel);
  if (def.id === "fantasma") {
    // minigun: tambor + 2 cañones extra
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 8), M.dark);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, 0.95, 0.9);
    turret.add(drum);
    turret.add(box(0.08, 0.08, 1.5, M.steel, 0.12, 0.98, 1.8));
    turret.add(box(0.08, 0.08, 1.5, M.steel, -0.12, 0.98, 1.8));
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.98, 2.8);
  turret.add(muzzle);
  g.add(turret);
  const bowAnchor = new THREE.Object3D(); bowAnchor.position.set(0, 0.4, 9.2); g.add(bowAnchor);
  const sternAnchor = new THREE.Object3D(); sternAnchor.position.set(0, 0.3, -8.2); g.add(sternAnchor);
  return { group: g, turret, muzzle, enginePuffs, bowAnchor, sternAnchor };
}

export function buildSub(def: CraftDef): PlayerRig {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 24, 10), M.subHull);
  hull.rotation.x = Math.PI / 2;
  hull.position.y = -0.4;
  g.add(hull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.9, 10, 6), M.subHull);
  nose.scale.set(1, 1, 1.6);
  nose.position.set(0, -0.4, 12);
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.9, 5, 10), M.subHull);
  tail.rotation.x = -Math.PI / 2;
  tail.position.set(0, -0.4, -13.5);
  g.add(tail);
  // vela (torre)
  g.add(box(1.6, 3.2, 5.5, M.subHull, 0, 2.4, -1));
  g.add(box(1.2, 0.6, 4.6, M.dark, 0, 4.1, -1));
  // periscopio
  g.add(box(0.18, 1.6, 0.18, M.steel, 0.5, 5.0, 0.8));
  // planos de buceo
  g.add(box(5.2, 0.16, 1.5, M.subHull, 0, -0.2, 9));
  // hélice
  const prop = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 3), M.steel);
  prop.rotation.x = Math.PI / 2;
  prop.position.set(0, -0.4, -16.1);
  g.add(prop);
  // cañón de cubierta
  const turret = new THREE.Group();
  turret.position.set(0, 1.55, 4.5);
  turret.add(box(1.1, 0.7, 1.4, M.dark, 0, 0.35, 0));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 8), M.black);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.85, 1.6);
  turret.add(barrel);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.85, 3.2);
  turret.add(muzzle);
  g.add(turret);
  const enginePuffs: THREE.Object3D[] = [];
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Object3D();
    p.position.set(i === 0 ? -0.7 : 0.7, -1.2, -16);
    g.add(p);
    enginePuffs.push(p);
  }
  // mástil periscópico con cañón: al sumergirse, es lo único que asoma del agua
  const periYaw = new THREE.Group();
  periYaw.position.set(0, 4.2, -1);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 4.4, 8), M.steel);
  mast.position.y = 2.2;
  periYaw.add(mast);
  const periPitch = new THREE.Group();
  periPitch.position.y = 4.5;
  periPitch.add(box(0.66, 0.5, 1.15, M.dark, 0, 0, 0));
  const pbarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8), M.black);
  pbarrel.rotation.x = Math.PI / 2;
  pbarrel.position.set(0, 0.06, 1.35);
  periPitch.add(pbarrel);
  const pmuzzle = new THREE.Object3D();
  pmuzzle.position.set(0, 0.06, 2.55);
  periPitch.add(pmuzzle);
  periYaw.add(periPitch);
  g.add(periYaw);
  const bowAnchor = new THREE.Object3D(); bowAnchor.position.set(0, -0.4, 14.5); g.add(bowAnchor);
  const sternAnchor = new THREE.Object3D(); sternAnchor.position.set(0, -0.4, -15); g.add(sternAnchor);
  return { group: g, turret, muzzle, enginePuffs, bowAnchor, sternAnchor, peri: { yaw: periYaw, pitch: periPitch, muzzle: pmuzzle } };
}

// ----------------------------- barcos mercantes -----------------------------
export interface DeckInfo {
  len: number;
  wid: number;
  deckY: number;
  railHalf: number;
  bridgeLocal: THREE.Vector3;
  captainLocal: THREE.Vector3;
  bossLocal: THREE.Vector3 | null;
  guardLocals: THREE.Vector3[];
  boxes: { x: number; z: number; hx: number; hz: number; h: number }[];
  smokePoint: THREE.Vector3;
  funnelLocal: THREE.Vector3;
}
export interface MerchantRig {
  group: THREE.Group;
  deck: DeckInfo;
  netMat: THREE.MeshStandardMaterial;
}

const CONT_COLORS = [0x8a3324, 0x274e63, 0x3f6b3f, 0x7d6a2a, 0x5b3a6e, 0x2a6b6b, 0x8a5a24, 0x39424e];

function containerStack(parent: THREE.Group, x: number, z: number, layers: number, count: number, dir: "z" | "x") {
  const geo = new THREE.BoxGeometry(2.5, 2.6, 6.2);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.75, flatShading: true }), layers * count);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let i = 0;
  for (let l = 0; l < layers; l++) {
    for (let c = 0; c < count; c++) {
      const off = (c - (count - 1) / 2) * 6.4;
      const px = dir === "z" ? x : x + off;
      const pz = dir === "z" ? z + off : z;
      m4.makeTranslation(px, 1.3 + l * 2.65, pz);
      inst.setMatrixAt(i, m4);
      col.setHex(CONT_COLORS[Math.floor(Math.random() * CONT_COLORS.length)]);
      col.multiplyScalar(rand(0.7, 1.05));
      inst.setColorAt(i, col);
      i++;
    }
  }
  inst.instanceColor!.needsUpdate = true;
  parent.add(inst);
  return { hx: dir === "z" ? 1.35 : (count * 6.4) / 2 + 0.2, hz: dir === "z" ? (count * 6.4) / 2 + 0.2 : 1.35, h: layers * 2.65 };
}

export function buildMerchant(kind: MerchantKind, name: string): MerchantRig {
  const g = new THREE.Group();
  g.userData.name = name;
  let len = 120, wid = 20, deckY = 7, bridgeH = 13;
  if (kind === "tanker") { len = 145; wid = 24; deckY = 7.5; bridgeH = 14; }
  if (kind === "yacht") { len = 70; wid = 12; deckY = 4.6; bridgeH = 8; }
  if (kind === "liner") { len = 220; wid = 30; deckY = 9; bridgeH = 10; }

  const boxes: DeckInfo["boxes"] = [];

  // ---- casco ----
  const draft = 3.4;
  const lower = box(wid, draft, len * 0.94, kind === "yacht" || kind === "liner" ? M.hullBlue : M.hullRed, 0, -draft / 2 + 0.2, 0);
  g.add(lower);
  const freeboard = box(wid, deckY, len, kind === "yacht" || kind === "liner" ? M.white : M.hullBlue, 0, deckY / 2, 0);
  g.add(freeboard);
  // proa
  const bowW = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1, len * 0.16, 4, 1), kind === "yacht" || kind === "liner" ? M.white : M.hullBlue);
  bowW.rotation.x = Math.PI / 2;
  bowW.rotation.y = Math.PI / 4;
  bowW.scale.set(wid / 2, 1, 0.7);
  bowW.position.set(0, deckY / 2 - 1, len / 2 + len * 0.06);
  g.add(bowW);
  // cubierta
  g.add(box(wid - 0.6, 0.4, len - 1, M.deckSteel, 0, deckY + 0.2, 0));
  // bulwarks / barandillas laterales
  g.add(box(0.4, 1.3, len, M.deckSteel, wid / 2 - 0.2, deckY + 0.8, 0));
  g.add(box(0.4, 1.3, len, M.deckSteel, -wid / 2 + 0.2, deckY + 0.8, 0));

  // ---- superestructura (puente a popa) ----
  const bridgeZ = -len / 2 + 10;
  const bridgeW = wid * 0.78;
  const bridge = box(bridgeW, bridgeH, 14, kind === "cargo" || kind === "tanker" ? M.superWhite : M.white, 0, deckY + bridgeH / 2, bridgeZ);
  g.add(bridge);
  // ventanas del puente (franjas brillantes)
  for (let i = 0; i < 3; i++) {
    g.add(box(bridgeW + 0.2, 0.7, 0.4, i === 2 ? M.windowGlow : M.windowBlue, 0, deckY + bridgeH - 1.6 - i * 2.4, bridgeZ + 7.1));
    g.add(box(0.4, 0.7, 13.6, M.windowBlue, bridgeW / 2 + 0.1, deckY + bridgeH - 1.6 - i * 2.4, bridgeZ));
    g.add(box(0.4, 0.7, 13.6, M.windowBlue, -bridgeW / 2 - 0.1, deckY + bridgeH - 1.6 - i * 2.4, bridgeZ));
  }
  // alerón del puente (ala) donde está el capitán
  g.add(box(bridgeW + 5, 0.4, 3.4, M.deckSteel, 0, deckY + bridgeH - 3.4, bridgeZ + 5.6));
  // chimenea
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 5, 8), kind === "liner" ? M.orange : M.dark);
  funnel.position.set(0, deckY + bridgeH + 2.2, bridgeZ - 2);
  g.add(funnel);
  if (kind === "liner") {
    const f2 = funnel.clone();
    f2.position.z = bridgeZ - 8;
    g.add(f2);
  }
  // mástil y radar
  g.add(box(0.3, 7, 0.3, M.steel, 0, deckY + bridgeH + 3.2, bridgeZ + 3));
  const radar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.25, 8), M.white);
  radar.position.set(0, deckY + bridgeH + 6.8, bridgeZ + 3);
  g.add(radar);

  // ---- carga según tipo ----
  if (kind === "cargo") {
    for (let s = -1; s <= 1; s += 2) {
      for (let bx = 0; bx < 3; bx++) {
        const zc = -len * 0.28 + bx * len * 0.24;
        const c = containerStack(g, s * (wid / 2 - 4.6), zc, bx === 1 ? 3 : 2, 1, "z");
        boxes.push({ x: s * (wid / 2 - 4.6), z: zc, hx: c.hx, hz: 3.3, h: c.h });
      }
    }
    // grúas de cubierta
    for (const gz of [-len * 0.16, len * 0.08]) {
      g.add(box(0.8, 10, 0.8, M.orange, 0, deckY + 5, gz));
      g.add(box(12, 0.6, 0.6, M.orange, 0, deckY + 10, gz));
    }
  } else if (kind === "tanker") {
    // tanques y tuberías
    for (let i = 0; i < 4; i++) {
      const zc = -len * 0.3 + i * len * 0.17;
      for (const s of [-1, 1]) {
        const t = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 8), M.steel);
        t.position.set(s * (wid / 2 - 5), deckY + 2.5, zc);
        g.add(t);
        boxes.push({ x: s * (wid / 2 - 5), z: zc, hx: 3.2, hz: 3.2, h: 5 });
      }
    }
    for (const s of [-1.6, 0, 1.6]) {
      g.add(box(0.35, 0.35, len * 0.62, M.dark, s, deckY + 0.7, len * 0.02));
    }
  } else if (kind === "yacht") {
    g.add(box(8, 2.6, 16, M.white, 0, deckY + 1.7, -len * 0.05));
    g.add(box(6, 2.2, 12, M.white, 0, deckY + 4.1, -len * 0.08));
    g.add(box(3, 1.8, 7, M.white, 0, deckY + 6.1, -len * 0.1));
    g.add(box(8.1, 0.8, 16.1, M.windowBlue, 0, deckY + 1.8, -len * 0.05));
    boxes.push({ x: 0, z: -len * 0.05, hx: 3.4, hz: 8.2, h: 7 });
    // helipuerto en proa
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.3, 14), M.dark);
    pad.position.set(0, deckY + 0.5, len * 0.3);
    g.add(pad);
    // jacuzzi
    const tub = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.8, 10), M.windowBlue);
    tub.position.set(0, deckY + 6.9, -len * 0.1);
    g.add(tub);
  } else {
    // transatlántico: cubiertas de pasajeros
    for (let i = 0; i < 4; i++) {
      const w = wid * (0.66 - i * 0.08);
      g.add(box(w, 3, len * 0.72, M.white, 0, deckY + 1.8 + i * 3.1, len * 0.02));
      g.add(box(w + 0.2, 0.9, len * 0.72 + 0.2, M.windowBlue, 0, deckY + 2.3 + i * 3.1, len * 0.02));
      boxes.push({ x: 0, z: len * 0.02, hx: w / 2, hz: len * 0.36, h: deckY + i * 3.1 });
    }
    // botes salvavidas naranjas
    for (let i = 0; i < 6; i++) {
      for (const s of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 3.4, 3, 6), M.orange);
        b.rotation.z = Math.PI / 2;
        b.position.set(s * (wid / 2 - 0.6), deckY + 4.4, -len * 0.22 + i * len * 0.09);
        g.add(b);
      }
    }
  }

  // ---- red eléctrica en barandillas (solo mercantes grandes) ----
  const netMat = M.netGlow.clone();
  const railHalf = wid / 2 - 0.5;
  if (kind !== "yacht") {
    for (const s of [-1, 1]) {
      const cable = box(0.14, 0.14, len - 4, netMat, s * railHalf, deckY + 1.5, 0);
      g.add(cable);
      const cable2 = box(0.14, 0.14, len - 4, netMat, s * railHalf, deckY + 0.75, 0);
      g.add(cable2);
      for (let i = 0; i < 10; i++) {
        g.add(box(0.1, 1.5, 0.1, M.steel, s * railHalf, deckY + 0.95, -len / 2 + 6 + (i * (len - 12)) / 9));
      }
    }
  }

  // ---- tripulación (guardias + jefe + capitán) ----
  const guardLocals: THREE.Vector3[] = [];
  let nGuards = 3;
  if (kind === "tanker") nGuards = 4;
  if (kind === "yacht") nGuards = 3;
  if (kind === "liner") nGuards = 5;
  for (let i = 0; i < nGuards; i++) {
    const zc = -len * 0.32 + (i * len * 0.62) / Math.max(1, nGuards - 1);
    const xc = i % 2 === 0 ? 0 : (wid / 2 - 4.2) * (i % 4 === 1 ? 1 : -1);
    guardLocals.push(new THREE.Vector3(xc, deckY + 0.4, zc));
  }
  const bossLocal = kind === "yacht" ? null : new THREE.Vector3(0, deckY + 0.4, len * 0.02);
  const captainLocal = new THREE.Vector3(bridgeW / 2 + 1.4, deckY + bridgeH - 3.0, bridgeZ + 5.6);
  const bridgeLocal = new THREE.Vector3(0, deckY + bridgeH - 3.0, bridgeZ + 5.6);

  const deck: DeckInfo = {
    len, wid, deckY, railHalf,
    bridgeLocal, captainLocal, bossLocal, guardLocals, boxes,
    smokePoint: new THREE.Vector3(0, deckY + bridgeH + 4.5, bridgeZ - 2),
    funnelLocal: new THREE.Vector3(0, deckY + bridgeH + 4.5, bridgeZ - 2),
  };
  return { group: g, deck, netMat };
}

// ----------------------------- patrullera -----------------------------
export interface PatrolRig { group: THREE.Group; muzzle: THREE.Object3D; lightA: THREE.PointLight; lightB: THREE.PointLight; turret: THREE.Group; }
export function buildPatrol(): PatrolRig {
  const g = new THREE.Group();
  g.add(box(4.2, 1.6, 19, M.patrolWhite, 0, 0.8, 0));
  g.add(box(4.3, 0.5, 19.05, M.hullBlue, 0, 1.35, 0));
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 2.1, 4.5, 4, 1), M.patrolWhite);
  bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.scale.set(1, 1, 0.5);
  bow.position.set(0, 0.8, 11.4);
  g.add(bow);
  g.add(box(3.2, 2.4, 6.5, M.white, 0, 2.8, -2.5));
  g.add(box(3.3, 0.8, 6.6, M.windowBlue, 0, 3.4, -2.5));
  g.add(box(0.25, 4.5, 0.25, M.steel, 0, 5.6, -3.5));
  // texto lateral simulado: franja
  g.add(box(4.35, 0.7, 8, M.hullBlue, 0, 1.0, 3));
  const turret = new THREE.Group();
  turret.position.set(0, 4.1, 0.5);
  turret.add(box(0.4, 0.5, 0.4, M.steel, 0, 0.25, 0));
  turret.add(box(0.22, 0.24, 1.6, M.black, 0, 0.7, 0.5));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.7, 1.9);
  turret.add(muzzle);
  g.add(turret);
  const lightA = new THREE.PointLight(0xff2222, 0, 60);
  lightA.position.set(-0.8, 4.6, -2.5);
  g.add(lightA);
  const lightB = new THREE.PointLight(0x2266ff, 0, 60);
  lightB.position.set(0.8, 4.6, -2.5);
  g.add(lightB);
  g.add(box(0.5, 0.25, 0.5, M.dark, 0, 4.5, -2.5));
  return { group: g, muzzle, lightA, lightB, turret };
}

// ----------------------------- personajes -----------------------------
export interface CharRig { group: THREE.Group; gunTip: THREE.Object3D; head: THREE.Mesh; body: THREE.Mesh; }
export function buildCharacter(role: "pirate" | "guard" | "boss" | "captain"): CharRig {
  const g = new THREE.Group();
  const skin = 0xc98a5b;
  let shirt = 0x7a1f1f, pants = 0x23272e, hat = 0x7a1f1f;
  if (role === "guard") { shirt = 0x1d2c3f; pants = 0x161d26; hat = 0x101820; }
  if (role === "boss") { shirt = 0x121212; pants = 0x0c0c0c; hat = 0x8a1010; }
  if (role === "captain") { shirt = 0xd8dde2; pants = 0x101820; hat = 0xf0f0f0; }
  const mShirt = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85, flatShading: true });
  const mPants = new THREE.MeshStandardMaterial({ color: pants, roughness: 0.9, flatShading: true });
  const mSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.8, flatShading: true });
  // piernas
  g.add(box(0.28, 0.75, 0.3, mPants, -0.19, 0.38, 0));
  g.add(box(0.28, 0.75, 0.3, mPants, 0.19, 0.38, 0));
  // torso
  const body = box(role === "boss" ? 0.95 : 0.75, 0.85, 0.45, mShirt, 0, 1.18, 0);
  g.add(body);
  // brazos
  g.add(box(0.22, 0.7, 0.26, mShirt, role === "boss" ? -0.62 : -0.5, 1.25, 0.05));
  g.add(box(0.22, 0.7, 0.26, mShirt, role === "boss" ? 0.62 : 0.5, 1.25, 0.05));
  // cabeza
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), mSkin);
  head.position.set(0, 1.85, 0);
  g.add(head);
  // sombrero / bandana / gorra
  const hatM = new THREE.MeshStandardMaterial({ color: hat, roughness: 0.9, flatShading: true });
  if (role === "pirate") {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.08, 6, 10), hatM);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, 1.96, 0);
    g.add(band);
    const tail = box(0.12, 0.35, 0.06, hatM, -0.24, 1.8, -0.1);
    g.add(tail);
  } else {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.16, 8), hatM);
    cap.position.set(0, 2.05, 0);
    g.add(cap);
    if (role === "captain") g.add(box(0.3, 0.05, 0.22, hatM, 0, 2.0, 0.28));
  }
  // arma (AK)
  const gun = new THREE.Group();
  gun.add(box(0.12, 0.16, 1.0, new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.7, flatShading: true }), 0, 0, 0.2));
  gun.add(box(0.08, 0.08, 0.7, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.5 }), 0, 0.02, 0.85));
  gun.add(box(0.08, 0.3, 0.14, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }), 0, -0.2, 0.1));
  gun.position.set(0.35, 1.35, 0.3);
  g.add(gun);
  const gunTip = new THREE.Object3D();
  gunTip.position.set(0, 0.02, 1.25);
  gun.add(gunTip);
  return { group: g, gunTip, head, body };
}

// ----------------------------- islas -----------------------------
export function buildIsland(r: number, palms: number, hasCove: boolean) {
  const g = new THREE.Group();
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.35, 2.4, 12), M.sand);
  sand.position.y = 0.4;
  g.add(sand);
  const hill = new THREE.Mesh(new THREE.ConeGeometry(r * 0.62, r * 0.85, 9), M.palm);
  hill.position.y = r * 0.38;
  hill.scale.y = 1.1;
  g.add(hill);
  const hill2 = new THREE.Mesh(new THREE.ConeGeometry(r * 0.34, r * 0.5, 7), M.palm);
  hill2.position.set(r * 0.3, r * 0.22, -r * 0.2);
  g.add(hill2);
  // rocas
  for (let i = 0; i < 4; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1.2, 2.6), 0), M.deckSteel);
    const a = rand(0, Math.PI * 2);
    rock.position.set(Math.cos(a) * r * 1.05, 0.6, Math.sin(a) * r * 1.05);
    g.add(rock);
  }
  for (let i = 0; i < palms; i++) {
    const p = new THREE.Group();
    const a = rand(0, Math.PI * 2);
    const d = rand(r * 0.25, r * 0.75);
    p.position.set(Math.cos(a) * d, 1.2, Math.sin(a) * d);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 7, 6), M.trunk);
    trunk.position.y = 3.5;
    trunk.rotation.z = rand(-0.15, 0.15);
    p.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 4), M.palm);
      frond.position.y = 7.1;
      frond.rotation.z = Math.PI / 2.4;
      frond.rotation.y = (f / 5) * Math.PI * 2;
      frond.translateY(1.6);
      p.add(frond);
    }
    g.add(p);
  }
  if (hasCove) {
    // embarcadero + cabaña del perista
    g.add(box(3.4, 0.5, 18, M.trunk, r * 0.9, 1.0, 0));
    for (let i = 0; i < 5; i++) g.add(box(0.4, 2.4, 0.4, M.trunk, r * 0.9 + 1.3, 0.4, -7 + i * 3.5));
    g.add(box(7, 4.5, 6, new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1, flatShading: true }), r * 0.45, 3.4, -r * 0.25));
    g.add(box(7.4, 0.6, 6.4, new THREE.MeshStandardMaterial({ color: 0x7a2a18, roughness: 1, flatShading: true }), r * 0.45, 5.9, -r * 0.25));
    g.add(box(1.4, 1.4, 0.3, M.windowGlow, r * 0.45 + 3.6, 3.6, -r * 0.25));
    // grúa pequeña + contenedor
    g.add(box(5, 2.6, 2.5, new THREE.MeshStandardMaterial({ color: 0x8a3324, roughness: 0.8, flatShading: true }), r * 0.3, 2.5, r * 0.35));
    g.add(box(2.6, 2.6, 2.5, new THREE.MeshStandardMaterial({ color: 0x274e63, roughness: 0.8, flatShading: true }), r * 0.3 + 4, 2.5, r * 0.35));
  }
  return g;
}

// ----------------------------- portaaviones -----------------------------
export const CARRIER_DECK = { len: 240, wid: 46, deckY: 21 };

function carrierBase(len: number, wid: number, deckY: number, police: boolean) {
  const g = new THREE.Group();
  const hullMat = police ? M.patrolWhite : M.hullDark;
  const deckMat = police ? M.deckSteel : M.black;
  // casco
  g.add(box(wid - 8, 6, len * 0.94, police ? M.hullBlue : M.hullRed, 0, -1.6, 0));
  g.add(box(wid - 4, deckY - 4, len * 0.98, hullMat, 0, (deckY - 4) / 2 + 1, 0));
  // proa
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1, len * 0.1, 4, 1), hullMat);
  bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
  bow.scale.set((wid - 4) / 2, 1, 0.75);
  bow.position.set(0, deckY / 2, len / 2 + len * 0.04);
  g.add(bow);
  // cubierta de vuelo
  g.add(box(wid, 1.4, len, deckMat, 0, deckY, 0));
  // franjas de pista
  const stripeMat = new THREE.MeshStandardMaterial({ color: police ? 0x2a6ad0 : 0xd8d2c0, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 12; i++) {
    g.add(box(0.8, 0.12, 6, stripeMat, 0, deckY + 0.78, -len * 0.42 + i * (len * 0.84) / 11));
  }
  g.add(box(0.5, 0.12, len * 0.9, stripeMat, -wid * 0.28, deckY + 0.78, 0));
  g.add(box(0.5, 0.12, len * 0.9, stripeMat, wid * 0.28, deckY + 0.78, 0));
  // isla (torre) a estribor
  const islandMat = police ? M.white : M.superWhite;
  g.add(box(9, 15, 24, islandMat, wid / 2 - 7, deckY + 8.2, -len * 0.12));
  g.add(box(9.2, 1.1, 24.2, police ? M.windowBlue : M.windowGlow, wid / 2 - 7, deckY + 14.4, -len * 0.12));
  g.add(box(0.4, 9, 0.4, M.steel, wid / 2 - 7, deckY + 20, -len * 0.12));
  const radarDome = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), M.white);
  radarDome.position.set(wid / 2 - 7, deckY + 25, -len * 0.12);
  g.add(radarDome);
  return { g, len, wid, deckY };
}

export function buildCarrier(def: CraftDef): PlayerRig {
  const { g, len, wid, deckY } = carrierBase(CARRIER_DECK.len, CARRIER_DECK.wid, CARRIER_DECK.deckY, false);
  void def;
  // 4 turbinas: chimeneas dobles con escapes
  const enginePuffs: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const sx = i % 2 === 0 ? -1 : 1;
    const sz = i < 2 ? -len * 0.28 : -len * 0.36;
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 7, 8), M.dark);
    stack.position.set(sx * 8, deckY + 4, sz);
    stack.rotation.z = sx * 0.16;
    g.add(stack);
    const puff = new THREE.Object3D();
    puff.position.set(sx * 9.2, deckY + 7.8, sz);
    g.add(puff);
    enginePuffs.push(puff);
  }
  // CIWS de proa (torreta)
  const turret = new THREE.Group();
  turret.position.set(0, deckY + 0.8, len * 0.38);
  turret.add(box(2.2, 2.2, 2.6, M.white, 0, 1.2, 0));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 3.4, 8), M.steel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 2.4, 2);
  turret.add(barrel);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 2.4, 3.9);
  turret.add(muzzle);
  g.add(turret);
  const bowAnchor = new THREE.Object3D(); bowAnchor.position.set(0, deckY, len / 2 + 2); g.add(bowAnchor);
  const sternAnchor = new THREE.Object3D(); sternAnchor.position.set(0, 4, -len / 2 - 2); g.add(sternAnchor);
  return { group: g, turret, muzzle, enginePuffs, bowAnchor, sternAnchor };
}

export function buildPoliceCarrier(): THREE.Group {
  const { g, len, deckY } = carrierBase(200, 42, 19, true);
  // rótulo lateral azul
  g.add(box(0.6, 3, 60, new THREE.MeshStandardMaterial({ color: 0x1a4fc0, roughness: 0.6, flatShading: true }), 20.6, 10, 10));
  g.add(box(0.6, 3, 60, new THREE.MeshStandardMaterial({ color: 0x1a4fc0, roughness: 0.6, flatShading: true }), -20.6, 10, 10));
  // cazas aparcados (estáticos)
  for (const z of [40, -10, -60]) {
    const j = buildJetMesh(0xd8dde2, true);
    j.group.position.set(-8, deckY + 1.4, z);
    g.add(j.group);
  }
  // luces de sirena
  const la = new THREE.PointLight(0xff2222, 0, 140);
  la.position.set(12, deckY + 18, -24);
  g.add(la);
  const lb = new THREE.PointLight(0x2266ff, 0, 140);
  lb.position.set(16, deckY + 18, -24);
  g.add(lb);
  g.userData.lightA = la;
  g.userData.lightB = lb;
  void len;
  return g;
}

export function buildJetMesh(color: number, police = false): { group: THREE.Group; gear: THREE.Group; flame: THREE.Mesh } {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: police ? 0xe8ecf0 : color, roughness: 0.45, metalness: 0.5, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x11151a, roughness: 0.5, metalness: 0.5, flatShading: true });
  // fuselaje (proa +Z)
  const fuse = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 9, 4, 8), body);
  fuse.rotation.x = Math.PI / 2;
  fuse.position.y = 0.4;
  g.add(fuse);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.6, 8), body);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.4, 6.6);
  g.add(nose);
  // cabina
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 6), new THREE.MeshStandardMaterial({ color: 0x0d1b26, emissive: police ? 0x2a6ad0 : 0x3a2a10, emissiveIntensity: 0.7, roughness: 0.2 }));
  canopy.scale.set(0.8, 0.6, 1.7);
  canopy.position.set(0, 1.05, 2.4);
  g.add(canopy);
  // alas en delta
  const wing = box(11.5, 0.22, 3.6, body, 0, 0.25, -1.2);
  g.add(wing);
  // estabilizadores
  g.add(box(5.4, 0.18, 2, body, 0, 0.4, -5));
  // dobles derivas
  for (const s of [-1, 1]) {
    const fin = box(0.2, 2.4, 2.6, body, s * 1.1, 1.5, -5);
    fin.rotation.z = s * -0.28;
    g.add(fin);
  }
  // tomas de aire
  g.add(box(0.7, 0.9, 3, dark, 1.05, 0.1, 0.6));
  g.add(box(0.7, 0.9, 3, dark, -1.05, 0.1, 0.6));
  // franja
  g.add(box(1.8, 0.1, 4, police ? new THREE.MeshStandardMaterial({ color: 0x1a4fc0, roughness: 0.6, flatShading: true }) : M.orange, 0, 1.28, -0.6));
  // tren de aterrizaje (retráctil)
  const gear = new THREE.Group();
  const wheelMat = M.black;
  const mkWheel = (x: number, z: number) => {
    const strut = box(0.14, 1, 0.14, M.steel, x, -0.5, z);
    gear.add(strut);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 8), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, -1, z);
    gear.add(w);
  };
  mkWheel(0, 4.4);
  mkWheel(1.1, -1.8);
  mkWheel(-1.1, -1.8);
  g.add(gear);
  // postquemador
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 4.5, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, 0.4, -8);
  flame.visible = false;
  g.add(flame);
  return { group: g, gear, flame };
}
