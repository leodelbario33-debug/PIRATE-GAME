import * as THREE from "three";
import type { CraftId, GameCallbacks, HudData, MerchantKind, Mode, MsgKind, RadarBlip, RadarSnap, GameOverInfo } from "./types";
import { CRAFTS, MERCHANT_INFO } from "./types";
import { SFX } from "./audio";
import {
  buildGoFast, buildSub, buildMerchant, buildPatrol, buildIsland, buildCharacter, makeSea, makeSky, makeClouds,
  buildCarrier, buildJetMesh, buildPoliceCarrier, CARRIER_DECK,
  waveH, rand, clamp, lerp, angDiff,
} from "./world";
import type { PlayerRig, MerchantRig, PatrolRig, CharRig } from "./world";

// ---------------------------------------------------------------- entidades
interface GuardEnt {
  rig: CharRig; hp: number; alive: boolean; surrendered: boolean;
  fireT: number; burstLeft: number; burstT: number;
  local: THREE.Vector3; isBoss: boolean; fallT: number; strafeSeed: number;
}
interface Merchant {
  rig: MerchantRig; kind: MerchantKind; name: string; value: number;
  hp: number; maxHp: number; speed: number; baseSpeed: number; heading: number;
  wp: THREE.Vector3; state: "sail" | "disabled" | "sinking" | "sold";
  smokeT: number; detected: boolean; anchorY: number;
  guards: GuardEnt[]; boss: GuardEnt | null; captainRig: CharRig;
  boarded: boolean; hijacked: boolean; sinkT: number; alertT: number;
}
interface Patrol {
  rig: PatrolRig; heading: number; speed: number; wp: THREE.Vector3;
  fireT: number; burstLeft: number; burstT: number; hp: number;
}
interface Torpedo { mesh: THREE.Group; dir: THREE.Vector3; speed: number; life: number; depth: number; }
interface JetEnt {
  group: THREE.Group; gearG: THREE.Group; flameG: THREE.Mesh;
  pos: THREE.Vector3; heading: number; pitch: number; roll: number;
  speed: number; throttle: number; gear: boolean; hull: number;
  boostT: number; gunCool: number;
}
interface PoliceJetEnt {
  group: THREE.Group; flameG: THREE.Mesh; pos: THREE.Vector3;
  heading: number; pitch: number; speed: number; hp: number; fireT: number;
}
interface EnemyMissile { mesh: THREE.Group; vel: THREE.Vector3; life: number; }
interface PoliceCarrierEnt { group: THREE.Group; pos: THREE.Vector3; heading: number; hp: number; maxHp: number; smokeT: number; }
interface Missile { mesh: THREE.Group; start: THREE.Vector3; end: THREE.Vector3; t: number; dur: number; arc: number; }
interface Particle {
  s: THREE.Sprite; vel: THREE.Vector3; life: number; maxLife: number;
  s0: number; s1: number; grav: number; op: number;
}
interface Tracer { line: THREE.Line; life: number; }

interface HitRef { type: "guard" | "patrol" | "merchant" | "captain" | "island"; guard?: GuardEnt; patrol?: Patrol; merchant?: Merchant; }

