import { after } from "next/server";
import { db } from "@/lib/db";
import { beat, watchdog } from "@/lib/heartbeat";

// Keep-awake for shared hosting: a Hostinger cron hitting this every 5 minutes stops the app (and its database
// connection) going to sleep, so the first click of the day isn't a cold start. Public on purpose: it reveals nothing.
// It also records a heartbeat and, once a day, alerts Super Admins if another job stopped or errors appeared.
export async function GET() {
  await db.$queryRawUnsafe("SELECT 1");
  after(async () => { await beat("ping"); await watchdog().catch(() => {}); });
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
