import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { LEAD_BACKUP_DIR } from "@/lib/lead-wipe";

/** Download a lead backup saved before "Delete all leads". Super Admin only. */
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin || user.viewAs) return new Response("Forbidden", { status: 403 });
  const { name } = await params;
  if (!/^leads-before-delete-[\d-]+\.xlsx$/.test(name)) return new Response("Not found", { status: 404 });
  const data = await readFile(path.join(LEAD_BACKUP_DIR, name)).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
