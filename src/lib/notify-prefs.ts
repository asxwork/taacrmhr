// Each person's notification settings (Profile → Notifications). Stored as a setting; sensible defaults for everyone:
// one daily summary email, urgent things straight away, nothing muted.
import { db } from "./db";
import { memo, forget } from "./memo";
import type { NotifyCategory } from "./notify";

export type EmailMode = "daily" | "instant" | "urgent" | "off";
/** allLeads: also tell me about every new lead from the API, website and portals, whoever gets it (unset = on for Super Admins). */
export type NotifyPrefs = { email: EmailMode; muted: NotifyCategory[]; allLeads?: boolean };
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

/**
 * People to tell about every new incoming lead, besides its responsible person: Super Admins (unless they turned it
 * off) and anyone who turned "Every new lead" on.
 */
export async function newLeadWatchers(): Promise<string[]> {
  const [admins, rows] = await Promise.all([
    db.user.findMany({ where: { active: true, isSuperAdmin: true }, select: { id: true } }),
    db.setting.findMany({ where: { key: { startsWith: "notify:prefs:" }, value: { contains: "allLeads" } }, select: { key: true, value: true } }),
  ]);
  const choice = new Map(rows.map((r) => { try { return [r.key.slice("notify:prefs:".length), (JSON.parse(r.value) as NotifyPrefs).allLeads] as const; } catch { return [r.key, undefined] as const; } }));
  const ids = new Set(admins.filter((a) => choice.get(a.id) !== false).map((a) => a.id));
  for (const [id, on] of choice) if (on === true) ids.add(id);
  if (!ids.size) return [];
  return (await db.user.findMany({ where: { id: { in: [...ids] }, active: true }, select: { id: true } })).map((u) => u.id);
}
