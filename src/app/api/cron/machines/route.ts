import { timingSafeEqual } from "node:crypto";
import { runMachines } from "@/lib/cron-jobs";

// Hostinger cron every 5–15 minutes: GET https://<domain>/api/cron/machines?key=<CRON_SECRET>
// Also started every 10 minutes by the keep-awake ping (lib/cron-jobs.ts runDueJobs).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!secret || secret === "change-me" || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json(await runMachines());
}
