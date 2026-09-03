import { useEffect, useRef, useState } from "react";
import type { CraftId } from "../game/types";
import { CRAFTS } from "../game/types";

function drawBlueprint(cv: HTMLCanvasElement, id: CraftId) {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(41,224,210,0.07)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 18) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = "rgba(41,224,210,0.35)";
  ctx.beginPath(); ctx.moveTo(8, 128); ctx.lineTo(W - 8, 128); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "600 10px Rajdhani, sans-serif";
  ctx.fillStyle = "rgba(41,224,210,0.55)";
  ctx.fillText("FLOTACIÓN", 10, 122);

  const S = "rgba(41,224,210,0.9)";
  const F = "rgba(41,224,210,0.08)";
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = S;
  ctx.fillStyle = F;

  const poly = (pts: number[][], close = true) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };
  const rect = (x: number, y: number, w: number, h: number) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const label = (t: string, x: number, y: number, col = "rgba(255,179,71,0.9)") => {
    ctx.fillStyle = col;
    ctx.fillText(t, x, y);
  };

  if (id === "viuda") {
    poly([[58, 110], [272, 110], [312, 118], [300, 140], [58, 140]]);
    rect(148, 92, 34, 18);
    rect(152, 86, 26, 6);
    poly([[246, 96], [262, 96], [262, 110], [246, 110]]);
    ctx.beginPath(); ctx.moveTo(262, 100); ctx.lineTo(286, 96); ctx.stroke();
    for (let i = 0; i < 4; i++) rect(34 + i * 15, 140, 11, 20);
    ctx.beginPath(); ctx.moveTo(39, 160); ctx.lineTo(90, 160); ctx.moveTo(39, 156); ctx.lineTo(39, 164); ctx.moveTo(90, 156); ctx.lineTo(90, 164); ctx.stroke();
    label("4× 450 HP", 30, 176);
    label("M2 .50", 240, 88);
    label("14 m", 150, 156);
  } else if (id === "fantasma") {
    poly([[66, 116], [268, 116], [316, 124], [298, 136], [66, 136]]);
    poly([[120, 116], [150, 100], [216, 100], [232, 116]]);
    rect(48, 136, 12, 16); rect(66, 136, 12, 16);
    ctx.beginPath(); ctx.arc(252, 108, 7, 0, Math.PI * 2); ctx.stroke();
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(252, 108); ctx.lineTo(284, 104 + i * 4); ctx.stroke(); }
    label("MINIGUN M134", 226, 90);
    label("PERFIL BAJO", 130, 92);
    label("12 m", 150, 152);
  } else {
    ctx.beginPath(); ctx.ellipse(182, 146, 118, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(300, 146, 16, 12, 0, 0, Math.PI * 2); ctx.stroke();
    rect(156, 106, 40, 40);
    ctx.beginPath(); ctx.moveTo(176, 106); ctx.lineTo(176, 90); ctx.lineTo(184, 90); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64, 146); ctx.lineTo(52, 138); ctx.moveTo(64, 146); ctx.lineTo(52, 154); ctx.stroke();
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.ellipse(230, 146, 22, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    label("6× TORPEDOS MK-37", 196, 172);
    label("VELA", 150, 100);
    label("26 m", 150, 122);
  }
  ctx.strokeStyle = "rgba(255,179,71,0.5)";
  ctx.lineWidth = 2;
  const m = 6, L = 14;
  const corners: [number, number, number, number][] = [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.beginPath(); ctx.moveTo(cx, cy + sy * L); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * L, cy); ctx.stroke();
  }
}

function StatPips({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] tracking-[0.15em] text-white/50 w-20">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="stat-seg w-5 h-2" style={{ background: i <= v ? "linear-gradient(90deg,#ff7a1a,#ffb347)" : "rgba(255,255,255,0.1)" }} />
        ))}
      </div>
    </div>
  );
}

