import { requireRole, handle } from "@/lib/auth";
import { q } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  return handle(async () => {
    await requireRole();
    return { rows: await q(`SELECT a.*, a.due_date::text AS due_date, e.ref AS exception_ref, e.title, e.sup_severity, e.amount_at_risk::float AS amount_at_risk FROM corrective_actions a JOIN exceptions e ON e.id=a.exception_id ORDER BY a.id DESC`) };
  });
}
