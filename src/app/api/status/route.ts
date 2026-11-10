import { db } from "@/lib/db";
import { explainDbError } from "@/lib/db-diagnose";
import { APP_VERSION } from "@/lib/version";

// Public status check: /api/status. Says whether the database answers and whether every table exists, with a plain
// explanation if not. Shows no data, hosts or passwords. Use it when the site shows "Something went wrong".
export const dynamic = "force-dynamic";

const TABLES = ["user", "session", "setting", "role", "employee", "lead", "attendanceDay", "errorLog", "backupRun", "pushSubscription", "passwordToken", "messageTemplate", "feedPost"] as const;

export async function GET() {
  const out: Record<string, unknown> = { version: APP_VERSION, time: new Date().toISOString() };
  try {
    await db.$queryRawUnsafe("SELECT 1");
    out.database = "ok";
  } catch (e) {
    return Response.json({ ...out, ok: false, database: explainDbError(e) }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const missing: { table: string; problem: ReturnType<typeof explainDbError> }[] = [];
  for (const t of TABLES) {
    try { await (db as unknown as Record<string, { count: () => Promise<number> }>)[t]!.count(); } catch (e) { missing.push({ table: t, problem: explainDbError(e) }); }
  }
  const ok = missing.length === 0;
  return Response.json({ ...out, ok, tables: ok ? "all present" : missing, ...(ok ? {} : { fix: "Redeploy in hPanel so the build updates the database (npm run build runs prisma db push)." }) }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
