import { requireRole, handle } from "@/lib/auth";
import { getSetting, setSetting, log } from "@/lib/db";
import { generateReport } from "@/lib/ai/copilot";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() { return handle(async () => { await requireRole(); return { report: await getSetting("latest_report", null) }; }); }
export async function POST() {
  return handle(async () => {
    const s = await requireRole("supervisor", "approver");
    const r = await generateReport();
    const rep = { ...r, generated_by: s.name };
    await setSetting("latest_report", rep);
    await log(s.name, s.role, "REPORT_GENERATED", "audit committee report", `${r.usage.total_tokens} tokens`);
    return { report: rep };
  });
}
