import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { backupIfDue } from "@/lib/backup";
import { runDaily } from "@/lib/cron-jobs";

// Hostinger cron (once a day, e.g. 07:00): GET https://<domain>/api/cron/daily?key=<CRON_SECRET>
// Also started by the keep-awake ping when due (lib/cron-jobs.ts runDueJobs), so it runs even if this link breaks.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!secret || secret === "change-me" || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) {
    return new Response("Forbidden", { status: 403 });
  }
  const result = await runDaily(new URL(req.url).searchParams.get("weekly") === "1");
  // Google Drive backup, if connected and not done in the last 20 hours (runs after this answers).
  after(() => backupIfDue().catch(() => {}));
  return Response.json(result);
}
