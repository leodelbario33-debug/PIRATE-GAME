export type CraftId = "viuda" | "fantasma" | "tiburon" | "kraken" | "rayo";

export interface CraftDef {
  id: CraftId;
  name: string;
  cls: string;
  desc: string;
  topSpeed: number; // m/s (base; el turbo ×1.22 lleva al máximo anunciado)
  accel: number;
  turn: number; // rad/s
  hull: number;
  weaponName: string;
  weaponDmg: number;
  fireRate: number; // shots per second
  torpedoes: number;
  missiles: number; // misiles aéreos (arco balístico / aire-aire)
  missileKind?: "arc" | "dart"; // "dart": proyectil recto al punto marcado, sin curva ni guiado
  jets?: number; // cazas disponibles en cubierta
  submarine: boolean;
  color: string;
  displayKnots: number; // velocidad punta anunciada en nudos
  stats: { velocidad: number; viraje: number; blindaje: number; potencia: number }; // 1..5
}

export const CRAFTS: Record<CraftId, CraftDef> = {
  viuda: {
    id: "viuda",
    name: "LA VIUDA",
    cls: "NARCOLANCHA 4× FUERABORDA",
    desc: "Ocho motores de 700 HP sobre un casco alargado de proa afilada: con el turbo estira hasta 280 NUDOS. Además de la Browning .50 monta una rampa con 4 MISILES AÉREOS BR-8: apunta bien con la mira y reventarás el casco que sea.",
    topSpeed: 118.3,
    accel: 12,
    turn: 1.6,
    hull: 100,
    weaponName: "BROWNING .50 + MISILES BR-8",
    weaponDmg: 11,
    fireRate: 7,
    torpedoes: 0,
    missiles: 4,
    submarine: false,
    color: "#101820",
    displayKnots: 280,
    stats: { velocidad: 5, viraje: 4, blindaje: 2, potencia: 5 },
  },
  fantasma: {
    id: "fantasma",
    name: "FANTASMA X",
    cls: "INTERCEPTOR FURTIVO",
    desc: "Perfil bajo, pintura mate que desaparece al atardecer y una minigun M134 de 6 cañones que sierra el acero. Estira hasta 70 NUDOS: menos casco, más cadencia.",
    topSpeed: 29.5,
    accel: 10,
    turn: 1.9,
    hull: 80,
    weaponName: "MINIGUN M134",
    weaponDmg: 5,
    fireRate: 16,
    torpedoes: 0,
    missiles: 0,
    submarine: false,
    color: "#151a22",
    displayKnots: 70,
    stats: { velocidad: 5, viraje: 5, blindaje: 1, potencia: 4 },
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
    missiles: 0,
    submarine: true,
    color: "#0b0f14",
    displayKnots: 32,
    stats: { velocidad: 2, viraje: 3, blindaje: 5, potencia: 5 },
  },
  kraken: {
    id: "kraken",
    name: "EL KRAKEN",
    cls: "PORTAAVIONES DE ATAQUE",
    desc: "240 metros de acero con 4 turbinas de gas. Lento en línea recta pero gira como una lancha. Pulsa E para subir a un caza y despega a toda pastilla: tus aviones cazan a 1000 NUDOS.",
    topSpeed: 13.5,
    accel: 3.4,
    turn: 0.7,
    hull: 420,
    weaponName: "3 CAZAS + CIWS DE PROA",
    weaponDmg: 12,
    fireRate: 1,
    torpedoes: 0,
    missiles: 8,
    jets: 3,
    submarine: false,
    color: "#1a222c",
    displayKnots: 27,
    stats: { velocidad: 1, viraje: 4, blindaje: 5, potencia: 5 },
  },
  rayo: {
    id: "rayo",
    name: "RAYO 360",
    cls: "CATAMARÁN DE CARRERAS 8×800 HP",
    desc: "Ancho, bajo y rabioso: dos cascos gemelos, alerón trasero y 8 motores de 800 HP en fila. Corre a 360 NUDOS y gira sin esfuerzo. En lugar de misiles en arco lanza DARDOS: marcas el punto con la mira, pulsas ESPACIO y vuelan RECTOS al objetivo a más de 1200 m/s.",
    topSpeed: 152,
    accel: 16,
    turn: 3.4,
    hull: 90,
    weaponName: "M2 + DARDOS RECTOS ×6",
    weaponDmg: 10,
    fireRate: 9,
    torpedoes: 0,
    missiles: 6,
    missileKind: "dart",
    submarine: false,
    color: "#131c28",
    displayKnots: 360,
    stats: { velocidad: 5, viraje: 5, blindaje: 2, potencia: 5 },
  },
};

export type MerchantKind = "cargo" | "tanker" | "yacht" | "liner";

export type Mode = "sea" | "board" | "captain" | "jet";

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
  missiles: number;
  missilesMax: number;
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
  gear: boolean; // tren de aterrizaje del caza
  alt: number; // altitud del caza (m)
  jetsLeft: number; // cazas restantes en el portaaviones
  missileWarn: { dist: number; angle: number } | null; // misil entrante: distancia y ángulo relativo
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
  cause: "capturado" | "hundido" | "muerto" | "estrellado";
  title: string;
  detail: string;
  money: number;
  contracts: number;
  kills: number;
  torpHits: number;
  missileHits: number;
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
