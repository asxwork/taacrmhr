// Error log: every server crash and browser error, grouped by message + page, so problems show up in
// Settings → System health (and a daily email) before staff report them. Never throws.
import { createHash } from "node:crypto";
import { db } from "./db";

export async function logError(e: { source: "server" | "browser"; message: string; stack?: string | null; path?: string | null; userId?: string | null }) {
  try {
    const message = (e.message || "Unknown error").slice(0, 2000);
    const path = e.path?.split("?")[0]?.slice(0, 300) ?? null;
    const key = createHash("sha256").update(`${e.source}|${message.replace(/\d+/g, "#")}|${path ?? ""}`).digest("hex");
    const data = { stack: e.stack?.slice(0, 6000) ?? null, userId: e.userId ?? null, lastAt: new Date() };
    await db.errorLog.upsert({ where: { key }, update: { ...data, count: { increment: 1 } }, create: { key, source: e.source, message, path, ...data } });
  } catch { /* the error log must never cause an error */ }
}