function CraftCard({ id, selected, onPick, delay }: { id: CraftId; selected: boolean; onPick: () => void; delay: string }) {
  const def = CRAFTS[id];
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawBlueprint(ref.current, id);
  }, [id]);
  return (
    <button
      onClick={onPick}
      className={`card-craft hud-panel text-left px-4 pt-4 pb-4 w-[300px] floaty ${selected ? "!border-[#ffb347] shadow-[0_0_30px_rgba(255,122,26,0.28)]" : ""}`}
      style={{ animationDelay: delay }}
    >
      <div className="flex items-baseline justify-between">
        <span className="hud-title text-xl text-white">{def.name}</span>
        {selected && <span className="hud-title text-[10px] text-[#ffb347] tracking-widest">ELEGIDA</span>}
      </div>
      <div className="text-[11px] tracking-[0.2em] text-[#29e0d2] mb-2">{def.cls}</div>
      <canvas ref={ref} width={268} height={184} className="w-full bg-[#04121b] border border-[rgba(41,224,210,0.2)]" />
      <p className="text-[12.5px] text-white/65 leading-snug mt-2.5 min-h-[54px]">{def.desc}</p>
      <div className="flex flex-col gap-1 mt-2">
        <StatPips label="VELOCIDAD" v={def.stats.velocidad} />
        <StatPips label="VIRAJE" v={def.stats.viraje} />
        <StatPips label="BLINDAJE" v={def.stats.blindaje} />
        <StatPips label="POTENCIA" v={def.stats.potencia} />
      </div>
      <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-white/45 truncate">{def.weaponName}</span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="font-mono font-bold text-[#ffce73]">{def.displayKnots} kn</span>
          {def.torpedoes > 0 && <span className="text-[#ffb347] font-bold">{def.torpedoes} TORPEDOS</span>}
          {def.missiles > 0 && <span className="text-[#ff6a5e] font-bold">{def.missiles} MISILES</span>}
        </span>
      </div>
    </button>
  );
}

function WaveLayer({ cls, opacity, color, bottom }: { cls: string; opacity: number; color: string; bottom: number }) {
  const path = "M0,60 C120,20 240,100 360,60 C480,20 600,100 720,60 C840,20 960,100 1080,60 C1200,20 1320,100 1440,60 L1440,140 L0,140 Z";
  return (
    <div className={`pointer-events-none absolute left-0 w-[200%] ${cls}`} style={{ bottom, opacity }}>
      <svg width="50%" height="140" viewBox="0 0 1440 140" preserveAspectRatio="none" className="inline-block align-bottom">
        <path d={path} fill={color} />
      </svg><svg width="50%" height="140" viewBox="0 0 1440 140" preserveAspectRatio="none" className="inline-block align-bottom">
        <path d={path} fill={color} />
      </svg>
    </div>
  );
}

