import { requireRole, handle } from "@/lib/auth";
import { computeEval } from "@/lib/eval";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return handle(async () => {
    await requireRole();
    const b = new URL(req.url).searchParams.get("batches");
    return computeEval({ batches: b ? b.split(",").map(Number).filter(Boolean) : undefined });
  });
}
