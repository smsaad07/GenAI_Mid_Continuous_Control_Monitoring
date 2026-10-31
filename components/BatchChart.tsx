"use client";
import { useState } from "react";

// Stacked bars per extract batch: AI-proposed breaches vs exceptions cleared as false positives.
export default function BatchChart({ rows }: { rows: any[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const data = rows.slice(-16);
  if (!data.length) return <p className="muted small">No batches yet.</p>;
  const W = 560, H = 210, padL = 30, padB = 26, padT = 10;
  const max = Math.max(4, ...data.map((r) => r.exceptions_raised));
  const bw = Math.min(28, (W - padL) / data.length - 6);
  const y = (v: number) => H - padB - (v / max) * (H - padB - padT);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <div>
      <div className="legend" style={{ marginBottom: 6 }}>
        <span><i className="sw" style={{ background: "var(--series-1)" }} />AI: breach</span>
        <span><i className="sw" style={{ background: "var(--series-2)" }} />AI: false positive</span>
        <span><i className="sw" style={{ background: "var(--line-strong)" }} />Other / pending</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Exceptions by batch split by AI disposition" onMouseLeave={() => setTip(null)}>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} /><text x={padL - 6} y={y(t) + 4} fontSize={10} textAnchor="end" fill="var(--muted)">{t}</text></g>)}
        {data.map((r, i) => {
          const x = padL + 6 + i * ((W - padL - 6) / data.length);
          const other = Math.max(0, r.exceptions_raised - r.ai_breaches - r.ai_cleared);
          const segs = [{ v: r.ai_breaches, c: "var(--series-1)" }, { v: r.ai_cleared, c: "var(--series-2)" }, { v: other, c: "var(--line-strong)" }];
          let acc = 0;
          return (
            <g key={r.batch_no} onMouseMove={(e) => setTip({ x: e.clientX + 12, y: e.clientY + 12, text: `Batch ${r.batch_no} (${String(r.window_start).slice(0, 10)}): ${r.exceptions_raised} exceptions · ${r.ai_breaches} breach · ${r.ai_cleared} cleared · ${other} other` })}>
              <rect x={x - 3} y={padT} width={bw + 6} height={H - padB - padT} fill="transparent" />
              {segs.map((s, j) => {
                if (!s.v) return null;
                const y1 = y(acc + s.v), y0 = y(acc);
                acc += s.v;
                return <rect key={j} x={x} y={y1 + 1} width={bw} height={Math.max(1, y0 - y1 - 2)} rx={j === 0 ? 0 : 3} fill={s.c} />;
              })}
              <text x={x + bw / 2} y={H - 8} fontSize={10} textAnchor="middle" fill="var(--muted)">{r.batch_no}</text>
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke="var(--line-strong)" />
      </svg>
      <div className="small muted">Batch number (x) · exceptions raised (y). Hover for detail.</div>
      {tip ? <div className="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null}
    </div>
  );
}
