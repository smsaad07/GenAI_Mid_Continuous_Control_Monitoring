// Human-in-the-loop workflow. The AI only proposes; a supervisor reviews every
// exception; an approver (Head of Internal Audit) signs off every decision and
// verifies every corrective action before it closes (Phase 1, row 9a).
import { q, q1, tx } from "./db";
import { Session, HttpError } from "./auth";
import { CONTROL_BY_ID } from "./controls/catalog";

export const STATUS_LABEL: Record<string, string> = {
  NEW: "Queued for AI",
  AI_RUNNING: "AI investigating",
  PENDING_REVIEW: "Awaiting supervisor review",
  PENDING_APPROVAL: "Awaiting approver sign-off",
  FINDING: "Finding issued",
  CLOSED_NO_ISSUE: "Closed - no issue",
};

async function logTx(c: any, s: Session, action: string, entity: string, detail: string) {
  await c.query("INSERT INTO audit_log (actor, role, action, entity, detail) VALUES ($1,$2,$3,$4,$5)", [s.name, s.role, action, entity, detail]);
}

export async function supervisorReview(id: number, s: Session, body: { decision: "confirm" | "dismiss" | "rerun"; severity?: string; note?: string }) {
  return tx(async (c) => {
    const r = await c.query("SELECT * FROM exceptions WHERE id=$1 FOR UPDATE", [id]);
    const e = r.rows[0];
    if (!e) throw new HttpError(404, "Exception not found");
    if (e.status !== "PENDING_REVIEW") throw new HttpError(409, `Exception is ${STATUS_LABEL[e.status] || e.status}; supervisor review not possible`);
    if (body.decision === "rerun") {
      await c.query("UPDATE exceptions SET status='NEW', ai=NULL, claimed_at=NULL, sup_note=$2 WHERE id=$1", [id, body.note || "Re-investigation requested"]);
      await logTx(c, s, "AI_RERUN_REQUESTED", e.ref, body.note || "");
      return { ok: true };
    }
    if (body.decision === "dismiss" && !(body.note || "").trim()) throw new HttpError(400, "A reason is required to dismiss an exception");
    const sev = body.decision === "confirm" ? body.severity || e.ai?.severity || "Medium" : null;
    if (sev && !["High", "Medium", "Low"].includes(sev)) throw new HttpError(400, "Invalid severity");
    await c.query(
      "UPDATE exceptions SET status='PENDING_APPROVAL', sup_decision=$2, sup_severity=$3, sup_note=$4, sup_by=$5, sup_at=now(), appr_decision=NULL, appr_note=NULL WHERE id=$1",
      [id, body.decision === "confirm" ? "confirmed_breach" : "dismissed", sev, body.note || null, s.name],
    );
    const agree = e.ai ? (body.decision === "confirm") === (e.ai.disposition === "breach") : null;
    await logTx(c, s, body.decision === "confirm" ? "SUPERVISOR_CONFIRMED" : "SUPERVISOR_DISMISSED", e.ref,
      `${sev ? "Severity " + sev + ". " : ""}${agree === false ? "Overrode AI proposal. " : ""}${body.note || ""}`);
    return { ok: true };
  });
}

