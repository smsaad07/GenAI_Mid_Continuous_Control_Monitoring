"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMonitor } from "@/components/Shell";
import { api, pkr } from "@/components/client";
import ExceptionTable from "@/components/ExceptionTable";
import { Empty } from "@/components/ui";

export default function Queue() {
  const m = useMonitor();
  const [rows, setRows] = useState<any[] | null>(null);
  const [actions, setActions] = useState<any[]>([]);
  const role = m.user?.role;
  useEffect(() => {
    if (role === "supervisor") api("/api/exceptions?status=PENDING_REVIEW").then((r) => setRows(r.rows));
    if (role === "approver") { api("/api/exceptions?status=PENDING_APPROVAL").then((r) => setRows(r.rows)); api("/api/actions").then((r) => setActions(r.rows.filter((a: any) => a.status === "PENDING_VERIFICATION"))); }
    if (role === "viewer") setRows([]);
  }, [role, m.version]);
  if (role === "viewer") return <div className="card"><h1>My queue</h1><p className="sub">The Audit Committee role is read-only. See the <Link href="/">dashboard</Link> and <Link href="/report">committee report</Link>.</p></div>;
  return (
    <div className="stack">
      <div>
        <h1>{role === "supervisor" ? "Supervisor review queue" : "Approver sign-off queue"}</h1>
        <div className="sub">{role === "supervisor"
          ? "The AI has investigated each exception below and proposed a disposition and severity. Open each one, check the evidence and the agent's reasoning, then confirm, override or dismiss. Nothing becomes a finding without your review and the approver's sign-off."
          : "Supervisor decisions awaiting your sign-off. Approving a confirmed breach issues a finding and raises a corrective action for the process owner; approving a dismissal closes the exception. You can send any item back with a note."}</div>
      </div>
      {role === "supervisor" ? <div className="banner info small">Tip: high-confidence AI proposals are not a reason to skip the evidence. The evaluation page reports the false-clear rate separately for high-confidence outputs for exactly this reason.</div> : null}
      <div className="card">{rows ? <ExceptionTable rows={rows} showReview={role === "approver"} /> : <span className="muted">Loading...</span>}</div>
      {role === "approver" ? (
        <div className="card">
          <h2>Corrective actions awaiting verification</h2>
          {actions.length ? <table><thead><tr><th>Action</th><th>Exception</th><th>Owner</th><th>Evidence submitted</th></tr></thead><tbody>
            {actions.map((a) => <tr key={a.id}><td className="mono"><Link href="/actions">{a.ref}</Link></td><td className="mono">{a.exception_ref}</td><td>{a.owner}</td><td className="small">{a.remediation_evidence}</td></tr>)}
          </tbody></table> : <Empty>Nothing awaiting verification.</Empty>}
        </div>
      ) : null}
    </div>
  );
}
