import { requireRole, handle } from "@/lib/auth";
import { q } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return handle(async () => {
    await requireRole();
    const u = new URL(req.url).searchParams;
    const w: string[] = [], p: any[] = [];
    const add = (sql: string, v: any) => { p.push(v); w.push(sql.replace("?", `$${p.length}`)); };
    if (u.get("status")) add("status = ANY(?)", u.get("status")!.split(","));
    if (u.get("control")) add("control_id = ?", u.get("control"));
    if (u.get("batch")) add("batch_no = ?", Number(u.get("batch")));
    if (u.get("disposition")) add("ai->>'disposition' = ?", u.get("disposition"));
    if (u.get("q")) { p.push(`%${u.get("q")}%`); w.push(`(title ILIKE $${p.length} OR ref ILIKE $${p.length})`); }
    const rows = await q(`SELECT id, ref, batch_no, control_id, title, status, amount_at_risk::float AS amount_at_risk, txn_date::text AS txn_date, created_at,
      ai->>'disposition' AS ai_disposition, ai->>'severity' AS ai_severity, (ai->>'confidence')::float AS ai_confidence, (ai->'faithfulness'->>'ok')::boolean AS faithful,
      ai->>'mode' AS ai_mode, sup_decision, sup_severity, sup_by, appr_decision, appr_note
      FROM exceptions ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY batch_no DESC, id DESC LIMIT 500`, p);
    return { rows };
  });
}