const FOG_COLOR = 0x0e333d;
const FOG_DENSITY = 0.00042;
const MAP_LIMIT = 2800;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private cb: GameCallbacks;
  private sfx = new SFX();
  private raf = 0;
  private clock = new THREE.Clock();
  private disposed = false;
  paused = false;
  private over = false;

  // jugador
  private craft: PlayerRig;
  private craftId: CraftId;
  private heading = 0;
  private speed = 0;
  private throttle = 0;
  private hull: number;
  private hullMax: number;
  private health = 100;
  private lookYaw = 0;
  private lookPitch = -0.08;
  private submerged = false;
  private depth = 0;
  private torps: number;
  private torpCool = 0;
  private missiles: number;
  private missileCool = 0;
  private missilesFly: Missile[] = [];
  private missileHits = 0;

  // aviación
  private jet: JetEnt | null = null;
  private jetSlot: THREE.Object3D | null = null;
  private parkedJets: THREE.Object3D[] = [];
  private policeCarrier: PoliceCarrierEnt | null = null;
  private policeJets: PoliceJetEnt[] = [];
  private enemyMissiles: EnemyMissile[] = [];
  private jetLaunchT = 0;
  private sonicT = 0;
  private fireCool = 0;
  private mag = 30;
  private reloading = false;
  private reloadT = 0;
  private zoom = false;
  private fov = 70;

  // modo
  private mode: Mode = "sea";
  private boardShip: Merchant | null = null;
  private captainShip: Merchant | null = null;
  private pirate: CharRig | null = null;
  private shipSpeed = 0;
  private shipHull = 300;
  private shipHullMax = 300;
  private progress = -1; // 0..1 para acciones de mantener E
  private progressKind: "hijack" | "sell" | null = null;

  // mundo
  private sea: THREE.Mesh;
  private sky: THREE.Mesh;
  private merchants: Merchant[] = [];
  private patrols: Patrol[] = [];
  private islands: { g: THREE.Group; x: number; z: number; r: number }[] = [];
  private sellPoint = new THREE.Vector3();
  private sellBeacon: THREE.Mesh;
  private torpedoes: Torpedo[] = [];
  private shootables: THREE.Object3D[] = [];
  private t = 0;
  private timeSec = 0;

  // fx
  private pTex: THREE.Texture;
  private particles: Particle[] = [];
  private tracers: Tracer[] = [];
  private flashLight: THREE.PointLight;
  private flashT = 0;
  private shake = 0;
  private camPos = new THREE.Vector3(0, 8, -20);
  private camRoll = 0;

  // estado
  private wanted = 0;
  private wantedDecayT = 0;
  private money = 0;
  private contracts = 0;
  private kills = 0;
  private torpHits = 0;
  private arrestT = 0;
  private damageT = -10;
  private hitT = -10;
  private hudT = 0;
  private radarT = 0;
  private radar: RadarSnap = { px: 0, pz: 0, heading: 0, range: 900, blips: [] };
  private objective = "";
  private blindSpot: "proa" | "popa" | null = null;
  private canInteract: string | null = null;
  private nearestTarget: Merchant | null = null;
  private limitMsgT = 0;
  private sonarT = 0;
  private arrestWarnT = 0;
  private lastZone: "proa" | "popa" | null = null;
  private aimRange = -1;
  private aimTarget = "";
  private pcMissileT = 4;
  private missileWarn: { dist: number; angle: number } | null = null;

  // cuerda de abordaje (visible en la zona ciega)
  private ropeGeo = new THREE.BufferGeometry();
  private ropeLine: THREE.Line;
  private ropeHook: THREE.Mesh;

  // input
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private firing = false;

  constructor(canvas: HTMLCanvasElement, craftId: CraftId, cb: GameCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.craftId = craftId;
    const def = CRAFTS[craftId];
    this.hull = def.hull;
    this.hullMax = def.hull;
    this.torps = def.torpedoes;
    this.missiles = def.missiles;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(FOG_COLOR);
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 14000);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

    // luces: atardecer
    const hemi = new THREE.HemisphereLight(0x7fb2c4, 0x0a1a20, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffa050, 2.2);
    sun.position.set(-2200, 700, -3200);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x3a6a7a, 0.5);
    fill.position.set(1500, 900, 2000);
    this.scene.add(fill);

    this.sea = makeSea(FOG_COLOR, FOG_DENSITY);
    this.scene.add(this.sea);
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.scene.add(makeClouds());

    this.flashLight = new THREE.PointLight(0xffc060, 0, 90);
    this.scene.add(this.flashLight);

    // cuerda de abordaje con garfio (se tensa en la zona ciega)
    this.ropeGeo.setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]);
    this.ropeLine = new THREE.Line(this.ropeGeo, new THREE.LineBasicMaterial({ color: 0xe8c26a, transparent: true, opacity: 0.95 }));
    this.ropeLine.visible = false;
    this.ropeLine.frustumCulled = false;
    this.scene.add(this.ropeLine);
    this.ropeHook = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.75, 6),
      new THREE.MeshStandardMaterial({ color: 0x9aa4ad, metalness: 0.8, roughness: 0.35, flatShading: true })
    );
    this.ropeHook.visible = false;
    this.scene.add(this.ropeHook);

    // textura de partículas
    const cv = document.createElement("canvas");
    cv.width = 64; cv.height = 64;
    const cx = cv.getContext("2d")!;
    const grd = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.7)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    cx.fillStyle = grd;
    cx.fillRect(0, 0, 64, 64);
    this.pTex = new THREE.CanvasTexture(cv);

    // jugador
    this.craft = def.submarine ? buildSub(def) : def.id === "kraken" ? buildCarrier(def) : buildGoFast(def);
    this.scene.add(this.craft.group);
    if (def.id === "kraken") {
      for (const z of [70, 30, -10]) {
        const j = buildJetMesh(0x2b333d);
        j.group.position.set(-10, CARRIER_DECK.deckY + 1.4, z);
        this.craft.group.add(j.group);
        this.parkedJets.push(j.group);
      }
    }

    // beacon del punto de venta
    const bg = new THREE.CylinderGeometry(3, 7, 260, 10, 1, true);
    const bm = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.sellBeacon = new THREE.Mesh(bg, bm);
    this.sellBeacon.visible = false;
    this.scene.add(this.sellBeacon);

    this.buildWorld();
    this.bindInput();
    this.pushMsg(`Contrato abierto: roba la mercancía de cualquier barco y véndela en la cala.`, "info");
    if (this.craftId === "viuda") {
      this.pushMsg(`Tienes 4 MISILES AÉREOS (ESPACIO): apunta con la mira ×8 (CLIC DER) y revienta cascos desde lejos.`, "good");
    } else if (this.craftId === "tiburon") {
      this.pushMsg(`Detecta contactos en el radar y caza con torpedos desde el periscopio (C).`, "info");
    } else {
      this.pushMsg(`Detecta contactos en el radar y acércate por proa o popa.`, "info");
    }
    this.loop();
  }

  // ------------------------------------------------------------- mundo
  private tag(root: THREE.Object3D, ref: HitRef) {
    root.traverse((o) => { o.userData.hit = ref; });
    this.shootables.push(root);
  }

  private buildWorld() {
    // isla del perista (punto de venta)
    const cove = buildIsland(95, 8, true);
    cove.position.set(2350, 0, -1750);
    this.scene.add(cove);
    this.islands.push({ g: cove, x: 2350, z: -1750, r: 95 });
    this.sellPoint.set(2350 + 95 + 30, 0, -1750);
    this.sellBeacon.position.set(this.sellPoint.x, 100, this.sellPoint.z);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rand(-0.3, 0.3);
      const d = rand(750, 2500);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const r = rand(45, 90);
      const isl = buildIsland(r, Math.floor(rand(3, 8)), false);
      isl.position.set(x, 0, z);
      this.scene.add(isl);
      this.islands.push({ g: isl, x, z, r });
      this.tag(isl, { type: "island" });
    }

    this.spawnMerchant("cargo", "MV ALBATROS", 950, 0.7);
    this.spawnMerchant("tanker", "PETROLERO DELTA", 1450, 2.4);
    this.spawnMerchant("yacht", "YATE SERENISSIMA", 1150, 4.2);
    this.spawnMerchant("liner", "SS COLOSO DE LOS MARES", 2050, 5.4);

    this.spawnPatrol(rand(0, 6), 800);
    this.spawnPatrol(rand(0, 6), 950);

    // portaaviones de la policía marítima
    const pcg = buildPoliceCarrier();
    pcg.position.set(-2300, 0, 1900);
    this.scene.add(pcg);
    this.policeCarrier = {
      group: pcg, pos: new THREE.Vector3(-2300, 0, 1900), heading: 0.6, hp: 320, maxHp: 320, smokeT: 0,
    };
  }

  private spawnMerchant(kind: MerchantKind, name: string, dist: number, ang: number) {
    const rig = buildMerchant(kind, name);
    const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
    rig.group.position.set(x, 0, z);
    this.scene.add(rig.group);
    const m: Merchant = {
      rig, kind, name,
      value: MERCHANT_INFO[kind].value,
      hp: 100, maxHp: 100,
      speed: kind === "yacht" ? 5.5 : kind === "liner" ? 4.4 : 4,
      baseSpeed: kind === "yacht" ? 5.5 : kind === "liner" ? 4.4 : 4,
      heading: rand(0, Math.PI * 2),
      wp: new THREE.Vector3(rand(-2200, 2200), 0, rand(-2200, 2200)),
      state: "sail", smokeT: 0, detected: false, anchorY: 0,
      guards: [], boss: null,
      captainRig: buildCharacter("captain"),
      boarded: false, hijacked: false, sinkT: 0, alertT: 0,
    };
    // guardias
    rig.deck.guardLocals.forEach((loc, i) => {
      const r = buildCharacter("guard");
      r.group.position.copy(loc);
      r.group.rotation.y = rand(0, Math.PI * 2);
      rig.group.add(r.group);
      const g: GuardEnt = { rig: r, hp: 34, alive: true, surrendered: false, fireT: rand(0.5, 1.6), burstLeft: 0, burstT: 0, local: loc.clone(), isBoss: false, fallT: 0, strafeSeed: rand(0, 9) };
      m.guards.push(g);
      const hb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 1.5), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hb.position.y = 1.2;
      r.group.add(hb);
      this.tag(hb, { type: "guard", guard: g, merchant: m });
      void i;
    });
    if (rig.deck.bossLocal) {
      const r = buildCharacter("boss");
      r.group.scale.setScalar(1.3);
      r.group.position.copy(rig.deck.bossLocal);
      rig.group.add(r.group);
      const b: GuardEnt = { rig: r, hp: 85, alive: true, surrendered: false, fireT: 1.0, burstLeft: 0, burstT: 0, local: rig.deck.bossLocal.clone(), isBoss: true, fallT: 0, strafeSeed: 3 };
      m.boss = b;
      m.guards.push(b);
      const hb = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.8, 1.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      hb.position.y = 1.3;
      r.group.add(hb);
      this.tag(hb, { type: "guard", guard: b, merchant: m });
    }
    // capitán en el ala del puente (a nivel de cubierta, junto a la puerta)
    const d = rig.deck;
    m.captainRig.group.position.set(d.bridgeLocal.x + d.wid * 0.2, d.deckY + 0.4, d.bridgeLocal.z + 8.2);
    m.captainRig.group.rotation.y = Math.PI;
    rig.group.add(m.captainRig.group);
    const chb = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.3, 1.4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    chb.position.y = 1.15;
    m.captainRig.group.add(chb);
    this.tag(chb, { type: "captain", merchant: m });
    this.tag(rig.group, { type: "merchant", merchant: m });
    this.merchants.push(m);
  }

  private spawnPatrol(ang: number, dist: number) {
    const rig = buildPatrol();
    const px = this.craft.group.position.x + Math.cos(ang) * dist;
    const pz = this.craft.group.position.z + Math.sin(ang) * dist;
    rig.group.position.set(clamp(px, -MAP_LIMIT, MAP_LIMIT), 0, clamp(pz, -MAP_LIMIT, MAP_LIMIT));
    this.scene.add(rig.group);
    const p: Patrol = { rig, heading: rand(0, 6.28), speed: 0, wp: new THREE.Vector3(rand(-2400, 2400), 0, rand(-2400, 2400)), fireT: 1, burstLeft: 0, burstT: 0, hp: 160 };
    this.patrols.push(p);
    this.tag(rig.group, { type: "patrol", patrol: p });
  }

  // ------------------------------------------------------------- input
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.pressed.add(e.code);
    if (e.code === "KeyM") this.sfx.setMuted(!this.sfx.muted);
    if (e.code === "Escape" || e.code === "KeyP") {
      if (!this.over) this.cb.onHudPauseRequest();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.canvas) return;
    this.lookYaw -= e.movementX * 0.0022;
    this.lookPitch = clamp(this.lookPitch - e.movementY * 0.002, -0.55, 0.62);
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this.firing = true;
    if (e.button === 2) this.zoom = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false;
    if (e.button === 2) this.zoom = false;
  };
  private onCtx = (e: Event) => e.preventDefault();
  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
  private onLockChange = () => {
    if (document.pointerLockElement !== this.canvas && !this.paused && !this.over && !this.disposed) {
      this.cb.onLockLost();
    }
  };

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("contextmenu", this.onCtx);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  requestLock() {
    this.sfx.ensure();
    const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === "function") p.catch(() => undefined);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) document.exitPointerLock();
    this.sfx.engine(0, 1, false);
    this.sfx.siren(false);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("contextmenu", this.onCtx);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.sfx.siren(false);
    this.renderer.dispose();
  }

  getRadar(): RadarSnap { return this.radar; }

  private pushMsg(text: string, kind: MsgKind) {
    this.cb.onMessage(text, kind);
  }

  // ------------------------------------------------------------- FX
  private spawnP(pos: THREE.Vector3, vel: THREE.Vector3, life: number, s0: number, s1: number, color: number, op: number, grav: number, additive: boolean) {
    if (this.particles.length > 300) return;
    const mat = new THREE.SpriteMaterial({ map: this.pTex, color, transparent: true, opacity: op, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.scale.setScalar(s0);
    this.scene.add(s);
    this.particles.push({ s, vel, life, maxLife: life, s0, s1, grav, op });
  }

  private burst(pos: THREE.Vector3, n: number, color: number, speed: number, life: number, size: number, grav: number, additive = true) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.4, 1.1), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.3, speed));
      this.spawnP(pos, v, rand(life * 0.5, life), size, size * 0.2, color, 0.95, grav, additive);
    }
  }

  private smoke(pos: THREE.Vector3, n: number, dark = false) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-0.6, 0.6), rand(1.5, 3.4), rand(-0.6, 0.6));
      this.spawnP(pos, v, rand(1.2, 2.4), rand(2, 4), rand(8, 14), dark ? 0x141414 : 0x3a3a3a, 0.5, -0.4, false);
    }
  }

  private explosion(pos: THREE.Vector3, scale = 1) {
    this.burst(pos, Math.floor(16 * scale), 0xffb347, 26 * scale, 0.7, 2.4 * scale, 8);
    this.burst(pos, Math.floor(10 * scale), 0xff5a1a, 18 * scale, 0.5, 3.2 * scale, 4);
    this.smoke(pos, Math.floor(10 * scale), true);
    const flash = this.spawnP(pos, new THREE.Vector3(), 0.22, 4 * scale, 22 * scale, 0xffe0a0, 1, 0, true);
    void flash;
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 900 * scale;
    this.flashT = 0.12;
    this.shake = Math.min(2.2, this.shake + 1.1 * scale);
    this.sfx.explosion(scale > 1.3);
  }

  private splash(pos: THREE.Vector3, scale = 1) {
    this.burst(pos, Math.floor(10 * scale), 0xbfeef2, 12 * scale, 0.6, 1.6 * scale, 20, true);
    this.smoke(pos, 4);
    this.sfx.splash();
  }

  private muzzleFlash(worldPos: THREE.Vector3, big = false) {
    this.spawnP(worldPos, new THREE.Vector3(), 0.055, big ? 2.4 : 1.1, 0.2, 0xffd080, 1, 0, true);
    this.flashLight.position.copy(worldPos);
    this.flashLight.intensity = big ? 320 : 140;
    this.flashT = 0.05;
  }

  private tracer(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
    if (this.tracers.length > 70) {
      const old = this.tracers.shift()!;
      this.scene.remove(old.line);
      old.line.geometry.dispose();
      (old.line.material as THREE.Material).dispose();
    }
  }

  // ------------------------------------------------------------- daño
  private damagePlayer(amount: number) {
    if (this.over) return;
    if (this.mode === "sea") {
      this.hull -= amount;
      if (this.hull <= 0) {
        this.hull = 0;
        this.explosion(this.craft.group.position.clone().add(new THREE.Vector3(0, 2, 0)), 1.8);
        this.gameOver("hundido", "TU EMBARCACIÓN VOLÓ EN PEDAZOS", "La patrulla hundió tu nave en aguas abiertas. El mar no devuelve lo que se lleva.");
      }
    } else if (this.mode === "board") {
      this.health -= amount;
      if (this.health <= 0) {
        this.health = 0;
        this.gameOver("muerto", "CAÍSTE EN CUBIERTA", "La seguridad del barco fue más rápida que tú. Tu cuerpo se lo queda el mar.");
      }
    } else {
      this.shipHull -= amount;
      if (this.shipHull <= 0) {
        this.shipHull = 0;
        const p = this.captainShip!.rig.group.position.clone();
        this.explosion(p.add(new THREE.Vector3(0, 10, 0)), 2.4);
        this.gameOver("hundido", "HUNDIERON TU BARCO ROBADO", "La policía marítima echó a pique el carguero con toda la mercancía a bordo.");
      }
    }
    this.damageT = performance.now();
    this.sfx.hurt();
    this.shake = Math.min(1.6, this.shake + 0.35);
  }

  private gameOver(cause: GameOverInfo["cause"], title: string, detail: string) {
    if (this.over) return;
    this.over = true;
    this.sfx.siren(false);
    this.sfx.engine(0, 1, false);
    document.exitPointerLock();
    this.cb.onGameOver({ cause, title, detail, money: this.money, contracts: this.contracts, kills: this.kills, torpHits: this.torpHits, missileHits: this.missileHits, timeSec: Math.floor(this.timeSec) });
  }

  // ------------------------------------------------------------- bucle
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.paused && !this.over) this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    this.t += dt;
    this.timeSec += dt;
    const seaMat = this.sea.material as THREE.ShaderMaterial;
    seaMat.uniforms.uT.value = this.t;
    (this.sky.material as THREE.ShaderMaterial).uniforms.uCam.value.copy(this.camera.position);
    seaMat.uniforms.uCam.value.copy(this.camera.position);

    // pulso de respiración al apuntar con la óptica (SHIFT = aguantar la respiración)
    if (this.zoom && this.mode === "sea") {
      const steady = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 0.15 : 1;
      this.lookYaw += Math.sin(this.t * 1.15) * 0.0034 * steady;
      this.lookPitch = clamp(this.lookPitch + Math.sin(this.t * 0.75 + 1.7) * 0.0026 * steady, -0.55, 0.62);
    }

    if (this.mode === "sea") this.updateSea(dt);
    else if (this.mode === "board") this.updateBoard(dt);
    else if (this.mode === "captain") this.updateCaptain(dt);
    else this.updateJet(dt);

    this.updateMerchants(dt);
    this.updatePatrols(dt);
    this.updateTorpedoes(dt);
    this.updateMissiles(dt);
    this.updatePoliceForces(dt);
    this.updateEnemyMissiles(dt);
    this.updateWanted(dt);
    this.updateFx(dt);
    this.updateCamera(dt);
    this.updateObjective();

    // sonido motor + sirena
    const nearPatrol = this.patrols.some((p) => p.rig.group.position.distanceTo(this.craft.group.position) < 420 && this.wanted > 0);
    this.sfx.siren(nearPatrol && this.wanted > 0);
    if (this.mode === "sea") this.sfx.engine(Math.abs(this.throttle), this.craftId === "tiburon" ? 0.62 : this.craftId === "kraken" ? 0.38 : 1, true);
    else if (this.mode === "captain") this.sfx.engine(Math.abs(this.throttle) * 0.6, 0.45, true);
    else this.sfx.engine(0, 1, false);
    // reactor del caza
    if (this.mode === "jet" && this.jet) {
      const burner = (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && this.jet.throttle > 0.85 && this.jet.speed > 60;
      const p = clamp(Math.max(this.jet.throttle * 0.55, this.jet.speed / 520), 0.08, 1);
      this.sfx.jet(true, p, burner);
    } else {
      this.sfx.jet(false);
    }

    // sonar del submarino
    if (this.craftId === "tiburon" && this.submerged) {
      this.sonarT -= dt;
      if (this.sonarT <= 0) { this.sonarT = 3.5; this.sfx.sonar(); }
    }

    // HUD throttle
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.emitHud();
    }
    this.radarT -= dt;
    if (this.radarT <= 0) {
      this.radarT = 0.15;
      this.buildRadar();
    }
    this.pressed.clear();
  }

  // ------------------------------------------------------------- modo mar
  private updateSea(dt: number) {
    const def = CRAFTS[this.craftId];
    const k = this.keys;
    const tIn = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 0.55 : 0);
    this.throttle = lerp(this.throttle, tIn, dt * 2.2);
    const boost = k.has("ShiftLeft") && !def.submarine ? 1.22 : 1;
    const target = this.throttle * def.topSpeed * boost * (this.submerged ? 0.62 : 1);
    this.speed = lerp(this.speed, target, dt * (def.accel / 10) * 2.4);
    const turnIn = (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) - (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0);
    const speedFactor = clamp(Math.abs(this.speed) / 6, 0.25, 1);
    this.heading += turnIn * def.turn * speedFactor * dt * Math.sign(this.speed >= 0 ? 1 : -1);

    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const pos = this.craft.group.position;
    pos.addScaledVector(fwd, this.speed * dt);
    this.clampMap(pos);

    // periscopio: el casco se hunde, solo el cañón asoma sobre el agua
    if (this.pressed.has("KeyC") && def.submarine) {
      this.submerged = !this.submerged;
      this.pushMsg(
        this.submerged
          ? "MODO PERISCOPIO — casco bajo el agua, SOLO el cañón asoma. Dispara sin ser visto."
          : "Emergiendo. Cañón de cubierta listo.",
        "info"
      );
      this.sfx.splashDown();
      this.splash(pos.clone().add(new THREE.Vector3(0, 1, 0)), 1.6);
    }
    const targetY = this.submerged ? -3.6 : waveH(pos.x, pos.z, this.t) + (def.submarine ? 0.55 : 0.35);
    pos.y = lerp(pos.y, targetY, dt * (this.submerged ? 1.6 : 6));
    this.depth = -Math.min(0, pos.y);
    this.craft.group.rotation.y = this.heading;
    if (!this.submerged) {
      const e = 2.5;
      const hC = waveH(pos.x, pos.z, this.t);
      const hF = waveH(pos.x + fwd.x * e, pos.z + fwd.z * e, this.t);
      const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const hS = waveH(pos.x + side.x * e, pos.z + side.z * e, this.t);
      this.craft.group.rotation.x = Math.atan2(hC - hF, e) * 0.8;
      this.craft.group.rotation.z = Math.atan2(hS - hC, e) * 0.9;
    } else {
      this.craft.group.rotation.x = lerp(this.craft.group.rotation.x, this.throttle * 0.12, dt * 2);
      this.craft.group.rotation.z = lerp(this.craft.group.rotation.z, -turnIn * 0.15, dt * 3);
    }

    // estela y burbujas
    if (Math.abs(this.speed) > 4 && Math.random() < 0.75) {
      const stern = new THREE.Vector3();
      this.craft.sternAnchor.getWorldPosition(stern);
      this.spawnP(stern, new THREE.Vector3(rand(-1, 1), rand(0.4, 1.4), rand(-1, 1)), 0.7, rand(1.5, 3), 3.5, 0xd8f4f4, 0.5, 0.6, true);
    }

    // torreta sigue la vista; bajo el agua, el mástil periscópico es quien apunta
    const relYaw = angDiff(this.heading, this.lookYaw);
    this.craft.turret.rotation.y = clamp(relYaw, -1.2, 1.2);
    if (this.craft.peri) {
      this.craft.peri.yaw.rotation.y = clamp(relYaw, -1.35, 1.35);
      this.craft.peri.pitch.rotation.x = clamp(-this.lookPitch, -0.4, 0.25);
    }

    // disparo montado: en superficie o desde el periscopio
    const periReady = def.submarine && this.submerged && !!this.craft.peri;
    this.fireCool -= dt;
    if (this.firing && (!this.submerged || periReady) && this.fireCool <= 0) {
      this.fireCool = 1 / def.fireRate;
      this.fireCraftGun();
    }
    // torpedos
    this.torpCool -= dt;
    if (this.pressed.has("Space") && def.submarine) {
      if (this.torps > 0 && this.torpCool <= 0) this.launchTorpedo();
      else if (this.torps <= 0) { this.pushMsg("Sin torpedos. Vende mercancía para reabastecer.", "warn"); this.sfx.empty(); }
    }
    // misiles aéreos (La Viuda; el portaaviones los usa solo desde el caza)
    this.missileCool -= dt;
    if (this.pressed.has("Space") && def.missiles > 0 && this.craftId !== "kraken") {
      if (this.missiles > 0 && this.missileCool <= 0) this.launchMissile();
      else if (this.missiles <= 0) { this.pushMsg("Rampa de misiles vacía. Reabastece vendiendo mercancía.", "warn"); this.sfx.empty(); }
    }

    // detección de zona ciega para abordar
    this.blindSpot = null;
    this.canInteract = null;
    this.nearestTarget = null;
    let zoneShip: Merchant | null = null;
    let best = 1e9;
    for (const m of this.merchants) {
      if (m.state === "sinking" || m.state === "sold" || m.hijacked || m.boarded) continue;
      const mp = m.rig.group.position;
      const d = pos.distanceTo(mp);
      if (d < best) { best = d; this.nearestTarget = m; }
      if (!m.detected && d < 1100) {
        m.detected = true;
        this.pushMsg(`CONTACTO EN EL RADAR: ${m.name} · ${MERCHANT_INFO[m.kind].label} · mercancía ${"$" + m.value.toLocaleString("es-ES")}`, "info");
        this.sfx.sonar();
      }
      if (d < 55) {
        const mf = new THREE.Vector3(Math.sin(m.heading), 0, Math.cos(m.heading));
        const toP = pos.clone().sub(mp).normalize();
        const dotB = mf.dot(toP);
        if (Math.abs(dotB) > 0.72) {
          this.blindSpot = dotB > 0 ? "proa" : "popa";
          zoneShip = m;
          if (Math.abs(this.speed) < 7) {
            this.canInteract = `CUERDA LISTA POR ${this.blindSpot.toUpperCase()} — PULSA E PARA SUBIR`;
            if (this.pressed.has("KeyE")) this.startBoarding(m, this.blindSpot);
          } else {
            this.canInteract = `ZONA CIEGA (${this.blindSpot.toUpperCase()}) — REDUCE VELOCIDAD`;
          }
        }
      }
    }

    // cuerda de abordaje: se tiende del garfio a la barandilla dentro de la zona ciega
    if (zoneShip && this.blindSpot) {
      const dk = zoneShip.rig.deck;
      const p1 = new THREE.Vector3();
      this.craft.bowAnchor.getWorldPosition(p1);
      const local = zoneShip.rig.group.worldToLocal(this.craft.group.position.clone());
      const railX = (local.x >= 0 ? 1 : -1) * dk.railHalf;
      const zL = clamp(local.z, -dk.len / 2 + 4, dk.len / 2 - 4);
      const p2 = zoneShip.rig.group.localToWorld(new THREE.Vector3(railX, dk.deckY + 1.5, zL));
      const attr = this.ropeGeo.attributes.position as THREE.BufferAttribute;
      attr.setXYZ(0, p1.x, p1.y, p1.z);
      attr.setXYZ(1, p2.x, p2.y, p2.z);
      attr.needsUpdate = true;
      this.ropeGeo.computeBoundingSphere();
      this.ropeHook.position.copy(p2);
      this.ropeHook.rotation.set(Math.PI, 0, 0);
      this.ropeLine.visible = true;
      this.ropeHook.visible = true;
    } else {
      this.ropeLine.visible = false;
      this.ropeHook.visible = false;
    }
    if (this.blindSpot !== this.lastZone) {
      if (this.blindSpot) {
        this.sfx.rope();
        this.pushMsg("Garfio enganchado a la barandilla — la cuerda está tensa", "good");
      }
      this.lastZone = this.blindSpot;
    }

    // portaaviones: subir al caza con E
    if (this.craftId === "kraken" && !this.blindSpot) {
      if (this.parkedJets.length > 0) {
        if (Math.abs(this.speed) < 12) {
          this.canInteract = `SUBIR AL CAZA Y DESPEGAR — PULSA E (${this.parkedJets.length} en cubierta)`;
          if (this.pressed.has("KeyE")) this.takeOff();
        } else {
          this.canInteract = "REDUCE VELOCIDAD PARA LANZAR LOS CAZAS";
        }
      } else {
        this.canInteract = "SIN CAZAS DISPONIBLES";
      }
    }

    // límite del mapa
    this.limitMsgT -= dt;
  }

  private clampMap(pos: THREE.Vector3) {
    let hit = false;
    if (Math.abs(pos.x) > MAP_LIMIT) { pos.x = clamp(pos.x, -MAP_LIMIT, MAP_LIMIT); hit = true; }
    if (Math.abs(pos.z) > MAP_LIMIT) { pos.z = clamp(pos.z, -MAP_LIMIT, MAP_LIMIT); hit = true; }
    if (hit && this.limitMsgT <= 0) {
      this.limitMsgT = 8;
      this.pushMsg("MAR DE TORMENTAS — DA MEDIA VUELTA", "warn");
    }
  }

  private camDir(): THREE.Vector3 {
    const d = new THREE.Vector3(
      Math.sin(this.lookYaw) * Math.cos(this.lookPitch),
      Math.sin(this.lookPitch),
      Math.cos(this.lookYaw) * Math.cos(this.lookPitch)
    );
    return d.normalize();
  }

  private fireCraftGun() {
    const def = CRAFTS[this.craftId];
    const usePeri = this.craftId === "tiburon" && this.submerged && !!this.craft.peri;
    const muzzle = new THREE.Vector3();
    if (usePeri) this.craft.peri!.muzzle.getWorldPosition(muzzle);
    else this.craft.muzzle.getWorldPosition(muzzle);
    this.muzzleFlash(muzzle, this.craftId === "tiburon");
    this.sfx.shot(this.craftId === "tiburon");
    const dir = this.camDir();
    const hitPoint = this.raycastWorld(muzzle, dir, 900);
    const end = hitPoint ? hitPoint.point : muzzle.clone().addScaledVector(dir, 600);
    this.tracer(muzzle, end, 0xffd27a);
    if (hitPoint) this.applyHit(hitPoint, def.weaponDmg, "craft");
    // disparar cerca de mercantes sube la búsqueda
    for (const m of this.merchants) {
      if (m.rig.group.position.distanceTo(this.craft.group.position) < 260) { this.raiseWanted(1); break; }
    }
  }

  private raycastWorld(from: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    const rc = new THREE.Raycaster(from, dir.clone().normalize(), 0.1, maxDist);
    const hits = rc.intersectObjects(this.shootables, true);
    if (hits.length === 0) return null;
    const h = hits[0];
    let o: THREE.Object3D | null = h.object;
    let ref: HitRef | undefined;
    while (o) {
      if (o.userData.hit) { ref = o.userData.hit as HitRef; break; }
      o = o.parent;
    }
    return { point: h.point, ref };
  }

  private applyHit(hit: { point: THREE.Vector3; ref: HitRef | undefined }, dmg: number, source: "craft" | "rifle") {
    const r = hit.ref;
    this.burst(hit.point, 5, 0xffd070, 7, 0.3, 0.5, 6);
    if (!r) return;
    if (r.type === "guard" && r.guard) {
      const g = r.guard;
      if (!g.alive) return;
      g.hp -= source === "rifle" ? dmg : dmg * 1.2;
      this.hitT = performance.now();
      this.sfx.hit();
      if (g.hp <= 0) this.killGuard(g, r.merchant!);
      else if (r.merchant && !r.merchant.boarded) this.alertMerchant(r.merchant);
    } else if (r.type === "patrol" && r.patrol) {
      r.patrol.hp -= dmg;
      this.hitT = performance.now();
      this.sfx.hit();
      this.raiseWanted(2);
      if (r.patrol.hp <= 0) this.destroyPatrol(r.patrol);
    } else if (r.type === "merchant" && r.merchant) {
      const m = r.merchant;
      m.hp -= dmg * 0.25;
      if (source === "craft") this.alertMerchant(m);
      if (m.hp <= 60 && m.state === "sail" && m.hp > 0) {
        m.state = "disabled";
        m.baseSpeed = 0;
        this.pushMsg(`${m.name} AVERIADO — humo en la sala de máquinas`, "good");
      }
    } else if (r.type === "captain") {
      if (source === "rifle" && this.mode === "board") this.pushMsg("¡Al capitán no! Lo necesitas vivo para el barco.", "warn");
    }
  }

  private alertMerchant(m: Merchant) {
    if (m.alertT > 0) return;
    m.alertT = 6;
    this.raiseWanted(1);
    this.sfx.alarm();
  }

  private killGuard(g: GuardEnt, m: Merchant) {
    g.alive = false;
    g.fallT = 0.001;
    this.kills++;
    this.sfx.hit();
    this.burst(g.rig.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.2, 0)), 8, 0xd84040, 6, 0.5, 0.6, 5);
    if (g.isBoss) this.pushMsg("JEFE DE SEGURIDAD ELIMINADO — el puente está desprotegido", "good");
    else if (m.boarded && Math.random() < 0.4) this.pushMsg("Guardia eliminado", "info");
  }

  private destroyPatrol(p: Patrol) {
    const pos = p.rig.group.position.clone().add(new THREE.Vector3(0, 2, 0));
    this.explosion(pos, 1.5);
    this.scene.remove(p.rig.group);
    this.patrols = this.patrols.filter((x) => x !== p);
    this.pushMsg("Patrullera destruida — la caza se intensifica", "danger");
    this.raiseWanted(2);
  }

  private raiseWanted(n: number) {
    this.wanted = clamp(Math.max(this.wanted, n), 0, 5);
  }

  private launchTorpedo() {
    this.torps--;
    this.torpCool = 1.3;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 3.2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.4, metalness: 0.6 }));
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xffb347, roughness: 0.5 }));
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 2;
    g.add(nose);
    const bow = new THREE.Vector3();
    this.craft.bowAnchor.getWorldPosition(bow);
    const depth = clamp(bow.y - 1.5, -13, -3.5);
    bow.y = depth;
    g.position.copy(bow);
    const dir = this.camDir();
    dir.y = 0;
    dir.normalize();
    g.rotation.y = this.lookYaw;
    this.scene.add(g);
    this.torpedoes.push({ mesh: g, dir, speed: 27, life: 22, depth });
    this.sfx.torpedoLaunch();
    this.raiseWanted(1);
    this.pushMsg("¡Torpedo en el agua!", "info");
  }

  private updateTorpedoes(dt: number) {
    for (const t of this.torpedoes) {
      t.life -= dt;
      t.mesh.position.addScaledVector(t.dir, t.speed * dt);
      t.mesh.position.y = lerp(t.mesh.position.y, t.depth, dt * 2);
      if (Math.random() < 0.6) {
        this.spawnP(t.mesh.position.clone(), new THREE.Vector3(rand(-0.4, 0.4), rand(0.6, 1.6), rand(-0.4, 0.4)), 0.8, 0.5, 1.6, 0xbfeef2, 0.4, -0.6, true);
      }
      // colisión con mercantes
      let consumed = false;
      for (const m of this.merchants) {
        if (m.state === "sinking" || m.state === "sold" || m.hijacked) continue;
        const local = this.toLocal(m, t.mesh.position);
        const d = m.rig.deck;
        if (Math.abs(local.x) < d.wid / 2 + 2.5 && Math.abs(local.z) < d.len / 2 + 4) {
          this.torpedoImpact(m, t.mesh.position);
          consumed = true;
          break;
        }
      }
      if (!consumed) {
        for (const p of this.patrols) {
          if (p.rig.group.position.distanceTo(t.mesh.position) < 12) {
            this.explosion(p.rig.group.position.clone().add(new THREE.Vector3(0, 2, 0)), 1.6);
            this.destroyPatrol(p);
            this.torpHits++;
            consumed = true;
            break;
          }
        }
      }
      if (consumed || t.life <= 0) {
        this.scene.remove(t.mesh);
      }
    }
    this.torpedoes = this.torpedoes.filter((t) => t.life > 0 && t.mesh.parent !== null);
  }

  // ------------------------------------------------------------- aviación
  private takeOff() {
    const slot = this.parkedJets.pop()!;
    slot.visible = false;
    this.jetSlot = slot;
    const jm = buildJetMesh(0x2b333d);
    this.scene.add(jm.group);
    const wp = this.craft.group.localToWorld(new THREE.Vector3(-8, CARRIER_DECK.deckY + 1.4, 85));
    this.jet = { group: jm.group, gearG: jm.gear, flameG: jm.flame, pos: wp.clone(), heading: this.heading, pitch: 0, roll: 0, speed: 0, throttle: 1, gear: true, hull: 120, boostT: 2.4, gunCool: 0 };
    this.missiles = CRAFTS.kraken.missiles;
    this.mode = "jet";
    this.lookPitch = -0.05;
    this.camPos.copy(wp).add(new THREE.Vector3(0, 8, -30));
    this.sfx.takeoff();
    this.pushMsg("¡DESPEGUE AUTORIZADO! W/S potencia · SHIFT postquemador · G ruedas · ESPACIO misil", "good");
  }

  private landJet() {
    if (!this.jet) return;
    this.scene.remove(this.jet.group);
    this.jet = null;
    if (this.jetSlot) { this.jetSlot.visible = true; this.parkedJets.push(this.jetSlot); this.jetSlot = null; }
    this.mode = "sea";
    this.missiles = CRAFTS.kraken.missiles;
    this.sfx.gearSfx();
    this.sfx.jingle();
    this.pushMsg("ATERRIZAJE COMPLETADO — caza rearmado y listo en cubierta", "good");
  }

  private jetDead(title: string, detail: string) {
    if (this.jet) { this.explosion(this.jet.pos.clone(), 2); this.scene.remove(this.jet.group); this.jet = null; }
    this.gameOver("estrellado", title, detail);
  }

  private playerPosWorld(): THREE.Vector3 {
    if (this.mode === "jet" && this.jet) return this.jet.pos.clone();
    if (this.mode === "captain" && this.captainShip) return this.captainShip.rig.group.position.clone();
    if (this.mode === "board" && this.boardShip) return this.boardShip.rig.group.position.clone();
    return this.craft.group.position.clone();
  }

  private updateJet(dt: number) {
    const j = this.jet!;
    const k = this.keys;
    if (j.boostT > 0) { j.boostT -= dt; j.throttle = 1; }
    else {
      const tIn = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
      j.throttle = clamp(j.throttle + tIn * dt * 0.8, 0.06, 1);
    }
    const burner = (k.has("ShiftLeft") || k.has("ShiftRight")) && j.throttle > 0.85;
    const maxS = burner ? 514 : 440; // hasta ~1000 nudos
    j.speed = lerp(j.speed, j.throttle * maxS, dt * (j.speed < 70 ? 2.1 : burner ? 1.6 : 1.0));
    // vuelo natural: el morro sigue al puntero con autoridad real y virajes con alabeo
    const airborne = j.speed > 62;
    const auth = airborne ? clamp(j.speed / 200, 0.45, 1.15) : 0.3;
    const yawErr = angDiff(j.heading, this.lookYaw);
    const maxYaw = 2.5 * auth;
    const dYaw = clamp(yawErr, -maxYaw * dt, maxYaw * dt);
    j.heading += dYaw;
    const targetPitch = airborne ? clamp(this.lookPitch * 1.55, -1.0, 1.0) : 0;
    j.pitch = lerp(j.pitch, targetPitch, dt * (airborne ? 3.0 : 5.0));
    const rollIn = (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) - (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0);
    // alabeo coordinado: el caza se inclina hacia dentro de la curva, como uno real
    const bank = clamp((-dYaw / Math.max(dt, 1e-4)) * 1.15, -1.05, 1.05);
    const targetRoll = airborne ? clamp(bank + rollIn * 0.7, -1.25, 1.25) : 0;
    j.roll = lerp(j.roll, targetRoll, dt * 3.6);
    j.heading += rollIn * 0.7 * dt * clamp(j.speed / 120, 0.15, 1);
    if (!airborne && Math.abs(j.roll) > 0.02) j.roll = lerp(j.roll, 0, dt * 6);
    const cp = Math.cos(j.pitch);
    const fwd = new THREE.Vector3(Math.sin(j.heading) * cp, Math.sin(j.pitch), Math.cos(j.heading) * cp);
    j.pos.addScaledVector(fwd, j.speed * dt);
    // tren de aterrizaje
    if (this.pressed.has("KeyG")) {
      j.gear = !j.gear;
      this.sfx.gearSfx();
      this.pushMsg(j.gear ? "Tren de aterrizaje ABAJO" : "Tren ARRIBA", "info");
    }
    j.gearG.visible = j.gear;
    j.flameG.visible = j.throttle > 0.78;
    j.flameG.scale.setScalar(burner ? 1.9 : 1);
    // suelo: cubierta del portaaviones o mar
    const local = this.craft.group.worldToLocal(j.pos.clone());
    const overDeck = Math.abs(local.x) < CARRIER_DECK.wid / 2 - 2 && Math.abs(local.z) < CARRIER_DECK.len / 2 - 4;
    const deckY = this.craft.group.position.y + CARRIER_DECK.deckY + 1.3;
    const seaFloor = waveH(j.pos.x, j.pos.z, this.t) + 1.1;
    const floor = overDeck ? deckY : seaFloor;
    if (j.pos.y <= floor + 0.05) {
      if (overDeck) {
        if (j.gear && j.speed < 130) { j.pos.y = floor; this.landJet(); return; }
        j.pos.y = floor;
        if (j.speed < 62) j.pitch = 0;
      } else {
        this.jetDead("CAZA PERDIDO EN EL MAR", "Tocaste el agua a " + Math.round(j.speed * 1.94) + " nudos. Los cazas no flotan.");
        return;
      }
    }
    if (j.pos.y < floor) j.pos.y = floor;
    if (j.pos.y > 1700) { j.pos.y = 1700; j.pitch = Math.min(j.pitch, 0); }
    // barrera del sonido
    this.sonicT -= dt;
    if (j.speed > 340 && this.sonicT <= 0) {
      this.sonicT = 1.4;
      this.sfx.boom();
      this.shake = Math.min(1.2, this.shake + 0.3);
      this.spawnP(j.pos.clone(), new THREE.Vector3(), 0.5, 3, 26, 0xe8f6ff, 0.5, 0, true);
    }
    j.group.position.copy(j.pos);
    j.group.rotation.y = j.heading;
    j.group.rotation.x = -j.pitch;
    j.group.rotation.z = j.roll;
    // cañón del caza
    j.gunCool -= dt;
    if (this.firing && j.gunCool <= 0) {
      j.gunCool = 1 / 13;
      const muzzle = j.pos.clone().addScaledVector(fwd, 7);
      this.muzzleFlash(muzzle);
      this.sfx.shot(false);
      const dir = this.camDir();
      const hit = this.raycastWorld(muzzle, dir, 1200);
      const end = hit ? hit.point : muzzle.clone().addScaledVector(dir, 900);
      this.tracer(muzzle, end, 0xffe08a);
      if (hit) this.applyHit(hit, 9, "craft");
      for (const pj of this.policeJets) {
        const toJ = pj.pos.clone().sub(muzzle);
        const t2 = toJ.dot(dir);
        if (t2 > 0 && t2 < 1200 && toJ.addScaledVector(dir, -t2).length() < 6) { this.hitPoliceJet(pj, 30); break; }
      }
      if (this.policeCarrier) {
        const pc = this.policeCarrier;
        const toC = pc.pos.clone().setY(pc.group.position.y + 12).sub(muzzle);
        const t3 = toC.dot(dir);
        if (t3 > 0 && toC.addScaledVector(dir, -t3).length() < 55) this.damagePoliceCarrier(4);
      }
    }
    // misiles del caza
    this.missileCool -= dt;
    if (this.pressed.has("Space")) {
      if (this.missiles > 0 && this.missileCool <= 0) this.launchMissile();
      else if (this.missiles <= 0) { this.pushMsg("Sin misiles — aterriza para rearmar", "warn"); this.sfx.empty(); }
    }
  }

  // ------------------------------------------------------------- fuerzas policiales aéreas
  private updatePoliceForces(dt: number) {
    const pc = this.policeCarrier;
    if (pc) {
      const toP = this.playerPosWorld().sub(pc.pos);
      toP.y = 0;
      const distP = toP.length();
      if (this.wanted >= 2 && distP > 320) {
        // caza al jugador: gira y avanza hacia él
        const desH = Math.atan2(toP.x, toP.z);
        pc.heading += clamp(angDiff(pc.heading, desH), -0.14 * dt, 0.14 * dt);
        const fwd = new THREE.Vector3(Math.sin(pc.heading), 0, Math.cos(pc.heading));
        pc.pos.addScaledVector(fwd, 11.5 * dt);
      } else {
        pc.heading += Math.sin(this.t * 0.06) * 0.03 * dt;
        const fwd = new THREE.Vector3(Math.sin(pc.heading), 0, Math.cos(pc.heading));
        pc.pos.addScaledVector(fwd, 5 * dt);
      }
      pc.pos.x = clamp(pc.pos.x, -MAP_LIMIT, MAP_LIMIT);
      pc.pos.z = clamp(pc.pos.z, -MAP_LIMIT, MAP_LIMIT);
      // misiles VLS desde la cubierta: dispara incluso a gran distancia
      this.pcMissileT -= dt;
      if (this.wanted >= 1 && distP < 2600 && this.pcMissileT <= 0) {
        this.pcMissileT = 3.1;
        for (const off of [-16, 16]) {
          const sp = pc.group.localToWorld(new THREE.Vector3(off, 26, -34));
          const gm = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 2.4, 3, 6), new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.5 }));
          body.rotation.x = Math.PI / 2;
          gm.add(body);
          gm.position.copy(sp);
          const aim = this.playerPosWorld().add(new THREE.Vector3(0, 3, 0));
          const vel = aim.sub(sp).normalize().multiplyScalar(235);
          this.scene.add(gm);
          this.enemyMissiles.push({ mesh: gm, vel, life: 12 });
        }
        this.sfx.jetMissile();
        if (distP < 1100) {
          this.sfx.alarm();
          this.pushMsg("¡SALVA DE MISILES DESDE EL PORTAAVIONES POLICIAL! Esquívelos", "danger");
        }
      }
      pc.group.position.set(pc.pos.x, waveH(pc.pos.x, pc.pos.z, this.t) * 0.55, pc.pos.z);
      pc.group.rotation.y = pc.heading;
      const on = Math.floor(this.t * 4) % 2 === 0;
      const la = pc.group.userData.lightA as THREE.PointLight;
      const lb = pc.group.userData.lightB as THREE.PointLight;
      if (la && lb) {
        if (this.wanted > 0) { la.intensity = on ? 400 : 0; lb.intensity = on ? 0 : 400; }
        else { la.intensity = 0; lb.intensity = 0; }
      }
      if (pc.hp < pc.maxHp * 0.5) {
        pc.smokeT -= dt;
        if (pc.smokeT <= 0) { pc.smokeT = 0.14; this.smoke(pc.group.position.clone().add(new THREE.Vector3(rand(-15, 15), 22, rand(-40, 40))), 2, true); }
      }
    }
    const nearCV = this.mode === "jet" && this.jet && pc ? this.jet.pos.distanceTo(pc.pos) < 1300 : false;
    const wantJets = this.wanted >= 3 || nearCV ? 5 : this.wanted >= 1 ? (this.mode === "jet" ? 4 : 3) : 0;
    this.jetLaunchT -= dt;
    if (pc && this.policeJets.length < wantJets && this.jetLaunchT <= 0) {
      this.jetLaunchT = 2.6;
      const jm = buildJetMesh(0xd8dde2, true);
      jm.flame.visible = true;
      this.scene.add(jm.group);
      const start = pc.pos.clone().add(new THREE.Vector3(rand(-10, 10), 34, rand(-10, 10)));
      const toP = this.playerPosWorld().sub(start);
      this.policeJets.push({ group: jm.group, flameG: jm.flame, pos: start, heading: Math.atan2(toP.x, toP.z), pitch: 0, speed: 130, hp: 60, fireT: 2 });
      this.pushMsg("¡CAZAS DE LA POLICÍA DESPEGAN DEL PORTAAVIONES!", "danger");
      this.sfx.alarm();
    }
    const target = this.playerPosWorld();
    for (const pj of this.policeJets) {
      const toT = target.clone().sub(pj.pos);
      const dist = toT.length();
      const desiredYaw = Math.atan2(toT.x, toT.z);
      pj.heading += clamp(angDiff(pj.heading, desiredYaw), -1.7 * dt, 1.7 * dt);
      const desiredPitch = Math.atan2(toT.y, Math.hypot(toT.x, toT.z));
      pj.pitch = lerp(pj.pitch, clamp(desiredPitch, -0.55, 0.55), dt * 1.6);
      const disengage = this.wanted < 1;
      pj.speed = lerp(pj.speed, disengage ? 320 : dist > 260 ? 300 : 215, dt * 0.8);
      const cp2 = Math.cos(pj.pitch);
      const fwd2 = new THREE.Vector3(Math.sin(pj.heading) * cp2, Math.sin(pj.pitch), Math.cos(pj.heading) * cp2);
      if (disengage) fwd2.y = Math.max(fwd2.y, 0.25);
      pj.pos.addScaledVector(fwd2, pj.speed * dt);
      const minAlt = waveH(pj.pos.x, pj.pos.z, this.t) + 14;
      if (pj.pos.y < minAlt) pj.pos.y = minAlt;
      if (pj.pos.y > 1300) pj.pos.y = 1300;
      pj.group.position.copy(pj.pos);
      pj.group.rotation.y = pj.heading;
      pj.group.rotation.x = -pj.pitch;
      pj.flameG.scale.setScalar(0.85 + Math.sin(this.t * 40 + pj.pos.x) * 0.15);
      if (!disengage && dist < 1600) {
        pj.fireT -= dt;
        if (pj.fireT <= 0) {
          pj.fireT = rand(3.2, 4.8);
          const gm = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 2.2, 3, 6), new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.5 }));
          body.rotation.x = Math.PI / 2;
          gm.add(body);
          gm.position.copy(pj.pos).addScaledVector(fwd2, 5);
          const aim = this.playerPosWorld().add(new THREE.Vector3(0, this.mode === "jet" ? 0 : 2, 0));
          const vel = aim.sub(gm.position).normalize().multiplyScalar(230);
          this.scene.add(gm);
          this.enemyMissiles.push({ mesh: gm, vel, life: 9 });
          this.sfx.jetMissile();
          if (dist < 500) this.pushMsg("¡MISIL ENEMIGO EN CAMINO!", "danger");
        }
      }
    }
    this.policeJets = this.policeJets.filter((pj) => {
      if (this.wanted < 3 && pj.pos.distanceTo(target) > 1500) { this.scene.remove(pj.group); return false; }
      return true;
    });
  }

  private hitPoliceJet(pj: PoliceJetEnt, dmg: number) {
    pj.hp -= dmg;
    this.hitT = performance.now();
    this.sfx.hit();
    this.burst(pj.pos.clone(), 6, 0xffd070, 8, 0.35, 0.6, 5);
    if (pj.hp <= 0) {
      this.explosion(pj.pos.clone(), 1.4);
      this.scene.remove(pj.group);
      this.policeJets = this.policeJets.filter((x) => x !== pj);
      this.kills++;
      this.money += 15000;
      this.pushMsg("CAZA POLICIAL DERRIBADO +$15.000", "good");
      this.sfx.sell();
    }
  }

  private damagePoliceCarrier(d: number) {
    const pc = this.policeCarrier;
    if (!pc) return;
    pc.hp -= d;
    this.hitT = performance.now();
    this.raiseWanted(2);
    if (pc.hp <= 0) {
      const p = pc.group.position.clone().add(new THREE.Vector3(0, 12, 0));
      this.explosion(p, 2.6);
      this.explosion(p.clone().add(new THREE.Vector3(30, 6, -40)), 2);
      this.explosion(p.clone().add(new THREE.Vector3(-25, 8, 50)), 2);
      for (const pj of this.policeJets) this.scene.remove(pj.group);
      this.policeJets = [];
      this.scene.remove(pc.group);
      this.policeCarrier = null;
      this.wanted = Math.max(0, this.wanted - 2);
      this.money += 60000;
      this.pushMsg("¡PORTAAVIONES POLICIAL HUNDIDO! +$60.000 — la caza amaina", "money");
      this.sfx.sell();
    }
  }

  private updateEnemyMissiles(dt: number) {
    const target = this.playerPosWorld().add(new THREE.Vector3(0, this.mode === "jet" ? 0 : 2, 0));
    for (const em of this.enemyMissiles) {
      em.life -= dt;
      const toT = target.clone().sub(em.mesh.position);
      const d = toT.length();
      const cur = em.vel.clone().normalize().lerp(toT.normalize(), clamp(dt * 2.8, 0, 1)).normalize();
      em.vel = cur.multiplyScalar(215);
      em.mesh.position.addScaledVector(em.vel, dt);
      em.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), cur);
      if (Math.random() < 0.7) this.spawnP(em.mesh.position.clone(), new THREE.Vector3(rand(-0.5, 0.5), rand(-0.2, 0.6), rand(-0.5, 0.5)), 0.5, 0.8, 2, 0xcfe8ee, 0.4, -0.5, true);
      if (d < 15) {
        this.explosion(em.mesh.position.clone(), 1.1);
        this.damagePlayer(this.mode === "jet" ? 26 : 18);
        em.life = 0;
      } else if (em.mesh.position.y < waveH(em.mesh.position.x, em.mesh.position.z, this.t) + 0.4) {
        this.splash(em.mesh.position.clone(), 1);
        em.life = 0;
      }
    }
    this.enemyMissiles = this.enemyMissiles.filter((em) => {
      if (em.life <= 0) { this.scene.remove(em.mesh); return false; }
      return true;
    });
    // aviso del misil entrante más cercano (para esquivarlo a tiempo)
    this.missileWarn = null;
    const pw = this.playerPosWorld();
    const hd = this.mode === "jet" && this.jet ? this.jet.heading : this.heading;
    let best = 560;
    for (const em of this.enemyMissiles) {
      const dx = em.mesh.position.x - pw.x;
      const dz = em.mesh.position.z - pw.z;
      const d = Math.hypot(dx, dz);
      if (d < best) {
        best = d;
        this.missileWarn = { dist: d, angle: Math.atan2(dx, dz) - hd };
      }
    }
  }

  private toLocal(m: Merchant, world: THREE.Vector3): THREE.Vector3 {
    const mp = m.rig.group.position;
    const dx = world.x - mp.x, dz = world.z - mp.z;
    const h = m.heading;
    return new THREE.Vector3(dx * Math.cos(h) - dz * Math.sin(h), 0, dx * Math.sin(h) + dz * Math.cos(h));
  }
  private toWorld(m: Merchant, local: THREE.Vector3): THREE.Vector3 {
    const mp = m.rig.group.position;
    const h = m.heading;
    return new THREE.Vector3(
      mp.x + local.x * Math.cos(h) + local.z * Math.sin(h),
      mp.y + local.y,
      mp.z - local.x * Math.sin(h) + local.z * Math.cos(h)
    );
  }

  private torpedoImpact(m: Merchant, at: THREE.Vector3) {
    const surface = at.clone(); surface.y = waveH(at.x, at.z, this.t);
    this.explosion(surface, 1.7);
    this.splash(surface, 2.2);
    this.torpHits++;
    m.hp -= 24;
    this.raiseWanted(3);
    this.alertMerchant(m);
    this.pushMsg(`¡IMPACTO DE TORPEDO EN ${m.name}!`, "danger");
    this.finishImpact(m);
  }

  // daños finales tras un impacto pesado (torpedo / misil)
  private finishImpact(m: Merchant) {
    if (m.hp <= 0 && m.state !== "sinking") {
      m.state = "sinking";
      m.baseSpeed = 0;
      this.pushMsg(`${m.name} SE HUNDE — la mercancía se pierde en el fondo`, "danger");
    } else if (m.hp <= 55 && m.state === "sail") {
      m.state = "disabled";
      m.baseSpeed = 0;
      this.pushMsg(`${m.name} AVERIADO — motores muertos, abordar será más fácil`, "good");
    }
  }

  // ------------------------------------------------------------- misiles aéreos
  private launchMissile() {
    // punto de impacto: donde apunta la mira
    const dir = this.camDir();
    const from = this.camera.position.clone();
    const hit = this.raycastWorld(from, dir, 3000);
    const end = hit
      ? hit.point.clone()
      : from.clone().addScaledVector(dir, 850).setY(waveH(from.x + dir.x * 850, from.z + dir.z * 850, this.t));
    const start = new THREE.Vector3();
    if (this.mode === "jet" && this.jet) {
      start.copy(this.jet.pos).addScaledVector(this.camDir(), 6);
    } else {
      this.craft.bowAnchor.getWorldPosition(start);
      start.y = Math.max(start.y, waveH(start.x, start.z, this.t)) + 1.5;
    }
    const dist = start.distanceTo(end);
    // cohete BR-8
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 2.6, 4, 8), new THREE.MeshStandardMaterial({ color: 0x5a6470, roughness: 0.4, metalness: 0.5 }));
    body.rotation.x = Math.PI / 2;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0xd84040, roughness: 0.5 }));
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 1.9;
    g.add(nose);
    for (const fx of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.6 }));
      fin.position.set(fx * 0.3, 0, -1.3);
      g.add(fin);
    }
    g.position.copy(start);
    this.scene.add(g);
    this.missilesFly.push({ mesh: g, start: start.clone(), end, t: 0, dur: clamp(dist / 95, 0.7, 4.5), arc: clamp(dist * 0.4, 30, 320) });
    this.missiles--;
    this.missileCool = 1.6;
    this.sfx.missileLaunch();
    this.raiseWanted(2);
    this.shake = Math.min(1.4, this.shake + 0.35);
    this.pushMsg("¡MISIL BR-8 EN EL AIRE!", "info");
  }

  private updateMissiles(dt: number) {
    for (const mi of this.missilesFly) {
      mi.t += dt / mi.dur;
      const k = Math.min(1, mi.t);
      const pos = mi.start.clone().lerp(mi.end, k);
      pos.y += mi.arc * Math.sin(Math.PI * k);
      mi.mesh.position.copy(pos);
      // orientar según la trayectoria
      const k2 = Math.min(1, mi.t + 0.03);
      const next = mi.start.clone().lerp(mi.end, k2);
      next.y += mi.arc * Math.sin(Math.PI * k2);
      mi.mesh.lookAt(next);
      // estela de fuego + humo
      this.spawnP(pos, new THREE.Vector3(rand(-0.5, 0.5), rand(-0.3, 0.5), rand(-0.5, 0.5)), 0.35, 1.4, 0.2, 0xffa040, 0.9, 0, true);
      if (Math.random() < 0.8) this.smoke(pos, 1);
      if (mi.t >= 1) {
        this.missileImpact(mi.end);
        this.scene.remove(mi.mesh);
      }
    }
    this.missilesFly = this.missilesFly.filter((mi) => mi.t < 1);
  }

  private missileImpact(at: THREE.Vector3) {
    // ¿le dio a un barco? (caja del casco en horizontal)
    let target: Merchant | null = null;
    for (const m of this.merchants) {
      if (m.state === "sinking" || m.state === "sold" || m.hijacked) continue;
      const local = this.toLocal(m, at);
      const d = m.rig.deck;
      if (Math.abs(local.x) < d.wid / 2 + 3 && Math.abs(local.z) < d.len / 2 + 5) { target = m; break; }
    }
    if (target) {
      const p = at.clone();
      p.y = Math.max(p.y, waveH(p.x, p.z, this.t) + 1);
      this.explosion(p, 2.1);
      this.missileHits++;
      target.hp -= 38; // más que un torpedo: el misil aéreo es lo que más daño hace
      this.raiseWanted(3);
      this.alertMerchant(target);
      this.pushMsg(`¡IMPACTO DIRECTO DE MISIL EN ${target.name}! (−38)`, "danger");
      this.finishImpact(target);
      return;
    }
    for (const pt of this.patrols) {
      if (pt.rig.group.position.distanceTo(at) < 16) {
        this.missileHits++;
        this.explosion(pt.rig.group.position.clone().add(new THREE.Vector3(0, 2, 0)), 1.7);
        this.destroyPatrol(pt);
        return;
      }
    }
    // al agua
    const s = at.clone();
    s.y = waveH(s.x, s.z, this.t);
    this.explosion(s, 1.1);
    this.splash(s, 2.4);
  }

  // ------------------------------------------------------------- abordaje
  private startBoarding(m: Merchant, side: "proa" | "popa") {
    this.mode = "board";
    this.boardShip = m;
    m.boarded = true;
    m.anchorY = m.rig.group.position.y;
    m.baseSpeed = 0;
    this.raiseWanted(4);
    this.sfx.alarm();
    this.sfx.horn();
    // escalera de abordaje
    const d = m.rig.deck;
    const ladder = new THREE.Group();
    const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.5, metalness: 0.7 });
    for (const s of [-0.5, 0.5]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 9, 0.12), railMat);
      rail.position.set(s, -3.5, 0);
      ladder.add(rail);
    }
    for (let i = 0; i < 7; i++) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.1), railMat);
      rung.position.set(0, -0.5 - i * 1.15, 0);
      ladder.add(rung);
    }
    const lz = side === "proa" ? d.len / 2 - 5 : -d.len / 2 + 18;
    ladder.position.set(d.wid / 2 - 0.2, d.deckY + 0.4, lz);
    ladder.rotation.y = Math.PI / 2;
    m.rig.group.add(ladder);
    // pirata a bordo (junto a la escalera)
    this.pirate = buildCharacter("pirate");
    this.pirate.group.position.set(d.wid / 2 - 2.2, d.deckY + 0.4, lz);
    m.rig.group.add(this.pirate.group);
    this.lookYaw = m.heading + (side === "proa" ? Math.PI : 0);
    this.mag = 30;
    this.reloading = false;
    this.health = Math.min(100, this.health + 15);
    this.pushMsg(`¡A BORDO DE ${m.name}! La alarma suena — vienen los guardias`, "danger");
    this.pushMsg(m.boss ? "Elimina al JEFE DE SEGURIDAD (chaleco negro, boina roja)" : "Sube al puente y apunta al capitán", "info");
    // ocultar craft (queda atrás)
    this.craft.group.visible = false;
  }

  private updateBoard(dt: number) {
    const m = this.boardShip!;
    const d = m.rig.deck;
    const p = this.pirate!.group;
    const k = this.keys;

    // movimiento relativo a la cámara
    const move = new THREE.Vector3();
    if (k.has("KeyW") || k.has("ArrowUp")) move.z += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) move.z -= 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) move.x += 1;
    if (k.has("KeyD") || k.has("ArrowRight")) move.x -= 1;
    const sprint = k.has("ShiftLeft") ? 9.5 : 6;
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(sprint * dt);
      move.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lookYaw);
      p.position.x += move.x;
      p.position.z += move.z;
      p.rotation.y = this.lookYaw;
      // choque con cajas
      for (const b of d.boxes) {
        const px = p.position.x - b.x, pz = p.position.z - b.z;
        const ox = b.hx + 0.55 - Math.abs(px);
        const oz = b.hz + 0.55 - Math.abs(pz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) p.position.x += Math.sign(px) * ox;
          else p.position.z += Math.sign(pz) * oz;
        }
      }
      // límites de cubierta
      const limX = d.railHalf + 0.2;
      p.position.x = clamp(p.position.x, -limX, limX);
      p.position.z = clamp(p.position.z, -d.len / 2 + 1.5, d.len / 2 - 1.5);
      // puente bloqueado
      const bz = -d.len / 2 + 10;
      if (Math.abs(p.position.x) < d.wid * 0.42 && p.position.z < bz + 7.6 && p.position.z > bz - 8) {
        p.position.z = bz + 7.6;
      }
      // red eléctrica
      if (m.kind !== "yacht" && Math.abs(p.position.x) > d.railHalf - 0.75) {
        this.netT -= dt;
        if (this.netT <= 0) {
          this.netT = 0.55;
          this.damagePlayer(11);
          this.sfx.buzz();
          const wp = this.toWorld(m, p.position).add(new THREE.Vector3(0, 1.4, 0));
          this.burst(wp, 8, 0xffa030, 9, 0.4, 0.7, 4);
          p.position.x = Math.sign(p.position.x) * (d.railHalf - 1.4);
        }
      }
      // bob al caminar
      p.position.y = d.deckY + 0.4 + Math.abs(Math.sin(this.t * 11)) * 0.09;
    }

    // recarga
    if (this.pressed.has("KeyR") && !this.reloading && this.mag < 30) {
      this.reloading = true;
      this.reloadT = 1.6;
      this.sfx.reload();
    }
    if (this.reloading) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { this.reloading = false; this.mag = 30; }
    }

    // disparo con rifle
    this.fireCool -= dt;
    if (this.firing && !this.reloading && this.fireCool <= 0) {
      if (this.mag <= 0) {
        this.sfx.empty();
        this.fireCool = 0.3;
        this.reloading = true;
        this.reloadT = 1.6;
        this.sfx.reload();
      } else {
        this.mag--;
        this.fireCool = 1 / 8.5;
        const muzzle = new THREE.Vector3();
        (this.pirate as CharRig).gunTip.getWorldPosition(muzzle);
        this.muzzleFlash(muzzle);
        this.sfx.shot(false);
        const dir = this.camDir();
        const hit = this.raycastWorld(muzzle, dir, 400);
        const end = hit ? hit.point : muzzle.clone().addScaledVector(dir, 300);
        this.tracer(muzzle, end, 0xffe08a);
        if (hit) this.applyHit(hit, 34, "rifle");
      }
    }

    // guardias
    const playerW = this.toWorld(m, p.position);
    for (const g of m.guards) {
      if (!g.alive) {
        if (g.fallT > 0 && g.fallT < 1) {
          g.fallT += dt * 2.4;
          g.rig.group.rotation.x = Math.min(Math.PI / 2, g.fallT * Math.PI / 2);
          if (g.fallT >= 1) g.fallT = 1;
        } else if (g.fallT >= 1) {
          g.fallT += dt * 0.25;
          if (g.fallT > 2) g.rig.group.visible = false;
        }
        continue;
      }
      const gw = this.toWorld(m, g.local);
      const dist = gw.distanceTo(playerW);
      g.rig.group.position.set(g.local.x, d.deckY + 0.4, g.local.z);
      // mirar al jugador
      const look = Math.atan2(playerW.x - gw.x, playerW.z - gw.z) - m.heading;
      g.rig.group.rotation.y = look;
      // acercarse / ametrallar
      if (dist > 11) {
        const dirW = playerW.clone().sub(gw).normalize();
        const sway = Math.sin(this.t * 2 + g.strafeSeed) * 0.35;
        const step = dirW.clone().multiplyScalar(3.4 * dt);
        step.x += -dirW.z * sway * dt * 3;
        step.z += dirW.x * sway * dt * 3;
        const nl = this.toLocal(m, gw.add(step));
        g.local.x = clamp(nl.x, -d.railHalf + 1.2, d.railHalf - 1.2);
        g.local.z = clamp(nl.z, -d.len / 2 + 3, d.len / 2 - 3);
        // no atravesar cajas
        for (const b of d.boxes) {
          const px = g.local.x - b.x, pz = g.local.z - b.z;
          const ox = b.hx + 0.7 - Math.abs(px);
          const oz = b.hz + 0.7 - Math.abs(pz);
          if (ox > 0 && oz > 0) {
            if (ox < oz) g.local.x += Math.sign(px) * ox;
            else g.local.z += Math.sign(pz) * oz;
          }
        }
      }
      // fuego en ráfagas
      if (dist < 55) {
        g.fireT -= dt;
        if (g.burstLeft > 0) {
          g.burstT -= dt;
          if (g.burstT <= 0) {
            g.burstT = 0.1;
            g.burstLeft--;
            this.guardShoot(g, gw, playerW, dist);
          }
        } else if (g.fireT <= 0) {
          g.fireT = g.isBoss ? 1.3 : rand(1.5, 2.2);
          g.burstLeft = g.isBoss ? 5 : 3;
          g.burstT = 0;
        }
      }
    }

    // interacción con el capitán
    const capW = this.toWorld(m, m.captainRig.group.position);
    const capDist = capW.distanceTo(playerW);
    this.canInteract = null;
    this.progress = -1;
    this.progressKind = null;
    if (capDist < 5) {
      if (m.boss && m.boss.alive) {
        this.canInteract = "EL JEFE DE SEGURIDAD SIGUE VIVO — ELIMÍNALO";
      } else {
        this.canInteract = "APUNTA AL CAPITÁN — MANTÉN E PARA SECUESTRAR EL BARCO";
        if (this.keys.has("KeyE")) {
          this.progressKind = "hijack";
          this.progress = clamp(this.progress + dt / 2.4, 0, 1);
          if (this.progress >= 1) this.doHijack(m);
        } else {
          this.progress = 0;
        }
      }
    }
    if (this.progressKind !== "hijack") this.progress = -1;
  }
  private netT = 0;

  private guardShoot(g: GuardEnt, gw: THREE.Vector3, playerW: THREE.Vector3, dist: number) {
    const from = gw.clone().add(new THREE.Vector3(0, 1.5, 0));
    this.muzzleFlash(from.clone());
    this.sfx.enemyShot();
    const acc = clamp((g.isBoss ? 0.5 : 0.36) - dist * 0.005, 0.08, 0.5);
    const target = playerW.clone().add(new THREE.Vector3(0, 1.2, 0));
    if (Math.random() < acc) {
      this.tracer(from, target, 0xff5a4a);
      this.damagePlayer(g.isBoss ? 9 : 6);
      this.burst(target, 4, 0xff6a4a, 5, 0.3, 0.4, 4);
    } else {
      const miss = target.clone().add(new THREE.Vector3(rand(-3.5, 3.5), rand(-1.5, 2.5), rand(-3.5, 3.5)));
      this.tracer(from, miss, 0xff5a4a);
    }
  }

  private doHijack(m: Merchant) {
    this.mode = "captain";
    this.captainShip = m;
    m.hijacked = true;
    m.boarded = false;
    m.state = "sail";
    m.baseSpeed = 4.2;
    this.shipHull = this.shipHullMax;
    this.wanted = 5;
    this.health = Math.min(100, this.health + 35);
    this.sfx.horn();
    this.sfx.jingle();
    this.sellBeacon.visible = true;
    // los guardias restantes se rinden
    for (const g of m.guards) {
      if (g.alive) { g.alive = false; g.fallT = 0.001; }
    }
    // el pirata toma el puente
    const d = m.rig.deck;
    this.pirate!.group.position.set(d.bridgeLocal.x - d.wid * 0.2, d.deckY + 0.4, d.bridgeLocal.z + 8.2);
    this.pushMsg(`¡${m.name} SECUESTRADO! AHORA ERES EL CAPITÁN`, "good");
    this.pushMsg("Lleva el barco al punto de venta (haz dorado en el radar). ¡Toda la policía te persigue!", "danger");
  }

  // ------------------------------------------------------------- modo capitán
  private updateCaptain(dt: number) {
    const m = this.captainShip!;
    const k = this.keys;
    const tIn = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 0.5 : 0);
    this.throttle = lerp(this.throttle, tIn, dt * 1.2);
    this.shipSpeed = lerp(this.shipSpeed, this.throttle * m.baseSpeed, dt * 0.5);
    const turnIn = (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) - (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0);
    m.heading += turnIn * 0.28 * dt * clamp(Math.abs(this.shipSpeed) / 2, 0.3, 1);
    const fwd = new THREE.Vector3(Math.sin(m.heading), 0, Math.cos(m.heading));
    const pos = m.rig.group.position;
    pos.addScaledVector(fwd, this.shipSpeed * dt);
    this.clampMap(pos);
    m.rig.group.rotation.y = m.heading;
    const e = 4;
    const hC = waveH(pos.x, pos.z, this.t) * 0.55;
    const hF = waveH(pos.x + fwd.x * e, pos.z + fwd.z * e, this.t) * 0.55;
    pos.y = hC;
    m.rig.group.rotation.x = Math.atan2(hC - hF, e) * 0.5;

    // espuma de proa
    if (Math.abs(this.shipSpeed) > 1.5 && Math.random() < 0.5) {
      const bowW = this.toWorld(m, new THREE.Vector3(rand(-4, 4), 0.6, m.rig.deck.len / 2));
      this.spawnP(bowW, new THREE.Vector3(rand(-1.5, 1.5), rand(0.5, 2), rand(-1.5, 1.5)), 0.8, 2, 4.5, 0xd8f4f4, 0.5, 3, true);
    }
    // humo de chimenea
    m.smokeT -= dt;
    if (m.smokeT <= 0 && Math.abs(this.throttle) > 0.2) {
      m.smokeT = 0.25;
      const sp = this.toWorld(m, m.rig.deck.smokePoint);
      this.smoke(sp, 1);
    }

    // vender
    const dSell = pos.distanceTo(this.sellPoint);
    this.canInteract = null;
    this.progress = -1;
    this.progressKind = null;
    if (dSell < 110) {
      if (Math.abs(this.shipSpeed) < 2.2) {
        this.canInteract = "MANTÉN E PARA ATRACAR Y VENDER LA MERCANCÍA";
        if (this.keys.has("KeyE")) {
          this.progressKind = "sell";
          this.progress = clamp(this.progress + dt / 2.6, 0, 1);
          if (this.progress >= 1) this.sellCargo(m);
        } else this.progress = 0;
      } else {
        this.canInteract = "REDUCE VELOCIDAD PARA ATRACAR";
      }
    }
  }

  private sellCargo(m: Merchant) {
    this.money += m.value;
    this.contracts++;
    this.sfx.sell();
    this.pushMsg(`MERCANCÍA VENDIDA: +$${m.value.toLocaleString("es-ES")} · TOTAL $${this.money.toLocaleString("es-ES")}`, "money");
    this.pushMsg("Contrato completado. Nueva presa en el radar.", "good");
    // alejar el barco vendido
    m.state = "sold";
    m.hijacked = false;
    m.baseSpeed = 3;
    const away = m.rig.group.position.clone().normalize().multiplyScalar(2600);
    m.rig.group.position.add(away);
    m.wp.copy(m.rig.group.position).add(new THREE.Vector3(rand(-800, 800), 0, rand(-800, 800)));
    // quitar pirata del barco
    if (this.pirate) { m.rig.group.remove(this.pirate.group); this.pirate = null; }
    this.captainShip = null;
    this.sellBeacon.visible = false;
    // reaparecer en la lancha, reparado
    this.mode = "sea";
    this.craft.group.visible = true;
    const kinds: MerchantKind[] = ["cargo", "tanker", "yacht", "liner"];
    const nk = kinds[Math.floor(rand(0, Math.random() < 0.25 ? 4 : 3))];
    const names = ["MV CORSAIRO", "MV NEPTUNO", "MV TEMPESTAD", "CARGUERO ORIÓN", "PETROLERO VULCANO"];
    const ang = rand(0, Math.PI * 2);
    const here = this.sellPoint.clone(); // referencia: cerca de la cala
    const spawn = new THREE.Vector3(
      clamp(here.x + Math.cos(ang) * rand(900, 1300), -MAP_LIMIT + 200, MAP_LIMIT - 200),
      0,
      clamp(here.z + Math.sin(ang) * rand(900, 1300), -MAP_LIMIT + 200, MAP_LIMIT - 200)
    );
    const pp = this.craft.group.position;
    pp.set(spawn.x, waveH(spawn.x, spawn.z, this.t) + 0.4, spawn.z);
    this.spawnMerchant(nk, names[Math.floor(rand(0, names.length))], 0, 0);
    const nm = this.merchants[this.merchants.length - 1];
    nm.rig.group.position.copy(spawn);
    this.heading = Math.atan2(spawn.x - pp.x, spawn.z - pp.z);
    this.speed = 0;
    this.throttle = 0;
    this.hull = Math.min(this.hullMax, this.hull + this.hullMax * 0.5);
    this.health = Math.min(100, this.health + 40);
    this.torps = CRAFTS[this.craftId].torpedoes;
    this.missiles = CRAFTS[this.craftId].missiles;
    this.wanted = 2;
    this.submerged = false;
    // limpiar mercantes vendidos y lejanos
    this.merchants = this.merchants.filter((x) => {
      if (x.state === "sold" || x.state === "sinking") {
        if (x.rig.group.position.distanceTo(this.craft.group.position) > 1600) {
          this.scene.remove(x.rig.group);
          return false;
        }
      }
      return true;
    });
  }

  // ------------------------------------------------------------- mercantes IA
  private updateMerchants(dt: number) {
    // refuerzos: que nunca falten presas en el mar
    const alive = this.merchants.filter((m) => m.state === "sail" || m.state === "disabled").length;
    if (alive < 2 && Math.random() < dt * 0.35) {
      const anchor = this.mode === "captain" && this.captainShip ? this.captainShip.rig.group.position : this.craft.group.position;
      const ang = rand(0, Math.PI * 2);
      const kinds: MerchantKind[] = ["cargo", "tanker", "yacht"];
      this.spawnMerchant(kinds[Math.floor(rand(0, 3))], "MV FORTUNA", 0, 0);
      const nm = this.merchants[this.merchants.length - 1];
      nm.rig.group.position.set(
        clamp(anchor.x + Math.cos(ang) * 1100, -MAP_LIMIT + 150, MAP_LIMIT - 150), 0,
        clamp(anchor.z + Math.sin(ang) * 1100, -MAP_LIMIT + 150, MAP_LIMIT - 150)
      );
      nm.detected = false;
      this.pushMsg("Nuevo contacto mercante entra en la zona", "info");
    }
    for (const m of this.merchants) {
      const g = m.rig.group;
      m.alertT = Math.max(0, m.alertT - dt);

      // esquivar torpedos: los cascos pesados apenas giran (y averiados, nada)
      let dodging = false;
      if (m.state === "sail") {
        for (const t of this.torpedoes) {
          const toT = t.mesh.position.clone().sub(g.position);
          const dist = toT.length();
          if (dist < 320) {
            const closing = toT.normalize().dot(t.dir) < -0.55;
            if (closing) {
              dodging = true;
              const away = Math.atan2(-toT.x, -toT.z) + Math.PI / 2;
              // giro muy lento: ~5°/s — casi nunca les da tiempo
              m.heading += clamp(angDiff(m.heading, away), -0.045 * dt, 0.045 * dt) * 2;
            }
          }
        }
      }
      if (dodging && Math.random() < 0.3 && m.alertT <= 0) {
        this.pushMsg(`${m.name} detecta el torpedo y trata de girar...`, "warn");
        m.alertT = 4;
        this.sfx.alarm();
      }

      // navegación
      if (m.state === "sail" && !m.hijacked && !m.boarded) {
        const toWp = m.wp.clone().sub(g.position);
        toWp.y = 0;
        if (toWp.length() < 120) {
          m.wp.set(rand(-2300, 2300), 0, rand(-2300, 2300));
        }
        const desired = Math.atan2(toWp.x, toWp.z);
        // timón pesado: los mercantes trazan rutas amplias, no viran en seco
        m.heading += clamp(angDiff(m.heading, desired), -0.06 * dt, 0.06 * dt) * 2.4;
        m.speed = lerp(m.speed, m.baseSpeed, dt * 0.4);
      } else if (m.boarded && !m.hijacked) {
        m.speed = lerp(m.speed, 0, dt * 1.2);
      } else if (m.hijacked) {
        m.speed = this.shipSpeed;
      } else {
        m.speed = lerp(m.speed, m.baseSpeed, dt * 0.3);
      }
      if (m.state === "sinking") m.speed = 0;
      if (!m.hijacked) {
        const fwd = new THREE.Vector3(Math.sin(m.heading), 0, Math.cos(m.heading));
        g.position.addScaledVector(fwd, m.speed * dt);
      }
      g.rotation.y = m.heading;

      // flotación
      if (this.mode === "board" && m === this.boardShip) {
        g.position.y = m.anchorY;
        g.rotation.x = 0;
        g.rotation.z = 0;
      } else {
        const h = waveH(g.position.x, g.position.z, this.t) * 0.55;
        g.position.y = h;
        const e = 5;
        const fwd2 = new THREE.Vector3(Math.sin(m.heading), 0, Math.cos(m.heading));
        const hF = waveH(g.position.x + fwd2.x * e, g.position.z + fwd2.z * e, this.t) * 0.55;
        g.rotation.x = Math.atan2(h - hF, e) * 0.5;
        g.rotation.z = Math.sin(this.t * 0.5 + g.position.x) * 0.012;
      }

      // hundimiento
      if (m.state === "sinking") {
        m.sinkT += dt / 9;
        g.position.y -= dt * 1.3;
        g.rotation.z = m.sinkT * 0.55;
        if (Math.random() < 0.25) {
          this.smoke(g.position.clone().add(new THREE.Vector3(rand(-8, 8), m.rig.deck.deckY, rand(-20, 20))), 1, true);
        }
        if (m.sinkT > 1.4) {
          this.scene.remove(g);
          m.state = "sold";
          this.merchants = this.merchants.filter((x) => x !== m);
        }
      }

      // humo si está averiado
      if (m.state === "disabled") {
        m.smokeT -= dt;
        if (m.smokeT <= 0) {
          m.smokeT = 0.16;
          const sp = this.toWorld(m, m.rig.deck.smokePoint);
          this.smoke(sp, 2, true);
        }
        m.rig.netMat.emissiveIntensity = 1.4 + Math.sin(this.t * 8) * 0.8;
      }
    }
  }

  // ------------------------------------------------------------- patrullas
  private updatePatrols(dt: number) {
    const desired = clamp(1 + this.wanted, 2, 5);
    if (this.patrols.length < desired && Math.random() < dt * 0.4) {
      this.spawnPatrol(rand(0, 6.28), rand(700, 1000));
      this.pushMsg("Nueva patrullera en la zona", "warn");
    }
    const chaseTarget =
      this.mode === "captain" && this.captainShip ? this.captainShip.rig.group.position
        : this.mode === "board" && this.boardShip ? this.boardShip.rig.group.position
        : this.craft.group.position;
    for (const p of this.patrols) {
      const g = p.rig.group;
      const toT = chaseTarget.clone().sub(g.position);
      toT.y = 0;
      const dist = toT.length();
      const chasing = this.wanted > 0;
      if (chasing) {
        const desired2 = Math.atan2(toT.x, toT.z);
        p.heading += clamp(angDiff(p.heading, desired2), -1.1 * dt, 1.1 * dt);
        p.speed = lerp(p.speed, dist > 55 ? 15.5 : 6, dt * 1.2);
      } else {
        const toWp = p.wp.clone().sub(g.position);
        if (toWp.length() < 100) p.wp.set(rand(-2400, 2400), 0, rand(-2400, 2400));
        const desired3 = Math.atan2(toWp.x, toWp.z);
        p.heading += clamp(angDiff(p.heading, desired3), -0.7 * dt, 0.7 * dt);
        p.speed = lerp(p.speed, 7, dt);
      }
      const fwd = new THREE.Vector3(Math.sin(p.heading), 0, Math.cos(p.heading));
      g.position.addScaledVector(fwd, p.speed * dt);
      g.position.x = clamp(g.position.x, -MAP_LIMIT - 200, MAP_LIMIT + 200);
      g.position.z = clamp(g.position.z, -MAP_LIMIT - 200, MAP_LIMIT + 200);
      const h = waveH(g.position.x, g.position.z, this.t);
      g.position.y = h + 0.3;
      g.rotation.y = p.heading;
      const e = 3;
      const hF = waveH(g.position.x + fwd.x * e, g.position.z + fwd.z * e, this.t);
      g.rotation.x = Math.atan2(h - hF, e) * 0.6;
      g.rotation.z = Math.sin(this.t * 2 + g.position.z) * 0.04;

      // torreta apunta al objetivo
      p.rig.turret.rotation.y = clamp(angDiff(p.heading, Math.atan2(toT.x, toT.z)), -1.3, 1.3);

      // luces
      if (chasing) {
        const on = Math.floor(this.t * 5) % 2 === 0;
        p.rig.lightA.intensity = on ? 260 : 0;
        p.rig.lightB.intensity = on ? 0 : 260;
      } else {
        p.rig.lightA.intensity = 0;
        p.rig.lightB.intensity = 0;
      }

      // fuego
      if (chasing && dist < 190) {
        p.fireT -= dt;
        if (p.burstLeft > 0) {
          p.burstT -= dt;
          if (p.burstT <= 0) {
            p.burstT = 0.085;
            p.burstLeft--;
            const muzzle = new THREE.Vector3();
            p.rig.muzzle.getWorldPosition(muzzle);
            this.muzzleFlash(muzzle);
            this.sfx.enemyShot();
            const aimY = this.mode === "captain" ? 9 : Math.max(1.6, waveH(chaseTarget.x, chaseTarget.z, this.t) + 1.4);
            const targetP = chaseTarget.clone().add(new THREE.Vector3(0, aimY, 0));
            const acc = clamp(0.5 - dist * 0.0016, 0.12, 0.5);
            if (Math.random() < acc) {
              this.tracer(muzzle, targetP, 0x6ad0ff);
              this.damagePlayer(this.mode === "board" ? 5 : 4);
            } else {
              const miss = targetP.clone().add(new THREE.Vector3(rand(-7, 7), rand(-3, 5), rand(-7, 7)));
              this.tracer(muzzle, miss, 0x6ad0ff);
              if (Math.random() < 0.3) this.splash(miss.clone().setY(waveH(miss.x, miss.z, this.t)));
            }
          }
        } else if (p.fireT <= 0) {
          p.fireT = rand(1.4, 2.1);
          p.burstLeft = 5;
          p.burstT = 0;
        }
      }

      // estela
      if (Math.abs(p.speed) > 5 && Math.random() < 0.4) {
        const stern = g.position.clone().addScaledVector(fwd, -10);
        stern.y = h + 0.3;
        this.spawnP(stern, new THREE.Vector3(rand(-1, 1), rand(0.3, 1), rand(-1, 1)), 0.6, 1.4, 2.8, 0xd8f4f4, 0.4, 1, true);
      }

      // arresto
      if (chasing && dist < 34 && this.mode === "sea") {
        if (Math.abs(this.speed) < 3.5) {
          this.arrestT += dt;
          if (this.arrestT > 1 && performance.now() - this.arrestWarnT > 4000) {
            this.arrestWarnT = performance.now();
            this.pushMsg("¡TE ESTÁN DANDO EL ALTO! ¡ACELERA O TE ARRESTAN!", "danger");
          }
          if (this.arrestT > 3.4) {
            this.gameOver("capturado", "ARRESTADO POR LA POLICÍA MARÍTIMA", "Te esposaron en cubierta con las bodegas llenas. El juez no estuvo para bromas.");
          }
        } else {
          this.arrestT = Math.max(0, this.arrestT - dt * 2);
        }
      } else if (chasing && dist < 48 && this.mode === "captain") {
        if (Math.abs(this.shipSpeed) < 1.6) {
          this.arrestT += dt;
          if (this.arrestT > 1 && performance.now() - this.arrestWarnT > 4000) {
            this.arrestWarnT = performance.now();
            this.pushMsg("¡VAN A ABORDAR EL BARCO! ¡NO TE DETENGAS!", "danger");
          }
          if (this.arrestT > 3.4) {
            this.gameOver("capturado", "ABORDAJE POLICIAL", "La patrulla tomó el puente y recuperó la mercancía. Fin del negocio.");
          }
        } else this.arrestT = Math.max(0, this.arrestT - dt * 2);
      } else {
        this.arrestT = Math.max(0, this.arrestT - dt * 2);
      }
    }
  }

  private updateWanted(dt: number) {
    if (this.mode === "captain" || this.mode === "board") return;
    if (this.wanted > 0) {
      const anyClose = this.patrols.some((p) => p.rig.group.position.distanceTo(this.craft.group.position) < 550);
      if (!anyClose) {
        this.wantedDecayT += dt;
        if (this.wantedDecayT > 22) {
          this.wantedDecayT = 0;
          this.wanted = clamp(this.wanted - 1, 0, 5);
          if (this.wanted === 0) this.pushMsg("La patrulla perdió tu rastro", "good");
        }
      } else this.wantedDecayT = 0;
    }
  }

  // ------------------------------------------------------------- FX update
  private updateFx(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vel.y -= p.grav * dt;
      p.s.position.addScaledVector(p.vel, dt);
      const k = 1 - p.life / p.maxLife;
      p.s.scale.setScalar(lerp(p.s0, p.s1, k));
      (p.s.material as THREE.SpriteMaterial).opacity = p.op * (p.life / p.maxLife);
    }
    this.particles = this.particles.filter((p) => {
      if (p.life <= 0) {
        this.scene.remove(p.s);
        p.s.material.dispose();
        return false;
      }
      return true;
    });
    for (const t of this.tracers) {
      t.life -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.09) * 0.9;
    }
    this.tracers = this.tracers.filter((t) => {
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashLight.intensity = 0;
    }
    this.shake = Math.max(0, this.shake - dt * 3.2);
  }

  // ------------------------------------------------------------- cámara
  private updateCamera(dt: number) {
    const targetPos = new THREE.Vector3();
    const lookAt = new THREE.Vector3();
    const back = new THREE.Vector3(Math.sin(this.lookYaw), 0, Math.cos(this.lookYaw));

    if (this.mode === "sea") {
      const p = this.craft.group.position;
      if (this.craftId === "kraken") {
        // el portaaviones es gigante: cámara fuera, bien alta y alejada
        const dist = this.zoom ? 150 : 118;
        const height = this.zoom ? 70 : 58;
        targetPos.copy(p).addScaledVector(back, -dist).add(new THREE.Vector3(0, height, 0));
        lookAt.copy(p).add(new THREE.Vector3(0, CARRIER_DECK.deckY * 0.55, 0)).addScaledVector(back, 30);
      } else {
        const dist = this.zoom ? 8 : this.craftId === "tiburon" ? 17 : this.craftId === "viuda" ? 24 : 13;
        const height = this.submerged ? 6.4 : this.zoom ? 3 : this.craftId === "viuda" ? 8 : 5.2;
        targetPos.copy(p).addScaledVector(back, -dist).add(new THREE.Vector3(0, height, 0));
        lookAt.copy(p).add(new THREE.Vector3(0, this.submerged ? 2.6 : 2.2, 0)).addScaledVector(back, 8);
      }
    } else if (this.mode === "board") {
      const pw = this.boardShip!.rig.group.localToWorld(this.pirate!.group.position.clone());
      targetPos.copy(pw).addScaledVector(back, -5.4).add(new THREE.Vector3(0, 2.7 + Math.sin(this.lookPitch) * -2.5, 0));
      targetPos.y = Math.max(targetPos.y, this.boardShip!.rig.group.position.y + this.boardShip!.rig.deck.deckY + 1);
      lookAt.copy(pw).add(new THREE.Vector3(0, 1.7, 0)).addScaledVector(back, 6);
      lookAt.y += this.lookPitch * 5;
    } else if (this.mode === "jet" && this.jet) {
      const j = this.jet;
      const cp = Math.cos(j.pitch);
      const fwd = new THREE.Vector3(Math.sin(j.heading) * cp, Math.sin(j.pitch) * 0.45, Math.cos(j.heading) * cp).normalize();
      const spd = clamp(j.speed / 514, 0, 1);
      const dist = this.zoom ? 42 : 15 + spd * 24;
      const height = this.zoom ? 12 : 5 + spd * 4.5;
      targetPos.copy(j.pos).addScaledVector(fwd, -dist).add(new THREE.Vector3(0, height, 0));
      lookAt.copy(j.pos).addScaledVector(fwd, 50 + spd * 60);
      this.camRoll = j.roll * 0.55;
    } else {
      const m = this.captainShip!;
      const bridgeW = this.toWorld(m, m.rig.deck.bridgeLocal);
      targetPos.copy(bridgeW).addScaledVector(back, -14).add(new THREE.Vector3(0, 7, 0));
      lookAt.copy(bridgeW).addScaledVector(back, 70).add(new THREE.Vector3(0, -4 + this.lookPitch * 10, 0));
    }

    if (this.mode !== "jet") this.camRoll = 0;
    const lerpK = 1 - Math.exp(-dt * (this.mode === "jet" ? 10 : 7));
    this.camPos.lerp(targetPos, lerpK);
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += rand(-1, 1) * this.shake * 0.28;
      this.camera.position.y += rand(-1, 1) * this.shake * 0.22;
    }
    this.camera.lookAt(lookAt);
    if (this.camRoll !== 0) this.camera.rotateZ(this.camRoll);
    const jetSpd = this.jet ? clamp(this.jet.speed / 514, 0, 1) : 0;
    const targetFov = this.zoom
      ? this.mode === "jet" ? 26 : 20
      : this.mode === "jet" ? 74 + jetSpd * 22 : this.mode === "sea" && Math.abs(this.speed) > 18 ? 76 : 70;
    this.fov = lerp(this.fov, targetFov, dt * 6);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------- objetivo
  private updateObjective() {
    if (this.mode === "sea") {
      if (!this.nearestTarget || this.nearestTarget.rig.group.position.distanceTo(this.craft.group.position) > 600) {
        this.objective =
          this.craftId === "viuda"
            ? "Detecta un barco en el radar y revienta su casco con misiles (ESPACIO) o aborda por la zona ciega"
            : "Navega y detecta un barco en el radar (contactos ámbar)";
      } else if (this.blindSpot) {
        this.objective = `Aborda por ${this.blindSpot} (zona ciega) — pulsa E`;
      } else {
        this.objective = `Acércate a ${this.nearestTarget.name} por proa o popa, fuera del arco de sus armas`;
      }
    } else if (this.mode === "board") {
      const m = this.boardShip!;
      if (m.boss && m.boss.alive) this.objective = "Elimina al JEFE DE SEGURIDAD (boina roja)";
      else this.objective = "Ve al puente (popa) y apunta al CAPITÁN — mantén E";
    } else {
      this.objective = "Eres el capitán: lleva el barco al punto de venta dorado y atraca con E";
    }
  }

  // ------------------------------------------------------------- radar / HUD
  private buildRadar() {
    const blips: RadarBlip[] = [];
    const p = this.mode === "captain" && this.captainShip ? this.captainShip.rig.group.position : this.craft.group.position;
    for (const i of this.islands) blips.push({ x: i.x, z: i.z, kind: "island" });
    for (const m of this.merchants) {
      if (m.state === "sinking" || m.state === "sold") continue;
      blips.push({ x: m.rig.group.position.x, z: m.rig.group.position.z, kind: m.hijacked ? "target" : m.kind === "yacht" ? "yacht" : m.kind === "liner" ? "liner" : "merchant", label: m.name });
    }
    for (const pa of this.patrols) blips.push({ x: pa.rig.group.position.x, z: pa.rig.group.position.z, kind: "patrol" });
    if (this.policeCarrier) blips.push({ x: this.policeCarrier.pos.x, z: this.policeCarrier.pos.z, kind: "patrol", label: "CV POLICÍA" });
    for (const pj of this.policeJets) blips.push({ x: pj.pos.x, z: pj.pos.z, kind: "patrol" });
    if (this.mode === "captain") blips.push({ x: this.sellPoint.x, z: this.sellPoint.z, kind: "sell" });
    this.radar = {
      px: p.x, pz: p.z,
      heading: this.mode === "captain" && this.captainShip ? this.captainShip.heading : this.heading,
      range: 900, blips,
    };
  }

  // telémetro de la mira: qué hay bajo el punto de mira y a qué distancia
  private computeAim() {
    this.aimRange = -1;
    this.aimTarget = "";
    if (!this.zoom || this.mode !== "sea") return;
    const dirv = this.camDir();
    const cp = this.camera.position;
    let best = 1e9;
    let bestLabel = "";
    const consider = (p: THREE.Vector3, label: string, size: number) => {
      const to = p.clone().sub(cp);
      const dist = to.length();
      if (dist < 2) return;
      const ang = Math.acos(clamp(to.normalize().dot(dirv), -1, 1));
      const tol = Math.max(0.016, Math.atan2(size, dist));
      if (ang < tol && dist < best) { best = dist; bestLabel = label; }
    };
    for (const m of this.merchants) {
      if (m.state === "sinking" || m.state === "sold") continue;
      const p = m.rig.group.position.clone(); p.y = 7;
      consider(p, m.name, m.rig.deck.len * 0.34);
    }
    for (const pt of this.patrols) {
      const p = pt.rig.group.position.clone(); p.y = 3;
      consider(p, "PATRULLERA", 14);
    }
    if (this.captainShip) {
      const p = this.captainShip.rig.group.position.clone(); p.y = 9;
      consider(p, `${this.captainShip.name} (TUYO)`, this.captainShip.rig.deck.len * 0.34);
    }
    this.aimRange = best < 1e9 ? best : -1;
    this.aimTarget = bestLabel;
  }

  private emitHud() {
    const def = CRAFTS[this.craftId];
    this.computeAim();
    let target: HudData["target"] = null;
    if (this.nearestTarget && this.mode === "sea") {
      const m = this.nearestTarget;
      const d = m.rig.group.position.distanceTo(this.craft.group.position);
      if (d < 900) {
        target = { name: m.name, kind: m.kind, dist: d, value: m.value };
      }
    }
    const h: HudData = {
      mode: this.mode,
      health: Math.round(this.health),
      hull: Math.round(this.hull),
      hullMax: this.hullMax,
      shipHull: Math.round(this.shipHull),
      shipHullMax: this.shipHullMax,
      speed: Math.abs(this.mode === "captain" ? this.shipSpeed : this.speed) * 1.94,
      throttle: this.throttle,
      wanted: this.wanted,
      money: this.money,
      ammo: this.mag,
      magSize: 30,
      reloading: this.reloading,
      torps: this.torps,
      torpsMax: def.torpedoes,
      missiles: this.missiles,
      missilesMax: def.missiles,
      depth: this.depth,
      submerged: this.submerged,
      objective: this.objective,
      target,
      blindSpot: this.blindSpot,
      canInteract: this.canInteract,
      progress: this.progress,
      zoom: this.zoom,
      damageT: this.damageT,
      hitT: this.hitT,
      contracts: this.contracts,
      aimRange: this.aimRange,
      aimTarget: this.aimTarget,
      gear: this.jet ? this.jet.gear : true,
      alt: this.jet ? Math.max(0, this.jet.pos.y - waveH(this.jet.pos.x, this.jet.pos.z, this.t)) : 0,
      jetsLeft: this.parkedJets.length,
      missileWarn: this.missileWarn,
    };
    this.cb.onHud(h);
  }
}
