// The apps (lib/nav.ts) a user may open, with their menus trimmed to what the user's roles allow.
import { APPS, type AppDef, type NavItem } from "./nav";
import { can } from "./permissions";
import type { SessionUser } from "./auth";
import { layoutsFor, type ResolvedLayout } from "./layouts";

export type UserApp = AppDef & { /** Where the app opens: its home if the user may see it, else its first page. */ start: string };

const allowed = (user: SessionUser, i: NavItem) =>
  (!i.module || can(user, i.module, i.action ?? "view")) && (!i.superAdmin || user.isSuperAdmin) && (!i.boss || user.isBoss || user.isSuperAdmin);
const gated = (i: NavItem): boolean => !!(i.module || i.superAdmin || i.boss) || !!i.children?.some(gated);

/** Items the user may open; a sub-menu keeps only its allowed entries and disappears when none are left. */
function trim(user: SessionUser, items: NavItem[]): NavItem[] {
  return items.flatMap((i) => {
    if (!i.children) return allowed(user, i) ? [i] : [];
    const children = trim(user, i.children);
    return children.length ? [{ ...i, href: children[0]!.href, children }] : [];
  });
}

/** Hides the layout's menu items (sub-menus keep their remaining entries). */
function hide(items: NavItem[], hidden: Set<string>): NavItem[] {
  return items.flatMap((i) => {
    if (!i.children) return hidden.has(i.href) ? [] : [i];
    const children = hide(i.children, hidden);
    return children.length ? [{ ...i, href: children[0]!.href, children }] : [];
  });
}

/** Apps with at least one page the user's permissions open (My Space is everyone's), arranged by their layouts. */
export function appsFor(user: SessionUser, layouts: Map<string, ResolvedLayout> = new Map()): UserApp[] {
  const apps = APPS.map((app) => {
    const l = layouts.get(app.key);
    let groups = app.groups.map((g) => ({ ...g, items: hide(trim(user, g.items), l?.hidden ?? new Set()) })).filter((g) => g.items.length);
    if (l?.order.length) groups = [...groups].sort((a, b) => (l.order.indexOf(a.label ?? "") + 1 || 999) - (l.order.indexOf(b.label ?? "") + 1 || 999));
    const items = groups.flatMap((g) => g.items.flatMap((i) => i.children ?? [i]));
    const home = l?.landing && items.some((i) => i.href === l.landing) ? l.landing : app.home;
    return { ...app, layout: l?.style ?? app.layout, groups, start: items.some((i) => i.href === home) ? home : items[0]?.href ?? app.home };
  }).filter((app) => app.groups.length && (app.key === "me" || app.groups.some((g) => g.items.some(gated))));
  // "home" layout: which app tiles show, in what order (My Space always stays available).
  const tiles = layouts.get("home")?.apps;
  if (!tiles?.length) return apps;
  return apps.filter((a) => tiles.includes(a.key) || a.key === "me").sort((a, b) => (tiles.indexOf(a.key) + 1 || 999) - (tiles.indexOf(b.key) + 1 || 999));
}

/** appsFor with the user's layouts loaded. */
export async function appsForUser(user: SessionUser) {
  return appsFor(user, await layoutsFor(user));
}
