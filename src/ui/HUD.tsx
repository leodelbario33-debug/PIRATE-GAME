import { useEffect, useRef } from "react";
import type { HudData, RadarSnap, MsgKind } from "../game/types";
import { MERCHANT_INFO, fmtMoney } from "../game/types";

export interface Msg { id: number; text: string; kind: MsgKind; born: number }

const KIND_STYLE: Record<MsgKind, string> = {
  info: "text-[#bfeef2] border-[rgba(41,224,210,0.4)]",
  warn: "text-[#ffb347] border-[rgba(255,179,71,0.5)]",
  danger: "text-[#ff5a4a] border-[rgba(255,90,74,0.55)]",
  good: "text-[#3dffb0] border-[rgba(61,255,176,0.5)]",
  money: "text-[#ffd76a] border-[rgba(255,215,106,0.6)]",
};

function Skull({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`w-5 h-5 skull-wanted ${on ? "text-[#ff3b30]" : "text-white/15"}`} fill="currentColor">
      <path d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.6 1.2 4.6 3 5.9V19a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-2.9c1.8-1.3 3-3.3 3-5.9C20.5 5.6 17 2 12 2Zm-3.4 11a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Zm6.8 0a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8ZM12 14l1.2 2.4h-2.4L12 14Zm-2 6.6v-1.8h1.2v1.8h-1.2Zm2.8 0v-1.8H14v1.8h-1.2Z" />
    </svg>
  );
}

