// The apps (lib/nav.ts) a user may open, with their menus trimmed to what the user's roles allow.
import { APPS, type AppDef, type NavItem } from "./nav";
import { can } from "./permissions";
import type { SessionUser } from "./auth";

export type UserApp = AppDef & { /** Where the app opens: its home if the user may see it, else its first page. */ start: string };

const allowed = (user: SessionUser, i: NavItem) =>
  (!i.module || can(user, i.module)) && (!i.superAdmin || user.isSuperAdmin) && (!i.boss || user.isBoss || user.isSuperAdmin);
const gated = (i: NavItem) => !!(i.module || i.superAdmin || i.boss);

/** Apps with at least one page the user's permissions open (My Space is everyone's). */
export function appsFor(user: SessionUser): UserApp[] {
  return APPS.map((app) => {
    const groups = app.groups.map((g) => ({ ...g, items: g.items.filter((i) => allowed(user, i)) })).filter((g) => g.items.length);
    const items = groups.flatMap((g) => g.items);
    return { ...app, groups, start: items.some((i) => i.href === app.home) ? app.home : items[0]?.href ?? app.home };
  }).filter((app) => app.groups.length && (app.key === "me" || app.groups.some((g) => g.items.some(gated))));
}
