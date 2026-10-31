import { requireRole, handle } from "@/lib/auth";
import { q } from "@/lib/db";
export async function GET(req: Request) {
  return handle(async () => {
    await requireRole();
    const type = new URL(req.url).searchParams.get("type") || "vendor";
    return { rows: await q("SELECT id, data FROM master_data WHERE type=$1 ORDER BY id LIMIT 400", [type]) };
  });
}