function Radar({ getRadar }: { getRadar: () => RadarSnap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current;
      if (!cv) return;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      const r = getRadar();
      const S = 190, C = S / 2, R = 84;
      ctx.clearRect(0, 0, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.arc(C, C, R + 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(3,16,20,0.85)";
      ctx.fill();
      ctx.strokeStyle = "rgba(41,224,210,0.5)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // anillos + cruz
      ctx.strokeStyle = "rgba(41,224,210,0.16)";
      ctx.lineWidth = 1;
      for (const rr of [R / 3, (2 * R) / 3]) {
        ctx.beginPath(); ctx.arc(C, C, rr, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(C - R, C); ctx.lineTo(C + R, C); ctx.moveTo(C, C - R); ctx.lineTo(C, C + R); ctx.stroke();
      // barrido
      const t = (performance.now() / 3200) % 1;
      const a = t * Math.PI * 2;
      const grad = ctx.createConicGradient ? ctx.createConicGradient(a, C, C) : null;
      if (grad) {
        grad.addColorStop(0, "rgba(41,224,210,0.28)");
        grad.addColorStop(0.12, "rgba(41,224,210,0)");
        grad.addColorStop(1, "rgba(41,224,210,0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save();
      ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.clip();
      const ch = Math.cos(r.heading), sh = Math.sin(r.heading);
      const scale = R / r.range;
      for (const b of r.blips) {
        const dx = b.x - r.px, dz = b.z - r.pz;
        const sx = (dx * ch - dz * sh) * scale;
        const sy = -(dx * sh + dz * ch) * scale;
        if (sx * sx + sy * sy > R * R) continue;
        const x = C + sx, y = C + sy;
        if (b.kind === "island") {
          ctx.fillStyle = "rgba(61,255,176,0.75)";
          ctx.beginPath();
          ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x - 4, y + 3); ctx.closePath();
          ctx.fill();
        } else if (b.kind === "patrol") {
          ctx.fillStyle = "#ff3b30";
          ctx.beginPath();
          ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4, y + 3.5); ctx.lineTo(x - 4, y + 3.5); ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "rgba(255,59,48,0.5)";
          ctx.beginPath(); ctx.arc(x, y, 7 + Math.sin(performance.now() / 180) * 2, 0, Math.PI * 2); ctx.stroke();
        } else if (b.kind === "sell") {
          ctx.fillStyle = "#ffd76a";
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(255,215,106,0.7)";
          ctx.beginPath(); ctx.arc(x, y, 8 + Math.sin(performance.now() / 200) * 2, 0, Math.PI * 2); ctx.stroke();
        } else {
          const big = b.kind === "liner";
          const s = big ? 5 : b.kind === "yacht" ? 3.4 : 4;
          ctx.fillStyle = b.kind === "target" ? "#3dffb0" : "#ffb347";
          ctx.save();
          ctx.translate(x, y);
          if (b.kind === "yacht") ctx.rotate(Math.PI / 4);
          ctx.fillRect(-s, -s, s * 2, s * 2);
          ctx.restore();
        }
      }
      ctx.restore();
      // jugador
      ctx.fillStyle = "#e8f6f8";
      ctx.beginPath();
      ctx.moveTo(C, C - 6); ctx.lineTo(C + 4.5, C + 5); ctx.lineTo(C, C + 2.5); ctx.lineTo(C - 4.5, C + 5); ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [getRadar]);
  return <canvas ref={ref} width={190} height={190} />;
}

function RopeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#ffd9a0]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M12 2v9" strokeDasharray="2.4 1.6" />
      <path d="M12 11c0 3-3.5 3.4-3.5 6.2A3.2 3.2 0 0 0 12 20.5a3.2 3.2 0 0 0 3.2-3.3" />
      <path d="M15.2 17.2 17 15.6" />
    </svg>
  );
}

function ScopeOverlay({ hud }: { hud: HudData }) {
  const S = "min(88vh, 130vw)";
  const hasTarget = hud.aimRange >= 0;
  const isHostile = hud.aimTarget.includes("PATRULLERA");
  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      {/* máscara circular de la mira */}
      <div className="scope-mask absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ width: S, height: S }} />
      {/* retícula */}
      <svg className="reticle-glow absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: S, height: S }} viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="48.5" stroke="rgba(255,206,115,0.35)" strokeWidth="0.25" />
        <circle cx="50" cy="50" r="33" stroke="rgba(255,206,115,0.13)" strokeWidth="0.18" />
        <line x1="50" y1="2.5" x2="50" y2="44" stroke="#ffce73" strokeWidth="0.22" />
        <line x1="50" y1="56" x2="50" y2="97.5" stroke="#ffce73" strokeWidth="0.22" />
        <line x1="2.5" y1="50" x2="44" y2="50" stroke="#ffce73" strokeWidth="0.22" />
        <line x1="56" y1="50" x2="97.5" y2="50" stroke="#ffce73" strokeWidth="0.22" />
        {[14, 24, 34, 66, 76, 86].map((v) => (
          <g key={v} fill="#ffce73">
            <circle cx="50" cy={v} r="0.55" />
            <circle cx={v} cy="50" r="0.55" />
          </g>
        ))}
        {[42, 46, 54, 58].map((v) => (
          <g key={v} stroke="rgba(255,206,115,0.55)" strokeWidth="0.18">
            <line x1={v} y1="48.7" x2={v} y2="51.3" />
            <line x1="48.7" y1={v} x2="51.3" y2={v} />
          </g>
        ))}
        <circle cx="50" cy="50" r="0.9" fill={hasTarget ? (isHostile ? "#ff5a4e" : "#3dffb0") : "#ffce73"} />
      </svg>
      {/* lecturas de la óptica */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: S, height: S }}>
        <div className="absolute font-mono text-[11px] tracking-[0.22em] text-[#ffce73]/90" style={{ left: "24%", top: "22%" }}>
          ÓPTICA ×8 {hud.submerged ? "· PERISCOPIO" : ""}
        </div>
        <div
          className={`absolute font-mono text-[11px] tracking-[0.22em] text-right ${isHostile ? "text-[#ff5a4e]" : "text-[#ffce73]/90"}`}
          style={{ right: "24%", top: "22%" }}
        >
          {hud.aimTarget || "—"}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 text-center" style={{ top: "69%" }}>
          <div className={`font-mono text-xl font-bold tracking-[0.14em] ${hasTarget ? "text-[#ffce73]" : "text-white/35"}`}>
            {hasTarget ? `${Math.round(hud.aimRange)} m` : "SIN OBJETIVO"}
          </div>
          {hasTarget && (
            <div className="font-mono text-[10px] tracking-[0.3em] text-white/45 mt-0.5">
              CAÍDA {(hud.aimRange * 0.004).toFixed(1)} MIL
            </div>
          )}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.25em] text-white/40" style={{ top: "77%" }}>
          MANTÉN SHIFT — AGUANTAR RESPIRACIÓN
        </div>
      </div>
    </div>
  );
}

