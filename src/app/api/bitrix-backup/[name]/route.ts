import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { getCurrentUser } from "@/lib/auth";
import { bitrixBackupFile } from "@/lib/bitrix-backup";

/** Download a Bitrix backup to your own computer (Settings → Bitrix sync → backups). Super Admin only; streamed. */
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin || user.viewAs) return new Response("Forbidden", { status: 403 });
  const name = decodeURIComponent((await params).name);
  const file = bitrixBackupFile(name);
  const info = file ? await stat(file).catch(() => null) : null;
  if (!file || !info) return new Response("Not found", { status: 404 });
  const type = name.endsWith(".xlsx") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/gzip";
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { "Content-Type": type, "Content-Length": String(info.size), "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
