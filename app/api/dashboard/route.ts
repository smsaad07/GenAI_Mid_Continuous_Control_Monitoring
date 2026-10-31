import { requireRole, handle } from "@/lib/auth";
import { dashboard } from "@/lib/stats";
import { ensureSeeded } from "@/lib/ingest";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() { return handle(async () => { await requireRole(); await ensureSeeded(); return dashboard(); }); }
