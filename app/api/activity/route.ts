import { requireRole, handle } from "@/lib/auth";
import { q } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() { return handle(async () => { await requireRole(); return { rows: await q("SELECT * FROM audit_log ORDER BY id DESC LIMIT 300") }; }); }