export default function MenuScreen({ onStart }: { onStart: (id: CraftId) => void }) {
  const [sel, setSel] = useState<CraftId>("viuda");
  return (
    <div className="relative w-full h-full overflow-y-auto overflow-x-hidden font-[family-name:var(--font-ui)]"
      style={{ background: "radial-gradient(1200px 700px at 75% -10%, #14424e 0%, #071823 45%, #030b12 100%)" }}>
      <div className="pointer-events-none absolute" style={{ left: "68%", top: "-90px", width: 340, height: 340, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,140,60,0.5) 0%, rgba(255,110,40,0.12) 45%, transparent 70%)" }} />
      <WaveLayer cls="wave-drift-slow" opacity={0.5} color="#062028" bottom={-20} />
      <WaveLayer cls="wave-drift" opacity={0.8} color="#04161f" bottom={-60} />
      <div className="pointer-events-none absolute right-[6%] bottom-[14%] w-56 h-56 rounded-full border border-[rgba(41,224,210,0.25)]">
        <div className="sonar-ping absolute inset-0 rounded-full border-2 border-[rgba(41,224,210,0.5)]" />
        <div className="sonar-ping absolute inset-0 rounded-full border border-[rgba(41,224,210,0.35)]" style={{ animationDelay: "1.2s" }} />
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-8">
        <header className="mb-6">
          <div className="text-[12px] tracking-[0.5em] text-[#29e0d2] mb-1">OPERACIÓN NO AUTORIZADA · COSTA DEL CARBÓN</div>
          <h1 className="hud-title title-flicker text-[clamp(44px,7vw,84px)] leading-[0.95] text-white" style={{ textShadow: "0 0 40px rgba(255,122,26,0.35), 0 4px 0 #041018" }}>
            MAREA <span className="text-[#ff7a1a]">NEGRA</span>
          </h1>
          <p className="text-white/70 max-w-[640px] text-[15px] leading-snug mt-3">
            No hay galeones ni parches en el ojo: esto es piratería del siglo XXI. Pilota una narcolancha de cuatro motores
            o un minisubmarino, caza cargueros, yates y transatlánticos en un mar inmenso, tumba al jefe de seguridad,
            apunta al capitán y <b className="text-[#ffb347]">conviértete tú en el capitán</b> antes de que la policía marítima te dé el alto.
          </p>
        </header>

        <div className="text-[12px] tracking-[0.35em] text-[#ffb347] hud-title mb-3">— ELIGE TU EMBARCACIÓN —</div>
        <div className="flex flex-wrap gap-4 items-stretch">
          {(["viuda", "fantasma", "tiburon"] as CraftId[]).map((id, i) => (
            <CraftCard key={id} id={id} selected={sel === id} onPick={() => setSel(id)} delay={`${i * 0.6}s`} />
          ))}
          <div className="flex-1 min-w-[260px] flex flex-col gap-3">
            <div className="hud-panel px-4 py-3">
              <div className="hud-title text-[12px] text-[#29e0d2] mb-2">MANUAL DEL ATRACADOR</div>
              <ol className="text-[13px] text-white/70 space-y-1.5 list-decimal list-inside leading-snug">
                <li>Detecta el barco en el radar y acércate con prismáticos (clic der.).</li>
                <li>Los lados del barco están cubiertos: entra por <b className="text-[#ffb347]">proa o popa</b> (zona ciega) y pulsa <b className="text-[#29e0d2]">E</b>.</li>
                <li>En cubierta esquiva la <b className="text-[#ff5a4a]">red eléctrica</b> de las barandillas y tumba al <b className="text-[#ff5a4a]">jefe de seguridad</b>.</li>
                <li>Apunta al capitán en el puente y mantén <b className="text-[#29e0d2]">E</b>: el barco será tuyo.</li>
                <li>Llévalo al punto de venta dorado sin que te hundan… y repite.</li>
              </ol>
            </div>
            <div className="hud-panel px-4 py-3">
              <div className="hud-title text-[12px] text-[#29e0d2] mb-2">CONSEJOS DE SUPERVIVENCIA</div>
              <ul className="text-[13px] text-white/70 space-y-1 leading-snug">
                <li>▸ Con el submarino: lanza torpedos bajo el agua; los cascos pesados giran lento, pero giran.</li>
                <li>▸ Sumérgete (C) y la patrulla perderá tu rastro.</li>
                <li>▸ Si te detienes junto a una patrullera, te arrestan en 3 segundos. No te pares.</li>
                <li>▸ Hundir tu presa con torpedos hunde también su mercancía.</li>
              </ul>
            </div>
            <button
              onClick={() => onStart(sel)}
              className="btn-naval bg-[#ff7a1a] text-black px-6 py-4 text-2xl mt-auto shadow-[0_0_40px_rgba(255,122,26,0.35)]"
            >
              ⚓ ZARPAR — INICIAR ATRACO
            </button>
            <div className="text-[11px] text-white/35 tracking-widest text-center">TECLADO + RATÓN OBLIGATORIOS · EL JUEGO BLOQUEA EL CURSOR AL ENTRAR</div>
          </div>
        </div>
      </div>
    </div>
  );
}
