import { isCallSupervisor } from "./calls";
// The apps (lib/nav.ts) a user may open, with their menus trimmed to what the user's roles allow.
import { APPS, type AppDef, type NavItem } from "./nav";
import { can, scopeFor } from "./permissions";
import type { SessionUser } from "./auth";
import { layoutsFor, type ResolvedLayout } from "./layouts";
import { disabledFeatures, featureForPath, hrAccess, type HrAccess } from "./features";

export type UserApp = AppDef & { /** Where the app opens: its home if the user may see it, else its first page. */ start: string };

const allowed = (user: SessionUser, i: NavItem) =>
  (!i.module || can(user, i.module, i.action ?? "view") || !!i.anyModule?.some((m) => can(user, m))) && (!i.superAdmin || user.isSuperAdmin) && (!i.boss || user.isBoss || user.isSuperAdmin) && (!i.callSupervisor || isCallSupervisor(user));
// An app shows when the user can open at least one real page of it (items marked `ungated`, like Hierarchy, don't count).
const gated = (i: NavItem): boolean => (!i.ungated && !!(i.module || i.superAdmin || i.boss)) || !!i.children?.some(gated);

/** Items the user may open; a sub-menu keeps only its allowed entries and disappears when none are left. */
function trim(user: SessionUser, items: NavItem[]): NavItem[] {
  return items.flatMap((i) => {
    if (!i.children) return allowed(user, i) ? [i] : [];
    const children = trim(user, i.children);
    return children.length ? [{ ...i, href: children[0]!.href, children }] : [];
  });
}

/** Drops switched-off features from a menu item, inside sub-menus too (a sub-menu with nothing left goes). */
function dropOff(i: NavItem, off: Set<string>): NavItem[] {
  if (!i.children) return featureForPath(i.href, off) ? [] : [i];
  const children = i.children.flatMap((c) => dropOff(c, off));
  return children.length ? [{ ...i, href: children[0]!.href, children }] : [];
}

/** Hides the layout's menu items (sub-menus keep their remaining entries). */
function hide(items: NavItem[], hidden: Set<string>): NavItem[] {
  return items.flatMap((i) => {
    if (!i.children) return hidden.has(i.href) ? [] : [i];
    const children = hide(i.children, hidden);
    return children.length ? [{ ...i, href: children[0]!.href, children }] : [];
  });
}

// HR modules that only HR staff hold (no own/team scope): having one means company-wide HR work.
const HR_STAFF = ["hr.recruitment", "hr.assets", "hr.onboarding", "hr.payrollchecklist"];
const HR_SCOPED = ["hr.employees", "hr.attendance", "hr.leave", "hr.payroll", "hr.performance", "hr.expenses", "hr.leaveplanner", "hr.shiftswap", "hr.checkins", "hr.exit"];
/** Whether the user works in the HR app, or does everything from My Space (see HrAccess in lib/features.ts). */
export function usesHrApp(user: SessionUser, mode: HrAccess = "hr") {
  if (user.isSuperAdmin || HR_STAFF.some((m) => can(user, m))) return true;
  const scopes = HR_SCOPED.flatMap((m) => [scopeFor(user, m, "view"), scopeFor(user, m, "approve")]);
  if (scopes.includes("all")) return true;
  return mode === "managers" && scopes.includes("team");
}

/** Apps with at least one page the user's permissions open (My Space is everyone's), arranged by their layouts. */
export function appsFor(user: SessionUser, layouts: Map<string, ResolvedLayout> = new Map(), off: Set<string> = new Set(), mode: HrAccess = "hr"): UserApp[] {
  const hrApp = !off.has("app-hr") && usesHrApp(user, mode);
  // An app switched off in Settings → Apps & features leaves the app list and the app switcher completely.
  // Employees (and managers, if so set) don't get the HR app; My Space has their part of it ("My team" for managers).
  const apps = APPS.filter((app) => !off.has(`app-${app.key}`) && (app.key !== "hr" || hrApp)).map((app) => {
    const l = layouts.get(app.key);
    let groups = app.groups.filter((g) => !(app.key === "me" && g.label === "My team" && (hrApp || off.has("app-hr")))).map((g) => ({ ...g, items: hide(trim(user, g.items), l?.hidden ?? new Set()).flatMap((i) => dropOff(i, off)) })).filter((g) => g.items.length);
    if (l?.order.length) groups = [...groups].sort((a, b) => (l.order.indexOf(a.label ?? "") + 1 || 999) - (l.order.indexOf(b.label ?? "") + 1 || 999));
    const items = groups.flatMap((g) => g.items.flatMap((i) => i.children ?? [i]));
    const home = l?.landing && items.some((i) => i.href === l.landing) ? l.landing : app.home;
    return { ...app, layout: l?.style ?? app.layout, groups, start: items.some((i) => i.href === home) ? home : items[0]?.href ?? app.home };
  }).filter((app) => app.groups.length && (app.key === "me" || app.key === "learn" || app.groups.some((g) => g.items.some(gated))));
  // "home" layout: which app tiles show, in what order (My Space always stays available).
  const tiles = layouts.get("home")?.apps;
  if (!tiles?.length) return apps;
  return apps.filter((a) => tiles.includes(a.key) || a.key === "me" || a.key === "learn").sort((a, b) => (tiles.indexOf(a.key) + 1 || 999) - (tiles.indexOf(b.key) + 1 || 999));
}

/** appsFor with the user's layouts loaded. */
export async function appsForUser(user: SessionUser) {
  const [layouts, off, mode] = await Promise.all([layoutsFor(user), disabledFeatures(), hrAccess()]);
  return appsFor(user, layouts, off, mode);
}
