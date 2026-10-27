import { readFile } from "node:fs/promises";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { resolveUpload } from "@/lib/files";

/** Plays or downloads a recording: Super Admins only, and every access is written to the audit log. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return new Response("Not found", { status: 404 });
  const rec = await db.callRecording.findUnique({ where: { id: (await params).id } });
  const abs = rec?.path ? resolveUpload(rec.path) : null;
  if (!rec || !abs) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("dl") === "1";
  const range = req.headers.get("range");
  // Audit once per listen (the first range request), not for every chunk the audio player asks for.
  if (!range || /^bytes=0-/.test(range)) await audit(user.id, download ? "download" : "play", "callRecording", rec.id, `${download ? "Downloaded" : "Played"} recording of ${rec.phone} (${rec.startedAt.toISOString().slice(0, 16).replace("T", " ")})`);
  let data: Buffer;
  try { data = await readFile(abs); } catch { return new Response("Not found", { status: 404 }); }
  const ext = rec.path!.split(".").pop();
  const headers: Record<string, string> = { "Content-Type": rec.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" };
  if (download) headers["Content-Disposition"] = `attachment; filename="call-${rec.phone}-${rec.startedAt.toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${ext}"`;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, data.length - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), data.length - 1) : data.length - 1;
    if (start >= data.length || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${data.length}` } });
    return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${data.length}`, "Content-Length": String(end - start + 1) } });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
}