export async function approverDecision(id: number, s: Session, body: { decision: "approve" | "send_back"; note?: string }) {
  return tx(async (c) => {
    const r = await c.query("SELECT * FROM exceptions WHERE id=$1 FOR UPDATE", [id]);
    const e = r.rows[0];
    if (!e) throw new HttpError(404, "Exception not found");
    if (e.status !== "PENDING_APPROVAL") throw new HttpError(409, `Exception is ${STATUS_LABEL[e.status] || e.status}; approval not possible`);
    if (e.sup_by === s.name) throw new HttpError(403, "Segregation of duties: the reviewer cannot approve their own review");
    if (body.decision === "send_back") {
      if (!(body.note || "").trim()) throw new HttpError(400, "A note is required when sending back");
      await c.query("UPDATE exceptions SET status='PENDING_REVIEW', appr_decision='sent_back', appr_note=$2, appr_by=$3, appr_at=now() WHERE id=$1", [id, body.note, s.name]);
      await logTx(c, s, "APPROVER_SENT_BACK", e.ref, body.note || "");
      return { ok: true };
    }
    if (e.sup_decision === "confirmed_breach") {
      await c.query("UPDATE exceptions SET status='FINDING', appr_decision='approved', appr_note=$2, appr_by=$3, appr_at=now() WHERE id=$1", [id, body.note || null, s.name]);
      const ctl = CONTROL_BY_ID[e.control_id];
      const n = await c.query("SELECT count(*)::int AS n FROM corrective_actions");
      const ref = `CA-${String(n.rows[0].n + 1).padStart(4, "0")}`;
      const days = e.sup_severity === "High" ? 14 : e.sup_severity === "Medium" ? 30 : 60;
      await c.query(
        "INSERT INTO corrective_actions (ref, exception_id, control_id, owner, action, due_date, status) VALUES ($1,$2,$3,$4,$5, (now() + ($6 || ' days')::interval)::date, 'OPEN')",
        [ref, id, e.control_id, ctl.owner, e.ai?.recommended_action || `Remediate ${ctl.name} exception ${e.ref}`, String(days)],
      );
      await logTx(c, s, "FINDING_APPROVED", e.ref, `Corrective action ${ref} raised for ${ctl.owner}, due in ${days} days`);
    } else {
      await c.query("UPDATE exceptions SET status='CLOSED_NO_ISSUE', appr_decision='approved', appr_note=$2, appr_by=$3, appr_at=now() WHERE id=$1", [id, body.note || null, s.name]);
      await logTx(c, s, "DISMISSAL_APPROVED", e.ref, body.note || "");
    }
    return { ok: true };
  });
}

export async function updateAction(id: number, s: Session, body: { op: "respond" | "submit" | "close" | "reopen"; management_response?: string; remediation_evidence?: string; note?: string }) {
  const a = await q1("SELECT * FROM corrective_actions WHERE id=$1", [id]);
  if (!a) throw new HttpError(404, "Corrective action not found");
  if (body.op === "respond" || body.op === "submit") {
    if (s.role !== "supervisor") throw new HttpError(403, "Only the supervisor records management responses and remediation evidence");
    if (a.status === "CLOSED") throw new HttpError(409, "Action is closed");
    if (body.op === "submit" && !(body.remediation_evidence || a.remediation_evidence)) throw new HttpError(400, "Remediation evidence is required");
    await q("UPDATE corrective_actions SET management_response=COALESCE($2, management_response), remediation_evidence=COALESCE($3, remediation_evidence), status=$4, updated_by=$5 WHERE id=$1",
      [id, body.management_response || null, body.remediation_evidence || null, body.op === "submit" ? "PENDING_VERIFICATION" : "RESPONSE_RECORDED", s.name]);
  } else {
    if (s.role !== "approver") throw new HttpError(403, "Only the approver verifies and closes corrective actions");
    if (a.status !== "PENDING_VERIFICATION") throw new HttpError(409, "Action is not awaiting verification");
    if (body.op === "close") await q("UPDATE corrective_actions SET status='CLOSED', verification_note=$2, closed_by=$3, closed_at=now() WHERE id=$1", [id, body.note || null, s.name]);
    else await q("UPDATE corrective_actions SET status='OPEN', verification_note=$2 WHERE id=$1", [id, body.note || "Re-opened: evidence insufficient"]);
  }
  await q("INSERT INTO audit_log (actor, role, action, entity, detail) VALUES ($1,$2,$3,$4,$5)", [s.name, s.role, `ACTION_${body.op.toUpperCase()}`, a.ref, body.note || body.management_response || body.remediation_evidence || ""]);
  return { ok: true };
}
