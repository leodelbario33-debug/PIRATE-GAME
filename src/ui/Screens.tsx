import type { GameOverInfo } from "../game/types";
import { fmtMoney } from "../game/types";

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function PauseScreen({ onResume, onRestart, onMenu }: { onResume: () => void; onRestart: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(2,8,13,0.82)] backdrop-blur-[3px]">
      <div className="hud-panel hud-panel-amber px-10 py-8 w-[min(560px,92vw)] rise-in">
        <div className="hud-title text-4xl text-[#ffb347] mb-1">PAUSA</div>
        <div className="text-white/50 text-sm mb-5 tracking-widest">LA MAREA ESPERA, CAPITÁN</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[14px] text-white/75 mb-6">
          <div><b className="text-[#29e0d2]">W / S</b> — acelerar · frenar</div>
          <div><b className="text-[#29e0d2]">A / D</b> — girar el timón</div>
          <div><b className="text-[#29e0d2]">RATÓN</b> — apuntar · clic dispara</div>
          <div><b className="text-[#29e0d2]">E</b> — abordar · secuestrar · atracar</div>
          <div><b className="text-[#29e0d2]">C</b> — periscopio: hunde el casco, deja el cañón fuera</div>
          <div><b className="text-[#29e0d2]">ESPACIO</b> — lanzar torpedo</div>
          <div><b className="text-[#29e0d2]">R</b> — recargar el AK</div>
          <div><b className="text-[#29e0d2]">CLIC DER.</b> — mira ×8 (SHIFT: aguantar respiración)</div>
          <div><b className="text-[#29e0d2]">SHIFT</b> — turbo / correr</div>
          <div><b className="text-[#29e0d2]">M</b> — silenciar · <b className="text-[#29e0d2]">ESC</b> pausa</div>
        </div>
        <div className="flex gap-3">
          <button onClick={onResume} className="btn-naval flex-1 bg-[#ff7a1a] text-black px-5 py-3 text-lg">REANUDAR</button>
          <button onClick={onRestart} className="btn-naval flex-1 bg-[#0a2230] border border-[rgba(41,224,210,0.4)] text-[#29e0d2] px-5 py-3 text-lg">REINICIAR</button>
          <button onClick={onMenu} className="btn-naval flex-1 bg-[#0a2230] border border-white/20 text-white/70 px-5 py-3 text-lg">MENÚ</button>
        </div>
      </div>
    </div>
  );
}

const CAUSE_COLOR: Record<GameOverInfo["cause"], string> = {
  capturado: "#ff3b30",
  hundido: "#ffb347",
  muerto: "#ff5a4a",
};

export function GameOverScreen({ info, onRetry, onMenu }: { info: GameOverInfo; onRetry: () => void; onMenu: () => void }) {
  const c = CAUSE_COLOR[info.cause];
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(3,6,10,0.86)]">
      <div className="hud-panel px-10 py-9 w-[min(640px,94vw)] rise-in" style={{ borderColor: `${c}66` }}>
        <div className="text-[12px] tracking-[0.4em] text-white/40 mb-2">FIN DE LA TRAVESÍA</div>
        <div className="hud-title text-5xl mb-2" style={{ color: c, textShadow: `0 0 24px ${c}88` }}>{info.title}</div>
        <div className="text-white/70 text-[15px] mb-6 leading-snug">{info.detail}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
          {[
            { k: "BOTÍN", v: fmtMoney(info.money), col: "#ffd76a" },
            { k: "BARCOS ROBADOS", v: String(info.contracts), col: "#3dffb0" },
            { k: "BAJAS", v: String(info.kills), col: "#ff5a4a" },
            { k: "SUPERVIVENCIA", v: fmtTime(info.timeSec), col: "#29e0d2" },
          ].map((s) => (
            <div key={s.k} className="hud-panel px-3 py-2.5 text-center">
              <div className="text-[10px] tracking-[0.2em] text-white/45">{s.k}</div>
              <div className="text-xl font-bold" style={{ color: s.col }}>{s.v}</div>
            </div>
          ))}
        </div>
        <div className="text-[12px] text-white/40 mb-4 tracking-wide">
          Torpedos impactados: {info.torpHits} · El mar siempre ofrece una segunda marea.
        </div>
        <div className="flex gap-3">
          <button onClick={onRetry} className="btn-naval flex-1 bg-[#ff7a1a] text-black px-6 py-3.5 text-xl">ZARPAR OTRA VEZ</button>
          <button onClick={onMenu} className="btn-naval flex-1 bg-[#0a2230] border border-[rgba(41,224,210,0.4)] text-[#29e0d2] px-6 py-3.5 text-xl">PUERTO (MENÚ)</button>
        </div>
      </div>
    </div>
  );
}
