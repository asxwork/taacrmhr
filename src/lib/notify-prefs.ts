// Each person's notification settings (Profile → Notifications). Stored as a setting; sensible defaults for everyone:
// one daily summary email, urgent things straight away, nothing muted.
import { db } from "./db";
import { memo, forget } from "./memo";
import type { NotifyCategory } from "./notify";

export type EmailMode = "daily" | "instant" | "urgent" | "off";
export type NotifyPrefs = { email: EmailMode; muted: NotifyCategory[] };
export const DEFAULT_PREFS: NotifyPrefs = { email: "daily", muted: [] };
export const EMAIL_MODES: [EmailMode, string, string][] = [
  ["daily", "One summary email a day (recommended)", "Every morning: your leads, follow-ups and everything that happened. Urgent things still come straight away."],
  ["urgent", "Only urgent emails", "No daily email; only urgent things (overdue, failures, security) by email."],
  ["instant", "Every notification by email", "An email for each notification as it happens."],
  ["off", "No emails", "Notifications stay inside AMS only."],
];
const key = (userId: string) => `notify:prefs:${userId}`;

export function notifyPrefs(userId: string): Promise<NotifyPrefs> {
  return memo(`setting:${key(userId)}`, 60_000, async () => {
    const row = await db.setting.findUnique({ where: { key: key(userId) } });
    try { return { ...DEFAULT_PREFS, ...(row ? JSON.parse(row.value) : {}) } as NotifyPrefs; } catch { return DEFAULT_PREFS; }
  });
}

export async function saveNotifyPrefs(userId: string, prefs: NotifyPrefs) {
  const value = JSON.stringify(prefs);
  await db.setting.upsert({ where: { key: key(userId) }, update: { value }, create: { key: key(userId), value } });
  forget(`setting:${key(userId)}`);
}