interface Props {
  hud: HudData;
  msgs: Msg[];
  getRadar: () => RadarSnap;
}

export default function HUD({ hud, msgs, getRadar }: Props) {
  const now = performance.now();
  const dmg = now - hud.damageT < 450;
  const hit = now - hud.hitT < 220;
  const isSub = hud.torpsMax > 0;
  const mode = hud.mode;

  const controls =
    mode === "board"
      ? "WASD moverse · RATÓN apuntar · CLIC disparar · R recargar · SHIFT correr · E interactuar"
      : mode === "captain"
        ? "W/S acelerar · A/D timón · E atracar en el punto de venta"
        : isSub
          ? "W/S acelerar · A/D timón · CLIC cañón periscópico · ESPACIO torpedo · C periscopio (casco bajo el agua) · E subir por la cuerda · CLIC DER mira ×8"
          : `W/S acelerar · A/D timón · CLIC ${hud.missilesMax > 0 ? ".50 · ESPACIO misil aéreo" : "minigun"} · SHIFT turbo · E subir por la cuerda · CLIC DER mira ×8 (SHIFT: pulso firme)`;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 font-[family-name:var(--font-ui)]">
      {/* viñeta de daño */}
      {dmg && (
        <div key={hud.damageT} className="dmg-flash absolute inset-0" style={{ boxShadow: "inset 0 0 140px 50px rgba(255,40,30,0.55)" }} />
      )}
      {/* mira de francotirador / viñeta de aumento */}
      {hud.zoom && mode === "sea" && <ScopeOverlay hud={hud} />}
      {hud.zoom && mode !== "sea" && (
        <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 180px 90px rgba(0,0,0,0.92)" }} />
      )}

      {/* radar */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <div className="hud-panel p-2">
          <div className="flex items-center justify-between px-1 mb-1">
            <span className="hud-title text-[11px] text-[#29e0d2]">RADAR · 900 m</span>
            <span className="text-[10px] text-white/40 tracking-widest">{hud.submerged ? "SONAR" : "SUPERFICIE"}</span>
          </div>
          <Radar getRadar={getRadar} />
        </div>
        <div className="hud-panel hud-panel-amber px-3 py-2 max-w-[220px]">
          <div className="hud-title text-[11px] text-[#ffb347] mb-1">OBJETIVO</div>
          <div className="text-[13px] leading-tight text-white/90 font-semibold">{hud.objective}</div>
        </div>
      </div>

      {/* dinero / búsqueda */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <div className="hud-panel hud-panel-amber px-4 py-2 text-right">
          <div className="hud-title text-[11px] text-[#ffb347]">BOTÍN</div>
          <div className="text-2xl font-bold text-[#ffd76a] leading-none tracking-wide">{fmtMoney(hud.money)}</div>
          <div className="text-[11px] text-white/50 mt-1">contratos: {hud.contracts}</div>
        </div>
        <div className={`hud-panel px-3 py-1.5 flex items-center gap-1.5 ${hud.wanted > 0 ? "" : "opacity-60"}`}>
          <span className="hud-title text-[11px] text-white/60 mr-1">BÚSQUEDA</span>
          {[1, 2, 3, 4, 5].map((i) => <Skull key={i} on={i <= hud.wanted} />)}
        </div>
        {hud.target && (
          <div className="hud-panel px-3 py-2 text-right">
            <div className="hud-title text-[11px] text-[#29e0d2]">CONTACTO</div>
            <div className="text-[14px] font-bold text-white leading-tight">{hud.target.name}</div>
            <div className="text-[11px] text-white/60">{MERCHANT_INFO[hud.target.kind].label} · {(hud.target.dist / 1000).toFixed(2)} km</div>
            <div className="text-[12px] font-bold text-[#ffd76a]">mercancía {fmtMoney(hud.target.value)}</div>
          </div>
        )}
      </div>

      {/* barras vitales */}
      <div className="absolute bottom-4 left-4 w-[250px] flex flex-col gap-1.5">
        {mode !== "board" ? (
          <div className="hud-panel px-3 py-2">
            <div className="flex justify-between text-[11px] hud-title text-white/70"><span>{mode === "captain" ? "CASCO DEL BARCO" : "CASCO"}</span><span>{mode === "captain" ? hud.shipHull : hud.hull}/{mode === "captain" ? hud.shipHullMax : hud.hullMax}</span></div>
            <div className="bar-track h-2.5 mt-1">
              <div className="bar-fill h-full" style={{ width: `${((mode === "captain" ? hud.shipHull : hud.hull) / (mode === "captain" ? hud.shipHullMax : hud.hullMax)) * 100}%`, background: "linear-gradient(90deg,#ff7a1a,#ffb347)" }} />
            </div>
          </div>
        ) : null}
        <div className="hud-panel px-3 py-2">
          <div className="flex justify-between text-[11px] hud-title text-white/70"><span>TRIPULACIÓN (TÚ)</span><span>{hud.health}</span></div>
          <div className="bar-track h-2.5 mt-1">
            <div className="bar-fill h-full" style={{ width: `${hud.health}%`, background: hud.health > 35 ? "linear-gradient(90deg,#1fae7a,#3dffb0)" : "linear-gradient(90deg,#a11212,#ff3b30)" }} />
          </div>
        </div>
        <div className="text-[11px] text-white/40 tracking-wide pl-1">{controls}</div>
      </div>

      {/* instrumentos */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
        {mode === "board" ? (
          <div className="hud-panel px-4 py-2 text-right">
            <div className="hud-title text-[11px] text-[#ffb347]">AK-47</div>
            <div className={`text-3xl font-bold leading-none ${hud.reloading ? "text-[#ffb347] blink-red" : "text-white"}`}>
              {hud.reloading ? "RELOAD" : `${hud.ammo}`}<span className="text-sm text-white/40">/{hud.magSize}</span>
            </div>
          </div>
        ) : (
          <div className="hud-panel px-4 py-2 text-right">
            <div className="hud-title text-[11px] text-[#29e0d2]">NUDOS</div>
            <div className="text-3xl font-bold text-white leading-none">{hud.speed.toFixed(0)}<span className="text-sm text-white/40"> kn</span></div>
            <div className="bar-track h-1.5 mt-1 w-32">
              <div className="bar-fill h-full" style={{ width: `${Math.abs(hud.throttle) * 100}%`, background: "#29e0d2" }} />
            </div>
            {isSub && (
              <div className="mt-1 text-[12px] font-bold" style={{ color: hud.submerged ? "#29e0d2" : "rgba(255,255,255,0.5)" }}>
                PROF. {hud.depth.toFixed(0)} m · {hud.submerged ? "PERISCOPIO" : "SUPERFICIE"}
              </div>
            )}
          </div>
        )}
        {isSub && (
          <div className="hud-panel hud-panel-amber px-4 py-2 text-right">
            <div className="hud-title text-[11px] text-[#ffb347]">TORPEDOS</div>
            <div className="flex gap-1.5 justify-end mt-1">
              {Array.from({ length: hud.torpsMax }).map((_, i) => (
                <div key={i} className="w-2.5 h-6" style={{ background: i < hud.torps ? "linear-gradient(180deg,#ffd76a,#ff7a1a)" : "rgba(255,255,255,0.1)", clipPath: "polygon(50% 0, 100% 22%, 100% 100%, 0 100%, 0 22%)" }} />
              ))}
            </div>
          </div>
        )}
        {hud.missilesMax > 0 && (
          <div className="hud-panel px-4 py-2 text-right" style={{ borderColor: "rgba(216,64,64,0.45)" }}>
            <div className="hud-title text-[11px] text-[#ff6a5e]">{hud.mode === "jet" ? "MISILES AIRE-AIRE · ESPACIO" : "MISILES · ESPACIO"}</div>
            <div className="flex gap-1.5 justify-end mt-1">
              {Array.from({ length: hud.missilesMax }).map((_, i) => (
                <div key={i} className="w-2.5 h-6" style={{ background: i < hud.missiles ? "linear-gradient(180deg,#ff8a7a,#c22020)" : "rgba(255,255,255,0.1)", clipPath: "polygon(50% 0, 100% 18%, 100% 78%, 70% 100%, 30% 100%, 0 78%, 0 18%)" }} />
              ))}
            </div>
          </div>
        )}
        {hud.hypersMax > 0 && (
          <div className="hud-panel px-4 py-2 text-right" style={{ borderColor: "rgba(74,140,255,0.5)" }}>
            <div className="hud-title text-[11px] text-[#6ea8ff]">INTERCEPTORES GUIADOS · T</div>
            <div className="flex gap-1.5 justify-end mt-1">
              {Array.from({ length: hud.hypersMax }).map((_, i) => (
                <div key={i} className="w-2.5 h-6" style={{ background: i < hud.hypers ? "linear-gradient(180deg,#cfe0ff,#3d6fd8)" : "rgba(255,255,255,0.1)", clipPath: "polygon(50% 0, 100% 18%, 100% 78%, 70% 100%, 30% 100%, 0 78%, 0 18%)" }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* crosshair */}
      {mode !== "captain" && !(hud.zoom && mode === "sea") && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative w-10 h-10">
            <div className="absolute left-1/2 top-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
            {[0, 90, 180, 270].map((r) => (
              <div key={r} className="absolute left-1/2 top-1/2 w-[2px] h-2.5 bg-white/80" style={{ transform: `translate(-50%,-50%) rotate(${r}deg) translateY(-11px)` }} />
            ))}
            {hit && (
              <div key={hud.hitT} className="hit-pop absolute inset-0">
                {[45, 135, 225, 315].map((r) => (
                  <div key={r} className="absolute left-1/2 top-1/2 w-[2.5px] h-3 bg-[#ff5a4a]" style={{ transform: `translate(-50%,-50%) rotate(${r}deg) translateY(-12px)` }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {hud.progress >= 0 && (
        <div className="absolute left-1/2 top-[58%] -translate-x-1/2 w-48">
          <div className="bar-track h-2.5">
            <div className="h-full" style={{ width: `${hud.progress * 100}%`, background: "linear-gradient(90deg,#ffb347,#3dffb0)" }} />
          </div>
        </div>
      )}

      {/* prompt central */}
      {hud.canInteract && (
        hud.canInteract.includes("CUERDA") ? (
          <div className="absolute left-1/2 top-[62%] -translate-x-1/2">
            <div className="msg-in flex items-center gap-3 rounded border-2 border-[#ffb054] bg-[#2a1a05]/90 px-5 py-2.5 shadow-[0_0_34px_rgba(255,150,40,0.35)]">
              <RopeIcon />
              <span className="rounded bg-[#ffb054] px-2.5 py-0.5 text-lg font-black leading-none text-[#241203]">E</span>
              <span className="hud-title pulse-glow text-[15px] tracking-wider text-[#ffd9a0]">{hud.canInteract}</span>
            </div>
          </div>
        ) : (
          <div className="absolute left-1/2 top-[62%] -translate-x-1/2">
            <div className="msg-in hud-panel hud-panel-amber px-5 py-2">
              <span className="hud-title text-[15px] text-[#ffb347] pulse-glow tracking-wider">{hud.canInteract}</span>
            </div>
          </div>
        )
      )}
      {hud.blindSpot && mode === "sea" && (
        <div className="absolute left-1/2 top-[55%] -translate-x-1/2 text-[13px] font-bold tracking-[0.25em] text-[#3dffb0]">
          ▸ ZONA CIEGA · {hud.blindSpot.toUpperCase()} ◂
        </div>
      )}

      {/* mensajes */}
      <div className="absolute left-1/2 top-[16%] -translate-x-1/2 flex flex-col items-center gap-1.5 w-[min(680px,90vw)]">
        {msgs.map((m) => (
          <div key={m.id} className={`msg-in hud-panel border px-4 py-1.5 text-center text-[14px] font-bold tracking-wide ${KIND_STYLE[m.kind]}`}>
            {m.text}
          </div>
        ))}
      </div>

      {/* aviso de arresto */}
      {hud.wanted > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <span className="blink-red text-[#ff3b30] font-bold text-[13px] tracking-[0.3em] hud-title">POLICÍA MARÍTIMA EN PERSECUCIÓN</span>
        </div>
      )}
    </div>
  );
}
