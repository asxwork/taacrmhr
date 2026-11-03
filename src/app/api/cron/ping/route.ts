import { db } from "@/lib/db";

// Keep-awake for shared hosting: a Hostinger cron hitting this every 5 minutes stops the app (and its database
// connection) going to sleep, so the first click of the day isn't a cold start. Public on purpose: it reveals nothing.
export async function GET() {
  await db.$queryRawUnsafe("SELECT 1");
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
