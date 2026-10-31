"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useMonitor } from "@/components/Shell";
import { api, pkr, dt, usd } from "@/components/client";
import { Disp, Sev, Status } from "@/components/ui";

function RecordCard({ type, rec }: { type: string; rec: any }) {
  const hide = new Set(["id"]);
  return (
    <div className="card" style={{ padding: 12, boxShadow: "none" }}>
      <div className="row between"><b className="mono">{rec.id}</b><span className="pill">{type.replace("_", " ")}</span></div>
      <div className="kv" style={{ marginTop: 8 }}>
        {Object.entries(rec).filter(([k]) => !hide.has(k)).map(([k, v]) => [
          <div key={k + "k"}>{k}</div>,
          <div key={k + "v"} className={typeof v === "number" ? "mono" : ""}>{v == null ? <span className="muted">-</span> : Array.isArray(v) ? v.join(", ") : typeof v === "number" ? v.toLocaleString("en-US") : String(v)}</div>,
        ])}
      </div>
    </div>
  );
}

export default function ExceptionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const m = useMonitor();
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState("evidence");
  const [decision, setDecision] = useState("confirm");
  const [sev, setSev] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = () => api(`/api/exceptions/${id}`).then((x) => { setD(x); setSev(x.exception.sup_severity || x.exception.ai?.severity || "Medium"); setDecision(x.exception.ai?.disposition === "false_positive" ? "dismiss" : "confirm"); });
  useEffect(() => { load(); }, [id, m.version]); // eslint-disable-line

  if (!d) return <div className="muted">Loading...</div>;
  const e = d.exception, a = e.ai, c = d.control;
  const run = d.runs.find((r: any) => r.ok);

  const submit = async (url: string, body: any) => {
    setBusy(true); setErr("");
    try { await api(url, { body }); setNote(""); m.bump(); await load(); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div>
        <div className="small"><Link href="/exceptions">← All exceptions</Link></div>
        <div className="row" style={{ marginTop: 6 }}><h1 className="mono" style={{ margin: 0 }}>{e.ref}</h1><Status s={e.status} /></div>
        <div className="sub" style={{ fontSize: 15, marginTop: 4 }}>{e.title}</div>
        <div className="small muted">{c.id} {c.name} · {c.process} · batch {e.batch_no} · transaction date {e.txn_date} · owner: {c.owner}</div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="card">
            <div className="row between"><h2>AI investigation</h2>{a ? <span className="small muted">{a.mode === "agent" ? `agent · ${a.steps_used} model calls` : a.mode} · {a.model}{a.model === "openai/gpt-oss-20b" ? " (fallback model - daily quota of gpt-oss-120b used; not covered by the evaluation)" : ""}</span> : null}</div>
            {!a ? <p className="muted">{e.status === "AI_RUNNING" ? "The agent is investigating this exception now..." : "Queued for the investigation agent."}</p> : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="row"><Disp d={a.disposition} /><Sev s={a.severity} /><span className="pill">Confidence {Math.round(a.confidence * 100)}%</span>
                  {a.faithfulness?.ok ? <span className="pill" style={{ borderColor: "var(--good-ink)", color: "var(--good-ink)" }}>✓ {a.faithfulness.checked} citations verified</span>
                    : <span className="pill" style={{ borderColor: "var(--critical)", color: "var(--critical)" }}>⚠ Unverified: {a.faithfulness?.unverified.join(", ")}</span>}</div>
                <p>{a.explanation}</p>
                <div className="kv"><div>Root cause</div><div>{a.root_cause || "-"}</div><div>Recommended action</div><div>{a.recommended_action || "-"}</div><div>Evidence relied on</div><div className="mono small">{(a.evidence_cited || []).join(", ") || "-"}</div><div>PII masked</div><div>{a.masked_fields} fields (CNIC, IBAN, NTN, EOBI) masked before the model saw them</div></div>
                {!a.faithfulness?.ok ? <div className="banner bad small">The verifier could not find one or more cited figures in the evidence the agent was shown. Treat the explanation with caution and check the records directly.</div> : null}
              </div>
            )}
          </div>

          <div className="card">
            <h2>Decision</h2>
            {e.sup_decision ? (
              <div className="kv" style={{ marginBottom: 10 }}>
                <div>Supervisor</div><div><b>{e.sup_decision === "confirmed_breach" ? `Confirmed breach (${e.sup_severity})` : "Dismissed"}</b> by {e.sup_by} · {dt(e.sup_at)}{e.sup_note ? <div className="small">“{e.sup_note}”</div> : null}
                  {a && (e.sup_decision === "confirmed_breach") !== (a.disposition === "breach") ? <div className="small bad-text">Supervisor overrode the AI proposal</div> : null}</div>
                {e.appr_decision ? <><div>Approver</div><div><b>{e.appr_decision === "approved" ? "Approved" : "Sent back"}</b> by {e.appr_by} · {dt(e.appr_at)}{e.appr_note ? <div className="small">“{e.appr_note}”</div> : null}</div></> : null}
              </div>
            ) : null}

            {m.user?.role === "supervisor" && e.status === "PENDING_REVIEW" ? (
              <div className="stack" style={{ gap: 8 }}>
                <div className="row">
                  {[["confirm", "Confirm breach"], ["dismiss", "Dismiss (no issue)"], ["rerun", "Ask AI to re-investigate"]].map(([k, l]) => (
                    <label key={k} className="row" style={{ margin: 0, fontSize: 13, color: "var(--ink)" }}><input type="radio" checked={decision === k} onChange={() => setDecision(k)} /> {l}</label>
                  ))}
                </div>
                {decision === "confirm" ? <div className="row"><label style={{ margin: 0 }}>Severity</label><select value={sev} onChange={(x) => setSev(x.target.value)}><option>High</option><option>Medium</option><option>Low</option></select>{a?.severity && sev !== a.severity ? <span className="small bad-text">Overriding AI severity ({a.severity})</span> : null}</div> : null}
                <textarea placeholder={decision === "dismiss" ? "Reason for dismissal (required)" : "Review note (optional)"} value={note} onChange={(x) => setNote(x.target.value)} />
                <div><button className="btn primary" disabled={busy} onClick={() => submit(`/api/exceptions/${e.id}/review`, { decision, severity: sev, note })}>{busy ? "Saving..." : "Submit review"}</button></div>
              </div>
            ) : null}
            {m.user?.role === "approver" && e.status === "PENDING_APPROVAL" ? (
              <div className="stack" style={{ gap: 8 }}>
                <textarea placeholder="Approver note (required to send back)" value={note} onChange={(x) => setNote(x.target.value)} />
                <div className="row">
                  <button className="btn good" disabled={busy} onClick={() => submit(`/api/exceptions/${e.id}/approve`, { decision: "approve", note })}>{e.sup_decision === "confirmed_breach" ? "Approve finding & raise corrective action" : "Approve dismissal"}</button>
                  <button className="btn danger" disabled={busy} onClick={() => submit(`/api/exceptions/${e.id}/approve`, { decision: "send_back", note })}>Send back to supervisor</button>
                </div>
              </div>
            ) : null}
            {!["PENDING_REVIEW", "PENDING_APPROVAL"].includes(e.status) || (m.user?.role === "viewer") || (m.user?.role === "supervisor" && e.status !== "PENDING_REVIEW") || (m.user?.role === "approver" && e.status !== "PENDING_APPROVAL")
              ? <p className="small muted">{e.status === "PENDING_REVIEW" ? "Awaiting the supervisor's review." : e.status === "PENDING_APPROVAL" ? "Awaiting the approver's sign-off." : e.status === "FINDING" ? "Finding issued." : e.status === "CLOSED_NO_ISSUE" ? "Closed with no issue." : "Waiting for the AI agent."}</p> : null}
            {err ? <div className="banner bad small">{err}</div> : null}
            {d.action ? <div className="banner info small" style={{ marginTop: 8 }}>Corrective action <b>{d.action.ref}</b> · {d.action.owner} · due {d.action.due_date} · <b>{d.action.status}</b> · <Link href="/actions">open actions →</Link></div> : null}
          </div>

          <div className="card">
            <h2>Rule result</h2>
            <p>{e.rule_detail}</p>
            <div className="kv"><div>Rule</div><div>{c.ruleDescription}</div><div>Amount at risk (rule)</div><div>{pkr(e.amount_at_risk)}</div><div>Records</div><div className="mono small">{e.record_ids.join(", ")}</div></div>
          </div>
        </div>

        <div className="card">
          <div className="tabs">
            {[["evidence", "Evidence"], ["trace", "Agent trace"], ["prompt", "Exact prompt"], ["control", "Control"], ["trail", "Review trail"]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
          </div>
          {tab === "evidence" ? (
            <div className="stack" style={{ gap: 10 }}>
              <p className="small muted">Source records exactly as extracted (unmasked here for authorised auditors; the model only ever sees the masked version).</p>
              {Object.entries(e.evidence).flatMap(([t, recs]: any) => recs.map((r: any) => <RecordCard key={r.id} type={t} rec={r} />))}
              {e.related?.length ? <p className="small">Related records the agent could look up: {e.related.map((r: any) => <span key={r.id} className="mono">{r.id} </span>)}</p> : null}
            </div>
          ) : null}
          {tab === "trace" ? (
            !run ? <p className="muted">No agent run yet.</p> : (
              <div className="stack" style={{ gap: 10 }}>
                <div className="row small"><span className="pill">{run.llm_calls} model calls</span><span className="pill">{run.total_tokens.toLocaleString()} tokens ({run.prompt_tokens.toLocaleString()} in · {run.completion_tokens.toLocaleString()} out · {run.cached_tokens.toLocaleString()} cached)</span><span className="pill">{usd(run.cost_usd)}</span><span className="pill">{(run.latency_ms / 1000).toFixed(1)}s</span><span className="pill">{run.prompt_version}</span></div>
                <div className="steps">
                  {run.steps.map((s: any, i: number) => (
                    <div key={i} className={`step ${s.type}`}>
                      {s.type === "context" ? <div className="small"><b>Context built</b> · {s.masked_fields} PII fields masked · {s.prompt_chars.toLocaleString()} chars</div> : null}
                      {s.type === "llm" ? <div className="small"><b>Model call {s.step}</b> · {s.latency_ms} ms · {s.usage.total_tokens} tokens
                        {s.reasoning ? <details><summary className="muted">reasoning</summary><pre>{s.reasoning}</pre></details> : null}
                        {s.tool_calls?.map((t: any, j: number) => <div key={j} className="mono" style={{ marginTop: 4 }}>→ {t.name}({t.name === "submit_assessment" ? "…" : t.arguments})</div>)}
                        {s.content ? <div className="muted">{s.content}</div> : null}</div> : null}
                      {s.type === "tool" ? <div className="small"><b>Tool: {s.name}</b> <span className="mono muted">{JSON.stringify(s.arguments)}</span><pre style={{ marginTop: 4 }}>{s.result_preview}</pre></div> : null}
                      {s.type === "error" ? <div className="small bad-text">Model error at step {s.step}: {s.error}</div> : null}
                    </div>
                  ))}
                </div>
                {d.runs.length > 1 ? <p className="small muted">{d.runs.length} runs recorded for this exception (including retries).</p> : null}
              </div>
            )
          ) : null}
          {tab === "prompt" ? <div className="stack" style={{ gap: 8 }}><h3>System prompt</h3><pre>{d.prompt.system}</pre><h3>User message (masked evidence)</h3><pre>{d.prompt.user}</pre></div> : null}
          {tab === "control" ? <div className="kv">
            <div>Control</div><div>{c.id} {c.name}</div><div>Risk</div><div>{c.risk}</div><div>Control statement</div><div>{c.controlStatement}</div><div>Rule</div><div>{c.ruleDescription}</div>
            <div>Severity rubric</div><div>{c.severityRubric}</div><div>Accepted explanations</div><div>{c.legitimateExplanations}</div><div>Process owner</div><div>{c.owner}</div><div>Sources</div><div>{c.sourceSystems.join(", ")}</div><div>Regulation</div><div>{c.regulation}</div>
          </div> : null}
          {tab === "trail" ? <table><tbody>{d.log.map((l: any) => <tr key={l.id}><td className="small muted">{dt(l.at)}</td><td className="small"><b>{l.action}</b> · {l.actor}</td><td className="small">{l.detail}</td></tr>)}</tbody></table> : null}
        </div>
      </div>
    </div>
  );
}
