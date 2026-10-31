"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMonitor } from "@/components/Shell";
import { api, pkr } from "@/components/client";
import { Sev, Status, Empty } from "@/components/ui";

function ActionRow({ a, role, onDone }: { a: any; role: string; onDone: () => void }) {
  const [resp, setResp] = useState(a.management_response || "");
  const [ev, setEv] = useState(a.remediation_evidence || "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const go = async (op: string) => { setErr(""); try { await api(`/api/actions/${a.id}`, { body: { op, management_response: resp, remediation_evidence: ev, note } }); onDone(); } catch (e: any) { setErr(e.message); } };
  const overdue = a.status !== "CLOSED" && a.due_date < new Date().toISOString().slice(0, 10);
  return (
    <div className="card">
      <div className="row between">
        <div><b className="mono">{a.ref}</b> · <Link className="mono" href={`/exceptions/${a.exception_id}`}>{a.exception_ref}</Link> · {a.title}</div>
        <div className="row"><Sev s={a.sup_severity} /><Status s={a.status} /><span className={`small ${overdue ? "bad-text" : "muted"}`}>due {a.due_date}{overdue ? " (overdue)" : ""}</span></div>
      </div>
      <div className="kv" style={{ marginTop: 8 }}><div>Owner</div><div>{a.owner}</div><div>Action</div><div>{a.action}</div><div>Amount at risk</div><div>{pkr(a.amount_at_risk)}</div>
        {a.management_response ? <><div>Management response</div><div>{a.management_response}</div></> : null}
        {a.remediation_evidence ? <><div>Remediation evidence</div><div>{a.remediation_evidence}</div></> : null}
        {a.verification_note ? <><div>Verification note</div><div>{a.verification_note}</div></> : null}
        {a.closed_by ? <><div>Closed by</div><div>{a.closed_by}</div></> : null}</div>
      {role === "supervisor" && ["OPEN", "RESPONSE_RECORDED"].includes(a.status) ? (
        <div className="grid g2" style={{ marginTop: 10 }}>
          <div><label>Management response (from {a.owner})</label><textarea value={resp} onChange={(e) => setResp(e.target.value)} /></div>
          <div><label>Remediation evidence</label><textarea value={ev} onChange={(e) => setEv(e.target.value)} placeholder="e.g. duplicate payment recovered via credit note CN-..., vendor master control reconfigured" /></div>
          <div className="row"><button className="btn" onClick={() => go("respond")}>Save response</button><button className="btn primary" onClick={() => go("submit")}>Submit for verification</button></div>
        </div>
      ) : null}
      {role === "approver" && a.status === "PENDING_VERIFICATION" ? (
        <div className="row" style={{ marginTop: 10 }}><input style={{ flex: 1 }} placeholder="Verification note" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn good" onClick={() => go("close")}>Verify & close</button><button className="btn danger" onClick={() => go("reopen")}>Re-open</button></div>
      ) : null}
      {err ? <div className="bad-text small">{err}</div> : null}
    </div>
  );
}

export default function Actions() {
  const m = useMonitor();
  const [rows, setRows] = useState<any[] | null>(null);
  const [f, setF] = useState("open");
  useEffect(() => { api("/api/actions").then((r) => setRows(r.rows)); }, [m.version]);
  const shown = (rows || []).filter((a) => f === "all" || (f === "open" ? a.status !== "CLOSED" : a.status === "CLOSED"));
  return (
    <div className="stack">
      <div><h1>Corrective actions</h1><div className="sub">Raised automatically when the approver issues a finding. The supervisor records the process owner's response and remediation evidence; only the approver can verify and close (no action closes without verification).</div></div>
      <div className="tabs">{[["open", "Open"], ["closed", "Closed"], ["all", "All"]].map(([k, l]) => <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{l}</button>)}</div>
      {rows == null ? <span className="muted">Loading...</span> : shown.length ? shown.map((a) => <ActionRow key={a.id + a.status} a={a} role={m.user!.role} onDone={m.bump} />) : <div className="card"><Empty>No corrective actions here yet. They appear when the approver approves a confirmed breach.</Empty></div>}
    </div>
  );
}
