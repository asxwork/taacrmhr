// The apps (lib/nav.ts) a user may open, with their menus trimmed to what the user's roles allow.
import { APPS, type AppDef, type NavItem } from "./nav";
import { can } from "./permissions";
import type { SessionUser } from "./auth";

export type UserApp = AppDef & { /** Where the app opens: its home if the user may see it, else its first page. */ start: string };

const allowed = (user: SessionUser, i: NavItem) =>
  (!i.module || can(user, i.module)) && (!i.superAdmin || user.isSuperAdmin) && (!i.boss || user.isBoss || user.isSuperAdmin);
const gated = (i: NavItem): boolean => !!(i.module || i.superAdmin || i.boss) || !!i.children?.some(gated);

/** Items the user may open; a sub-menu keeps only its allowed entries and disappears when none are left. */
function trim(user: SessionUser, items: NavItem[]): NavItem[] {
  return items.flatMap((i) => {
    if (!i.children) return allowed(user, i) ? [i] : [];
    const children = trim(user, i.children);
    return children.length ? [{ ...i, href: children[0]!.href, children }] : [];
  });
}

/** Apps with at least one page the user's permissions open (My Space is everyone's). */
export function appsFor(user: SessionUser): UserApp[] {
  return APPS.map((app) => {
    const groups = app.groups.map((g) => ({ ...g, items: trim(user, g.items) })).filter((g) => g.items.length);
    const items = groups.flatMap((g) => g.items.flatMap((i) => i.children ?? [i]));
    return { ...app, groups, start: items.some((i) => i.href === app.home) ? app.home : items[0]?.href ?? app.home };
  }).filter((app) => app.groups.length && (app.key === "me" || app.groups.some((g) => g.items.some(gated))));
}
