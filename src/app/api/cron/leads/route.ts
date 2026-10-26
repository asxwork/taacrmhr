import { timingSafeEqual } from "node:crypto";
import { runHoldRules } from "@/lib/lead-hold";

// Hostinger cron (hourly): GET https://<domain>/api/cron/leads?key=<CRON_SECRET>
// Runs the lead On-hold rules. They also run every few minutes while people use the app.

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!secret || secret === "change-me" || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json(await runHoldRules());
}
