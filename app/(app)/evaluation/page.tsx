"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMonitor } from "@/components/Shell";
import { api, pct, usd } from "@/components/client";

function Metric({ label, v, target, lower = false, n, help }: { label: string; v: number | null; target?: number; lower?: boolean; n?: string; help: string }) {
  const pass = v == null || target == null ? null : lower ? v <= target : v >= target;
  return (
    <div className="card tile">
      <div className="v">{pct(v)}</div>
      <div className="l">{label}</div>
      <div className="h">{target != null ? <>Target {lower ? "≤" : "≥"} {pct(target, 0)} · {pass == null ? "n/a" : pass ? <span className="ok-text">✓ met</span> : <span className="bad-text">✕ not met</span>}</> : null}{n ? ` · ${n}` : ""}</div>
      <div className="h">{help}</div>
    </div>
  );
}

export default function Evaluation() {
  const m = useMonitor();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/eval").then(setD); }, [m.version]);
  if (!d) return <div className="muted">Computing evaluation...</div>;
  const a = d.ai, c = d.cost;
  const reset = async () => { if (!confirm("Reset all batches, exceptions and reviews, then reload 3 fresh batches?")) return; setBusy(true); await api("/api/admin/reset", { body: { batches: 3 } }); setBusy(false); m.bump(); };
  return (
    <div className="stack">
      <div className="topbar">
        <div><h1>Evaluation</h1><div className="sub">Live scoring against the seeded ground truth (Phase 1 metrics 7 and 7a). Ground truth comes from the synthetic generator and is never shown to the agent.</div></div>
        {m.user?.role === "approver" ? <button className="btn danger" onClick={reset} disabled={busy}>{busy ? "Resetting..." : "Reset demo data"}</button> : null}
      </div>
      <div className="banner small">Scope: {d.scope.exceptions} exceptions over {d.scope.ground_truth_breaches} seeded breaches and {d.scope.ground_truth_decoys} seeded decoys; {d.scope.ai_assessed} assessed by the AI so far. These numbers move as new batches arrive. The fixed evaluation run with the full write-up is in the project notebook.</div>
      <h2>Detection (rules)</h2>
      <div className="grid g4">
        <Metric label="Seeded-breach recall" v={d.rules.recall} target={d.targets.rule_recall} help="Breaches the rules raised as an exception" />
        <Metric label="Rule precision vs true breaches" v={d.rules.precision_vs_breaches} help="Rules are broad by design; the AI separates decoys" />
        <Metric label="Population coverage" v={d.coverage.rate} target={1} n={`${d.coverage.tested.toLocaleString()} tests`} help="Every record of each type tested" />
        <div className="card tile"><div className="v">{Number(d.timeliness.detect_days).toFixed(1)} d</div><div className="l">Mean time from transaction to exception</div><div className="h">Target ≤ 7 days (today: 3-12 months) · max {d.timeliness.max_detect_days} d · AI proposal +{Math.round(d.timeliness.ai_seconds)} s</div></div>
      </div>
      <h2>AI investigation</h2>
      <div className="grid g4">
        <Metric label="False-clear rate" v={a.false_clear_rate} target={d.targets.false_clear_rate} lower n={`${a.false_clears}/${a.breach_exceptions_assessed}`} help="True breaches the AI called a false positive (the confidently-wrong metric)" />
        <Metric label="False-clear rate, high confidence (≥0.8)" v={a.high_conf_false_clear_rate} target={d.targets.false_clear_rate} lower n={`n=${a.high_conf_breach_n}`} help="Same, only where the AI was confident" />
        <Metric label="Severity agreement" v={a.severity_agreement} target={d.targets.severity_agreement} n={`n=${a.severity_n}`} help="AI severity = rubric severity on true breaches" />
        <Metric label="Explanation faithfulness" v={a.faithfulness} target={d.targets.faithfulness} n={`n=${a.faithfulness_n}`} help="Assessments whose every cited ID/date/amount is in the evidence" />
        <Metric label="Disposition accuracy" v={a.disposition_accuracy} help="Breach vs false positive matches ground truth (needs-info counted wrong)" />
        <Metric label="Decoy clearance" v={a.decoy_clearance_rate} n={`n=${a.benign_assessed}`} help="Legitimate look-alikes correctly cleared" />
        <Metric label="Precision of AI 'breach'" v={a.precision_of_ai_breach} target={d.targets.ai_precision} help="Share of AI-proposed breaches that are real" />
        <Metric label="Needs-more-info rate" v={a.needs_more_info_rate} help="Escalated to the human without a call" />
      </div>
      <div className="grid g2">
        <div className="card">
          <h2>Calibration</h2>
          <table><thead><tr><th>Confidence</th><th className="num">n</th><th className="num">Accuracy</th><th style={{ width: "40%" }}></th></tr></thead>
            <tbody>{a.calibration.map((b: any) => <tr key={b.bucket}><td>{b.bucket}</td><td className="num">{b.n}</td><td className="num">{b.n ? pct(b.correct / b.n) : "-"}</td><td><div className="bar-track"><div className="bar-fill" style={{ width: `${b.n ? (100 * b.correct) / b.n : 0}%` }} /></div></td></tr>)}</tbody></table>
          <p className="small muted" style={{ marginTop: 8 }}>A well-calibrated agent is more accurate in higher buckets. Accuracy below the stated confidence means the agent is over-confident.</p>
        </div>
        <div className="card">
          <h2>Cost and latency</h2>
          <div className="kv">
            <div>Agent runs</div><div>{c.runs} ({c.failed_runs} failed)</div>
            <div>Tokens</div><div>{c.total_tokens.toLocaleString()} ({c.prompt_tokens.toLocaleString()} in · {c.completion_tokens.toLocaleString()} out · {c.cached_tokens.toLocaleString()} cached)</div>
            <div>Cost</div><div>{usd(c.cost_usd)} total · {usd(c.runs ? c.cost_usd / c.runs : 0)} per exception</div>
            <div>Model calls / exception</div><div>{Number(c.avg_calls).toFixed(2)}</div>
            <div>Latency</div><div>p50 {(c.p50_latency_ms / 1000).toFixed(1)} s · p95 {(c.p95_latency_ms / 1000).toFixed(1)} s</div>
          </div>
          <h3 style={{ marginTop: 14 }}>Human loop</h3>
          <div className="kv"><div>Supervisor reviews</div><div>{d.human.reviewed}</div><div>Supervisor-AI agreement</div><div>{pct(d.human.supervisor_ai_agreement)}</div><div>Confirmed as breach</div><div>{pct(d.human.supervisor_confirmed_precision)}</div></div>
        </div>
      </div>
      <div className="card">
        <h2>By control</h2>
        <div className="tablewrap"><table>
          <thead><tr><th>Control</th><th className="num">Seeded breaches</th><th className="num">Rule recall</th><th className="num">Decoys flagged</th><th className="num">AI assessed</th><th className="num">AI accuracy</th><th className="num">False clears</th><th className="num">False alarms</th><th className="num">Severity agreement</th></tr></thead>
          <tbody>{d.per_control.map((p: any) => <tr key={p.control_id}><td><span className="mono muted">{p.control_id}</span> {p.name}</td><td className="num">{p.breaches}</td><td className="num">{pct(p.recall, 0)}</td><td className="num">{p.decoys_flagged}/{p.decoys}</td><td className="num">{p.ai_assessed}</td><td className="num">{pct(p.ai_accuracy, 0)}</td><td className={`num ${p.false_clears ? "bad-text" : ""}`}>{p.false_clears}</td><td className="num">{p.false_alarms}</td><td className="num">{pct(p.severity_agreement, 0)}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="card">
        <h2>Where the AI was wrong</h2>
        {d.errors.length ? <table><thead><tr><th>Type</th><th>Exception</th><th>Detail</th></tr></thead><tbody>
          {d.errors.map((e: any, i: number) => <tr key={i}><td className={`small ${e.type === "FALSE CLEAR" ? "bad-text" : ""}`}><b>{e.type}</b></td><td className="mono small"><Link href={`/exceptions/${e.ref}`}>{e.ref}</Link> {e.control_id}</td>
            <td className="small">{e.type === "severity" ? `AI said ${e.ai}, rubric says ${e.expected}` : `${e.disposition} (${Math.round(e.confidence * 100)}%): ${e.explanation}`}</td></tr>)}
        </tbody></table> : <p className="muted">No errors recorded yet.</p>}
      </div>
    </div>
  );
}
