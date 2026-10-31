"use client";
import Link from "next/link";
import { pkr } from "./client";
import { Disp, Sev, Status, Empty } from "./ui";
export default function ExceptionTable({ rows, showReview = false }: { rows: any[]; showReview?: boolean }) {
  if (!rows.length) return <Empty>No exceptions match.</Empty>;
  return (
    <div className="tablewrap"><table>
      <thead><tr><th>Ref</th><th>Control</th><th>Exception</th><th className="num">Amount at risk</th><th>AI proposal</th><th>Severity</th><th>Status</th>{showReview ? <th>Supervisor</th> : null}</tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.id} className="click" onClick={() => (window.location.href = `/exceptions/${r.id}`)}>
          <td className="mono"><Link href={`/exceptions/${r.id}`}>{r.ref}</Link></td>
          <td className="mono small">{r.control_id}</td>
          <td>{r.title}{r.faithful === false ? <span className="pill" style={{ marginLeft: 6, borderColor: "var(--critical)", color: "var(--critical)" }}>⚠ unverified figure</span> : null}</td>
          <td className="num">{r.amount_at_risk ? pkr(r.amount_at_risk) : "-"}</td>
          <td><Disp d={r.ai_disposition} conf={r.ai_confidence} /></td>
          <td><Sev s={r.sup_severity || r.ai_severity} /></td>
          <td><Status s={r.status} />{r.appr_decision === "sent_back" && r.status === "PENDING_REVIEW" ? <div className="small bad-text">Sent back by approver</div> : null}</td>
          {showReview ? <td className="small">{r.sup_decision === "confirmed_breach" ? "Confirmed breach" : r.sup_decision === "dismissed" ? "Dismissed" : "-"}</td> : null}
        </tr>
      ))}</tbody>
    </table></div>
  );
}
