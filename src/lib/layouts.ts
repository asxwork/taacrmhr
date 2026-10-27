// Settings → Layouts: per app and audience (Super Admin, a role, everyone) — the sidebar style, hidden menu items,
// module order, the page an app opens on, and for "home" which app tiles show and where people land after sign-in.
// Layouts only arrange what permissions already allow; they never grant access.
import type { LayoutProfile } from "@prisma/client";
import { db } from "./db";
import { memo } from "./memo";
import type { SessionUser } from "./auth";

export const LAYOUT_STYLES = [
  { value: "", label: "App default" },
  { value: "modules", label: "Icon rail + panel (like HR)" },
  { value: "list", label: "Simple list" },
] as const;

export type ResolvedLayout = { style?: "modules" | "list"; hidden: Set<string>; order: string[]; landing?: string; apps?: string[] };

const split = (v: string | null) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function allLayouts() {
  return memo("layout:all", 300_000, async () => {
    const [rows, roles] = await Promise.all([db.layoutProfile.findMany({ orderBy: { sortOrder: "asc" } }), db.role.findMany({ select: { id: true, name: true } })]);
    return { rows, roleNames: new Map(roles.map((r) => [r.id, r.name])) };
  });
}

/** The layout per app key for this user: Super Admin layout > their role's layout > everyone's layout. */
export async function layoutsFor(user: SessionUser): Promise<Map<string, ResolvedLayout>> {
  const { rows, roleNames } = await allLayouts();
  const rank = (p: LayoutProfile) =>
    p.audience === "superadmin" ? (user.isSuperAdmin ? 3 : -1)
    : p.audience === "role" ? (p.roleId && user.roleNames.includes(roleNames.get(p.roleId) ?? "\u0000") ? 2 : -1)
    : 1;
  const best = new Map<string, LayoutProfile>();
  for (const p of rows) {
    const r = rank(p);
    if (r < 0) continue;
    const cur = best.get(p.appKey);
    if (!cur || r > rank(cur)) best.set(p.appKey, p);
  }
  return new Map([...best.entries()].map(([k, p]) => [k, {
    style: p.style === "modules" || p.style === "list" ? p.style : undefined,
    hidden: new Set(split(p.hidden)), order: split(p.order), landing: p.landing ?? undefined, apps: p.apps ? split(p.apps) : undefined,
  }]));
}
