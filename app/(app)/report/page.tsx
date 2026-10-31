"use client";
import { useEffect, useState } from "react";
import { useMonitor } from "@/components/Shell";
import { api, dt, usd } from "@/components/client";

export default function Report() {
  const m = useMonitor();
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api("/api/report").then((x) => setR(x.report)); }, []);
  const gen = async () => { setBusy(true); setErr(""); try { const x = await api("/api/report", { method: "POST" }); setR(x.report); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div className="stack">
      <div className="topbar">
        <div><h1>Audit Committee report</h1><div className="sub">An AI-drafted summary of the monitoring position, written only from the system's own figures and checked by the faithfulness verifier.</div></div>
        {m.user?.role !== "viewer" ? <button className="btn primary" onClick={gen} disabled={busy}>{busy ? <><span className="spin" /> Drafting...</> : "Generate latest report"}</button> : null}
      </div>
      {err ? <div className="banner bad">{err}</div> : null}
      {!r ? <div className="card muted">No report generated yet.</div> : (
        <div className="card">
          <div className="row small muted" style={{ marginBottom: 10 }}>Generated {dt(r.generated_at)} by {r.generated_by} · {r.usage?.total_tokens} tokens · {usd(r.cost_usd)} ·
            {r.faithfulness ? (r.faithfulness.ok ? <span className="ok-text">✓ all {r.faithfulness.checked} figures verified against the data</span> : <span className="bad-text">⚠ unverified figures: {r.faithfulness.unverified.join(", ")}</span>) : null}</div>
          <div style={{ whiteSpace: "pre-wrap", maxWidth: 820, lineHeight: 1.6 }}>{r.text}</div>
          <p className="small muted" style={{ marginTop: 14 }}>Draft for the Head of Internal Audit. Ratings are proposed until signed off. Synthetic data.</p>
        </div>
      )}
    </div>
  );
}
