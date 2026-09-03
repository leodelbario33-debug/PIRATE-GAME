export type CraftId = "viuda" | "fantasma" | "tiburon";

export interface CraftDef {
  id: CraftId;
  name: string;
  cls: string;
  desc: string;
  topSpeed: number; // m/s
  accel: number;
  turn: number; // rad/s
  hull: number;
  weaponName: string;
  weaponDmg: number;
  fireRate: number; // shots per second
  torpedoes: number;
  submarine: boolean;
  color: string;
  stats: { velocidad: number; viraje: number; blindaje: number; potencia: number }; // 1..5
}

export const CRAFTS: Record<CraftId, CraftDef> = {
  viuda: {
    id: "viuda",
    name: "LA VIUDA",
    cls: "NARCOLANCHA 4× FUERABORDA",
    desc: "Casco negro de 14 metros con cuatro motores de 600 HP: vuela a 75 NUDOS sobre el oleaje. Monta una Browning M2 calibre .50 en proa.",
    topSpeed: 38.7,
    accel: 9.5,
    turn: 1.6,
    hull: 100,
    weaponName: "AMETRALLADORA .50",
    weaponDmg: 11,
    fireRate: 7,
    torpedoes: 0,
    submarine: false,
    color: "#101820",
    stats: { velocidad: 5, viraje: 4, blindaje: 2, potencia: 5 },
  },
  fantasma: {
    id: "fantasma",
    name: "FANTASMA X",
    cls: "INTERCEPTOR FURTIVO",
    desc: "Perfil bajo, pintura mate que desaparece al atardecer y una minigun M134 de 6 cañones que sierra el acero. 50 NUDOS: menos casco, más cadencia.",
    topSpeed: 25.8,
    accel: 9,
    turn: 1.9,
    hull: 80,
    weaponName: "MINIGUN M134",
    weaponDmg: 5,
    fireRate: 16,
    torpedoes: 0,
    submarine: false,
    color: "#151a22",
    stats: { velocidad: 4, viraje: 5, blindaje: 1, potencia: 4 },
  },
  tiburon: {
    id: "tiburon",
    name: "TIBURÓN NEGRO",
    cls: "MINISUBMARINO DE ATAQUE",
    desc: "Casco de presión negro con 6 torpedos MK-37. Con C sumerges el casco: solo el cañón periscópico asoma sobre las olas para cazar sin ser visto.",
    topSpeed: 16.5,
    accel: 5.5,
    turn: 1.1,
    hull: 170,
    weaponName: "CAÑÓN 40mm + TORPEDOS",
    weaponDmg: 14,
    fireRate: 4,
    torpedoes: 6,
    submarine: true,
    color: "#0b0f14",
    stats: { velocidad: 2, viraje: 3, blindaje: 5, potencia: 5 },
  },
};

export type MerchantKind = "cargo" | "tanker" | "yacht" | "liner";

export type Mode = "sea" | "board" | "captain";

export type MsgKind = "info" | "warn" | "danger" | "good" | "money";

export interface HudData {
  mode: Mode;
  health: number;
  hull: number;
  hullMax: number;
  shipHull: number;
  shipHullMax: number;
  speed: number; // knots display
  throttle: number;
  wanted: number;
  money: number;
  ammo: number;
  magSize: number;
  reloading: boolean;
  torps: number;
  torpsMax: number;
  depth: number;
  submerged: boolean;
  objective: string;
  target: { name: string; kind: MerchantKind; dist: number; value: number } | null;
  blindSpot: "proa" | "popa" | null;
  canInteract: string | null;
  progress: number; // -1 none, 0..1
  zoom: boolean;
  damageT: number;
  hitT: number;
  contracts: number;
  aimRange: number; // metros al objetivo bajo la mira (-1 sin objetivo)
  aimTarget: string;
}

export interface RadarBlip {
  x: number;
  z: number;
  kind: "island" | "merchant" | "target" | "patrol" | "sell" | "yacht" | "liner";
  label?: string;
}

export interface RadarSnap {
  px: number;
  pz: number;
  heading: number;
  range: number;
  blips: RadarBlip[];
}

export interface GameOverInfo {
  cause: "capturado" | "hundido" | "muerto";
  title: string;
  detail: string;
  money: number;
  contracts: number;
  kills: number;
  torpHits: number;
  timeSec: number;
}

export interface GameCallbacks {
  onHud: (h: HudData) => void;
  onMessage: (text: string, kind: MsgKind) => void;
  onGameOver: (info: GameOverInfo) => void;
  onHudPauseRequest: () => void;
  onLockLost: () => void;
}

export const MERCHANT_INFO: Record<MerchantKind, { label: string; value: number }> = {
  cargo: { label: "CARGUERO", value: 90000 },
  tanker: { label: "PETROLERO", value: 130000 },
  yacht: { label: "YATE DE LUJO", value: 160000 },
  liner: { label: "TRANSATLÁNTICO", value: 300000 },
};

export const fmtMoney = (n: number) => "$" + Math.round(n).toLocaleString("es-ES");
