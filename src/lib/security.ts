// Sign-in controls (Settings → Security and each role's sign-in hours): idle sign-out, who must use two-step
// login, and the hours a role may use the app.
import { db } from "./db";
import { memo } from "./memo";

export type LoginWindow = { from: string; to: string; days: number[] };
export type SecuritySettings = { idleMinutes: number; require2fa: "none" | "superadmin" | "all" };
export const SECURITY_KEYS = { idleMinutes: "security.idleMinutes", require2fa: "security.require2fa" } as const;

export function securitySettings(): Promise<SecuritySettings> {
  return memo("setting:security", 60_000, async () => {
    const rows = await db.setting.findMany({ where: { key: { in: Object.values(SECURITY_KEYS) } } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const req = get(SECURITY_KEYS.require2fa);
    return { idleMinutes: Math.max(0, Number(get(SECURITY_KEYS.idleMinutes)) || 0), require2fa: req === "superadmin" || req === "all" ? req : "none" };
  });
}

/**
 * The hours a user may sign in, from their roles: the most generous combination (earliest start, latest end, any
 * listed day). A role without hours means any time, so the whole user is unrestricted.
 */
export function windowFromRoles(roles: { loginFrom: string | null; loginTo: string | null; loginDays: string | null }[]): LoginWindow | null {
  if (!roles.length || roles.some((r) => !r.loginFrom || !r.loginTo)) return null;
  const days = new Set<number>();
  for (const r of roles) for (const d of (r.loginDays || "1,2,3,4,5,6,7").split(",").map(Number)) if (d >= 1 && d <= 7) days.add(d);
  return {
    from: roles.map((r) => r.loginFrom!).sort()[0]!,
    to: roles.map((r) => r.loginTo!).sort().at(-1)!,
    days: [...days].sort(),
  };
}

/** Is `now` (company time zone) inside the window? Overnight windows (e.g. 20:00–04:00) work too. */
export function insideWindow(w: LoginWindow, now = new Date()) {
  const day = now.getDay() === 0 ? 7 : now.getDay();
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const inTime = w.from <= w.to ? hm >= w.from && hm < w.to : hm >= w.from || hm < w.to;
  return w.days.includes(day) && inTime;
}

export const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const describeWindow = (w: LoginWindow) => `${w.days.map((d) => DAY_NAMES[d]).join(", ")} · ${w.from}–${w.to}`;
