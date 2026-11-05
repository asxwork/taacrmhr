import { timingSafeEqual } from "node:crypto";
import { syncAllPullMachines } from "@/lib/attendance-machine";

// Hostinger cron every 5–15 minutes: GET https://<domain>/api/cron/machines?key=<CRON_SECRET>
// Reads new punches from machines AMS connects to directly (Attendance → Attendance Machines).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!secret || secret === "change-me" || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) {
    return new Response("Forbidden", { status: 403 });
  }
  const machines = await syncAllPullMachines();
  await (await import("@/lib/heartbeat")).beat("machines");
  return Response.json({ ok: true, machines });
}
