import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { importFilePath } from "@/lib/call-files";

/** Download a file exactly as it was imported into a calling campaign. Super Admin only. */
export async function GET(_: Request, { params }: { params: Promise<{ campaign: string; name: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin || user.viewAs) return new Response("Forbidden", { status: 403 });
  const { campaign, name } = await params;
  const file = importFilePath(campaign, decodeURIComponent(name));
  const data = file ? await readFile(file).catch(() => null) : null;
  if (!data) return new Response("Not found", { status: 404 });
  const type = /\.xlsx$/i.test(name) ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : /\.csv$/i.test(name) ? "text/csv" : "text/plain";
  return new Response(new Uint8Array(data), { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${decodeURIComponent(name).replace(/"/g, "")}"`, "Cache-Control": "no-store" } });
}
