import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { UPLOAD_ROOT } from "@/lib/files";
import { linkRecording, pbxConfig } from "@/lib/softphone";

const MAX_BYTES = 60_000_000;

/** Softphone upload of a finished call's recording. Agents can add recordings but never list or play them. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "calls")) return new Response("Unauthorized", { status: 401 });
  if ((await pbxConfig()).record === "off") return Response.json({ ok: true, skipped: true });
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!fd || !(file instanceof File) || !file.size) return Response.json({ error: "No recording." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Recording too large." }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  // WebM (Chrome, Edge, Firefox, Android) or MP4 (Safari, iPhone); checked by content.
  const ext = buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? "webm" : buf.subarray(4, 8).toString() === "ftyp" ? "m4a" : buf.subarray(0, 4).toString() === "OggS" ? "ogg" : null;
  if (!ext) return Response.json({ error: "Not an audio recording." }, { status: 400 });
  const startedAt = Number(fd.get("startedAt"));
  const when = startedAt > 0 && Math.abs(Date.now() - startedAt) < 86_400_000 ? new Date(startedAt) : new Date();
  const rel = path.posix.join("calls", format(when, "yyyy-MM"), `${when.getTime()}-${randomBytes(6).toString("hex")}.${ext}`);
  const abs = path.join(UPLOAD_ROOT, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  const pbxCallId = String(fd.get("callId") ?? "").slice(0, 200) || null;
  const rec = await db.callRecording.create({
    data: {
      agentId: user.id, phone: String(fd.get("phone") ?? "").replace(/[^\d+*#]/g, "").slice(0, 30) || "unknown",
      direction: fd.get("direction") === "in" ? "in" : "out", pbxCallId, path: rel, size: buf.length,
      mime: ext === "webm" ? "audio/webm" : ext === "ogg" ? "audio/ogg" : "audio/mp4",
      durationSec: Math.max(0, Math.min(14_400, Math.round(Number(fd.get("talkSec")) || 0))), startedAt: when,
    },
  });
  if (pbxCallId) await linkRecording(pbxCallId, user.id);
  return Response.json({ ok: true, id: rec.id });
}
