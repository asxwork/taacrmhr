import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { smtpConfigured } from "@/lib/mail";

const startedAt = Date.now();

/**
 * Super Admin diagnostics: how fast the database answers from this server and how long the app has been running
 * (a few seconds = it just woke up, which makes the first page slow). Open /api/health in the browser.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isSuperAdmin) return new Response("Not found", { status: 404 });
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await db.$queryRawUnsafe("SELECT 1");
    times.push(performance.now() - t);
  }
  const t = performance.now();
  const leads = await db.lead.count();
  const countMs = performance.now() - t;
  const url = process.env.DATABASE_URL ?? "";
  let dbHost = "unknown";
  try { dbHost = url.startsWith("file:") ? "local file (SQLite)" : new URL(url).hostname; } catch {}
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return Response.json({
    database: {
      host: dbHost,
      pingMs: { average: Math.round(avg * 10) / 10, best: Math.round(Math.min(...times) * 10) / 10, worst: Math.round(Math.max(...times) * 10) / 10 },
      countLeadsMs: Math.round(countMs * 10) / 10, leads,
      verdict: avg < 5 ? "fast (same server)" : avg < 25 ? "ok (nearby server)" : "slow: the database is far from the app, every page waits on it",
    },
    app: { runningForSeconds: Math.round((Date.now() - startedAt) / 1000), node: process.version, timezone: process.env.TZ, emailConfigured: smtpConfigured() },
  }, { headers: { "Cache-Control": "no-store" } });
}
