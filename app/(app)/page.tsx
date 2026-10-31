"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMonitor } from "@/components/Shell";
import { api, pkrShort, dt, usd } from "@/components/client";
import { Tile, Rating, Disp, Sev } from "@/components/ui";
import BatchChart from "@/components/BatchChart";

export default function Dashboard() {
  const m = useMonitor();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api("/api/dashboard").then(setD).catch(() => {}); }, [m.version]);
  if (!d) return <div className="muted">Loading dashboard...</div>;
  const k = d.kpi;
  const canAct = m.user?.role !== "viewer";
  const processes = Array.from(new Set(d.controls.map((c: any) => c.process))) as string[];
  return (
    <div className="stack">
      <div className="topbar">
        <div>
          <h1>Continuous control monitoring</h1>
          <div className="sub">15 key controls · 7 process areas · full-population testing · last extract {dt(k.last_ingest)}</div>
        </div>
      </div>

      <div className="card">
        <div className="row between">
          <div>
            <h2 style={{ marginBottom: 2 }}>Monitoring engine</h2>
            <div className="small sub">Fetch pulls the next extract from the source systems (SAP MM/FI/SD, HR & payroll, biometric attendance, transport, user access). Every record is tested immediately and exceptions go straight to the AI investigation agent.</div>
          </div>
          {canAct ? (
            <div className="row">
              <button className="btn primary" onClick={m.fetchBatch} disabled={m.ingesting}>{m.ingesting ? <><span className="spin" /> Fetching & testing...</> : "⟳ Fetch new data batch"}</button>
              <label className="row small" style={{ margin: 0 }}><input type="checkbox" checked={m.live} onChange={(e) => m.setLive(e.target.checked)} /> Live monitoring</label>
              <label className="row small" style={{ margin: 0 }}><input type="checkbox" checked={m.agentAuto} onChange={(e) => m.setAgentAuto(e.target.checked)} /> AI agent auto-run</label>
            </div>
          ) : <span className="pill">Read-only view</span>}
        </div>
        {m.ingestError ? <div className="banner bad" style={{ marginTop: 10 }}>{m.ingestError}</div> : null}
        {m.lastIngest ? (
          <div style={{ marginTop: 12 }}>
            <div className="small" style={{ marginBottom: 6 }}><b>Batch {m.lastIngest.batch_no}</b> ingested: {m.lastIngest.records.toLocaleString()} records, window {m.lastIngest.window_start} to {m.lastIngest.window_end}, <b>{m.lastIngest.exceptions} exceptions</b> raised in {m.lastIngest.duration_ms} ms.</div>
            <div className="pipeline">
              {m.lastIngest.stages.map((s: any) => <div key={s.stage} className="stage"><b>✓ {s.stage}</b><span className="muted">{s.detail}</span></div>)}
              <div className={`stage ${m.status?.queued ? "on" : ""}`}><b>{m.status?.queued ? <><span className="spin" /> AI investigation</> : "✓ AI investigation"}</b><span className="muted">{m.status?.queued ? `${m.status.queued} exceptions queued` : "All exceptions assessed"}</span></div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid g6">
        <Tile v={k.records.toLocaleString()} l="Records ingested" h={`${k.batches} extract batches`} />
        <Tile v={k.tests.toLocaleString()} l="Control tests run" h="100% of population, no sampling" />
        <Tile v={k.exceptions} l="Exceptions raised" h={`${k.ai_queue} awaiting AI`} />
        <Tile v={k.pending_review + k.pending_approval} l="In human review" h={`${k.pending_review} supervisor · ${k.pending_approval} approver`} />
        <Tile v={k.findings} l="Findings issued" h={`${k.open_actions} open actions${k.overdue_actions ? ` · ${k.overdue_actions} overdue` : ""}`} />
        <Tile v={pkrShort(k.amount_at_risk)} l="Amount at risk" h="AI-proposed + confirmed breaches" />
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="row between"><h2>AI dispositions by batch</h2><span className="small muted">AI cost to date {usd(k.ai_cost_usd)} · {k.ai_tokens.toLocaleString()} tokens</span></div>
          <BatchChart rows={d.byBatch} />
        </div>
        <div className="card">
          <div className="row between"><h2>Agent activity (this session)</h2><Link href="/exceptions" className="small">All exceptions →</Link></div>
          {m.agentLog.length === 0 ? <p className="muted small">When a batch is fetched the agent investigates each new exception here in real time.{m.status?.queued ? ` ${m.status.queued} exceptions are queued.` : ""}</p> : (
            <div className="tablewrap"><table><tbody>
              {m.agentLog.slice(0, 9).map((a) => (
                <tr key={a.ref + a.at}><td className="mono"><Link href={`/exceptions/${a.id}`}>{a.ref}</Link></td><td className="small">{a.title}</td><td><Disp d={a.assessment.disposition} /></td><td><Sev s={a.assessment.severity} /></td><td className="small muted num">{(a.latency_ms / 1000).toFixed(1)}s · {a.tokens} tok</td></tr>
              ))}
            </tbody></table></div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row between"><h2>Control status by process</h2><Link href="/controls" className="small">Risk & control matrix →</Link></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Control</th><th className="num">Tested</th><th className="num">Exceptions</th><th className="num">High</th><th className="num">Medium</th><th className="num">Low</th><th className="num">At risk</th><th>Proposed rating</th></tr></thead>
          <tbody>
            {processes.map((p) => [
              <tr key={p}><td colSpan={8} style={{ background: "var(--surface-2)", fontWeight: 600 }}>{p}</td></tr>,
              ...d.controls.filter((c: any) => c.process === p).map((c: any) => (
                <tr key={c.id} className="click" onClick={() => (window.location.href = `/exceptions?control=${c.id}`)}>
                  <td><span className="mono muted">{c.id}</span> {c.name}</td><td className="num">{c.population.toLocaleString()}</td><td className="num">{c.exceptions}</td>
                  <td className="num">{c.high || ""}</td><td className="num">{c.medium || ""}</td><td className="num">{c.low || ""}</td><td className="num">{c.amount ? pkrShort(c.amount) : "-"}</td>
                  <td><Rating r={c.signoff?.rating || c.rating} />{c.signoff ? <span className="small muted"> · signed off</span> : null}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
