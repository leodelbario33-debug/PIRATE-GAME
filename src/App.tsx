import { useCallback, useEffect, useRef, useState } from "react";
import type { CraftId, GameOverInfo, HudData, RadarSnap } from "./game/types";
import { Game } from "./game/engine";
import HUD from "./ui/HUD";
import type { Msg } from "./ui/HUD";
import MenuScreen from "./ui/MenuScreen";
import { PauseScreen, GameOverScreen } from "./ui/Screens";

const EMPTY_RADAR: RadarSnap = { px: 0, pz: 0, heading: 0, range: 900, blips: [] };

const DEFAULT_HUD: HudData = {
  mode: "sea", health: 100, hull: 100, hullMax: 100, shipHull: 300, shipHullMax: 300,
  speed: 0, throttle: 0, wanted: 0, money: 0, ammo: 30, magSize: 30, reloading: false,
  torps: 0, torpsMax: 0, depth: 0, submerged: false,
  objective: "", target: null, blindSpot: null, canInteract: null, progress: -1,
  zoom: false, damageT: -10000, hitT: -10000, contracts: 0,
  aimRange: -1, aimTarget: "",
};

export default function App() {
  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const [craftId, setCraftId] = useState<CraftId>("viuda");
  const [session, setSession] = useState(0);
  const [hud, setHud] = useState<HudData>(DEFAULT_HUD);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [paused, setPaused] = useState(false);
  const [over, setOver] = useState<GameOverInfo | null>(null);
  const [locked, setLocked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const msgId = useRef(0);
  const pausedRef = useRef(false);
  const overRef = useRef(false);

  const setPausedBoth = (p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
    gameRef.current?.setPaused(p);
  };

  // crear / destruir motor
  useEffect(() => {
    if (screen !== "game" || !canvasRef.current) return;
    const game = new Game(canvasRef.current, craftId, {
      onHud: (h) => setHud(h),
      onMessage: (text, kind) => {
        const id = ++msgId.current;
        setMsgs((m) => [...m.slice(-3), { id, text, kind, born: performance.now() }]);
        window.setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 4600);
      },
      onGameOver: (info) => {
        overRef.current = true;
        setOver(info);
        document.exitPointerLock();
      },
      onHudPauseRequest: () => {
        if (overRef.current) return;
        setPausedBoth(!pausedRef.current);
      },
      onLockLost: () => {
        if (!overRef.current) setPausedBoth(true);
      },
    });
    gameRef.current = game;
    overRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setOver(null);
    setHud(DEFAULT_HUD);
    setMsgs([]);
    const t = window.setTimeout(() => game.requestLock(), 120);

    const onLockChange = () => setLocked(document.pointerLockElement === canvasRef.current);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerlockchange", onLockChange);
      game.dispose();
      gameRef.current = null;
    };
  }, [screen, craftId, session]);

  const startGame = (id: CraftId) => {
    setCraftId(id);
    setSession((s) => s + 1);
    setScreen("game");
  };

  const getRadar = useCallback(() => gameRef.current?.getRadar() ?? EMPTY_RADAR, []);

  const inGame = screen === "game";

  return (
    <div className="w-full h-full relative bg-[#030b12]">
      {inGame && <canvas ref={canvasRef} className="game3d" onClick={() => { if (!pausedRef.current && !overRef.current) gameRef.current?.requestLock(); }} />}
      {inGame && !over && (
        <HUD hud={hud} msgs={msgs} getRadar={getRadar} />
      )}
      {inGame && paused && !over && (
        <PauseScreen
          onResume={() => { setPausedBoth(false); gameRef.current?.requestLock(); }}
          onRestart={() => { setSession((s) => s + 1); setPausedBoth(false); }}
          onMenu={() => { setPausedBoth(false); setScreen("menu"); }}
        />
      )}
      {inGame && over && (
        <GameOverScreen
          info={over}
          onRetry={() => { setSession((s) => s + 1); }}
          onMenu={() => setScreen("menu")}
        />
      )}
      {inGame && !paused && !over && !locked && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(2,8,13,0.55)] cursor-pointer"
          onClick={() => gameRef.current?.requestLock()}>
          <div className="hud-panel hud-panel-amber px-8 py-5 text-center rise-in">
            <div className="hud-title text-2xl text-[#ffb347] pulse-glow">CLIC PARA TOMAR EL TIMÓN</div>
            <div className="text-white/60 text-sm mt-1">El cursor se bloqueará para apuntar · ESC para pausa</div>
          </div>
        </div>
      )}
      {screen === "menu" && <MenuScreen onStart={startGame} />}
    </div>
  );
}
