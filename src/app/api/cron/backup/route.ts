import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { backupIfDue } from "@/lib/backup";

// Hostinger cron (once a day, e.g. 02:00): GET https://<domain>/api/cron/backup?key=<CRON_SECRET>
// Answers straight away and backs up in the background (a big database can take a few minutes).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!secret || secret === "change-me" || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) {
    return new Response("Forbidden", { status: 403 });
  }
  after(() => backupIfDue().catch(() => {}));
  return Response.json({ ok: true, started: true });
}
