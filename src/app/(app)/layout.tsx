import { FlashToast } from "@/components/after-save";
import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { Eye } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { appsForUser } from "@/lib/apps";
import { appForPathFrom, sidebarMode, type AppKey } from "@/lib/nav";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";
import { CommandPalette } from "@/components/command-palette";
import { NavProgress } from "@/components/nav-progress";
import { unreadCount, urgentUnread } from "@/lib/notify";
import { chatUnread } from "@/lib/chat";
import { maybeRunHoldRules } from "@/lib/lead-hold";
import { db } from "@/lib/db";
import { memo } from "@/lib/memo";
import { PageHelp } from "@/components/page-help";
import { BackLink } from "@/components/back-link";
import { visibleTutorials } from "@/lib/tutorial-access";
import { sectionVideos, videoUrl } from "@/lib/section-videos";
import { SECTIONS, type SectionTab } from "@/lib/sections";
import { SectionTabs } from "@/components/section-tabs";
import { NotificationPulse } from "@/components/notification-pulse";
import { ListMemory } from "@/components/list-memory";
import { redirect } from "next/navigation";
import { securitySettings, twoStepRequired } from "@/lib/security";
import { IdleSignOut } from "@/components/idle-sign-out";
import { logout } from "@/app/login/actions";
import { disabledFeatures, featureForPath } from "@/lib/features";
import { can } from "@/lib/permissions";
import { FeatureOff } from "@/components/feature-off";
import { MainWidth } from "@/components/main-width";
import { fileUrl } from "@/lib/files";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  maybeRunHoldRules(); // background, at most every 5 minutes
  // Everything the frame needs, fetched side by side (each is a database round trip on the live server).
  // apps = only the apps and pages this user's roles allow — this is what makes Admin and Agent see different apps.
  const [jar, h, apps, me, off, security, unread, banner, videos] = await Promise.all([
    cookies(), headers(), appsForUser(user),
    db.employee.findUnique({ where: { userId: user.id }, select: { photo: true } }),
    disabledFeatures(), securitySettings(), Promise.all([unreadCount(user.id), urgentUnread(user.id), can(user, "chat") ? disabledFeatures().then((o) => (o.has("app-chat") ? -1 : chatUnread(user.id))) : Promise.resolve(-1)]),
    memo("setting:banner", 30_000, async () => (await db.setting.findUnique({ where: { key: "maintenance.banner" } }))?.value ?? ""),
    sectionVideos(),
  ]);

  const collapsed = jar.get("sidebar")?.value === "collapsed";
  const myPhoto = me?.photo ?? null;
  const last = apps.find((a) => a.key === jar.get("app")?.value);
  const current = appForPathFrom(apps, h.get("x-pathname") ?? "", last?.key) ?? last ?? apps[0]!;
  // Pages of a feature switched off in Settings → Features show a notice instead.
  const offFeature = featureForPath(h.get("x-pathname") ?? "", off);
  // Two-step login required by policy (Settings → Security) and not set up yet: set it up first.
  const needs2fa = !user.viewAs && !user.totpEnabled && twoStepRequired(user, security, can(user, "finance") || can(user, "finance.boss"));
  if (needs2fa && (h.get("x-pathname") ?? "") !== "/profile/security") redirect("/profile/security");
  // Section tabs (CRM: Leads / Deals / Calls / Contacts / Inventory / Reports), filtered by permission and features.
  const tabAllowed = (t: SectionTab) => (!t.module || can(user, t.module, t.action ?? "view")) && (!t.superAdmin || user.isSuperAdmin) && !featureForPath(t.href, off);
  // Every page with where it lives (App › Section › Sub-menu), for search and the back links. The same name in two
  // apps (e.g. "My Space" in Tutorials and the My Space app) is told apart by its path.
  type PageHit = { href: string; label: string; icon: string; path: string[] };
  const pageItems: PageHit[] = apps.flatMap((a) => a.groups.flatMap((g) => g.items.flatMap((item) =>
    (item.children ? item.children.map((c) => ({ ...c, trail: [a.name, g.label, item.label] })) : [{ ...item, trail: [a.name, g.label] }])
      .filter((x) => !x.phase)
      .map((x) => ({ href: x.href, label: x.label, icon: x.icon, path: x.trail.filter((t, i, all): t is string => !!t && t !== x.label && t !== all[i - 1]) })))));
  const appFor = (href: string) => [...apps].sort((x, y) => Math.max(0, ...y.prefixes.map((p) => (href.startsWith(p) ? p.length : 0))) - Math.max(0, ...x.prefixes.map((p) => (href.startsWith(p) ? p.length : 0))))[0];
  const sectionPages: PageHit[] = SECTIONS.flatMap((sec) => sec.tabs.filter(tabAllowed).map((t) => ({ href: t.href, label: t.label, icon: "list", path: [apps.find((a) => a.key === sec.app)?.name ?? appFor(t.href)?.name ?? ""].filter(Boolean) })));
  const appPages: PageHit[] = apps.map((a) => ({ href: a.start, label: a.name, icon: a.icon, path: ["App"] }));
  const pages = [...new Map([...appPages, ...pageItems, ...sectionPages].map((p) => [`${p.href}|${p.label}`, p])).values()];

  return (
    <div className="app-wallpaper min-h-screen" data-sidebar={sidebarMode(current.layout, collapsed)}>
      <NavProgress />
      {!user.viewAs && <NotificationPulse unread={unread[0]} chat={unread[2]} />}
      <Suspense><ListMemory /></Suspense>
      {/* "?" help button: the guide for the page you're on, from the sections you use. */}
      <PageHelp items={visibleTutorials(user).filter((t) => t.href || t.paths?.length).map((t) => ({ key: t.key, title: t.title, summary: t.summary, paths: [...(t.href ? [t.href] : []), ...(t.paths ?? [])], video: videos[t.key] ? videoUrl(t.key) : undefined }))} />
      <Sidebar
        apps={apps}
        initialApp={current.key as AppKey}
        user={{ name: user.name, roles: user.roleNames.join(", ") || "No role", branch: user.branchName, photo: myPhoto ? fileUrl(myPhoto, 160) : null }}
        unread={unread[0]}
        urgent={unread[1]}
        chat={unread[2]}
        initiallyCollapsed={collapsed}
      />
      <main className="app-main">
        {banner && <div className="sticky top-0 z-30 bg-sky-600 px-4 py-2 text-center text-sm font-medium text-white print:hidden" role="status">{banner}</div>}
        {user.viewAs && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-navy-950 print:hidden">
            <Eye className="size-4" aria-hidden />
            Viewing as <b>{user.name}</b> ({user.roleNames.join(", ") || "no role"}) · read-only, changes are blocked
            {/* A full page load: the route clears the cookie and redirects. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/view-as?exit=1" className="rounded-md bg-navy-950 px-3 py-1 text-xs font-semibold text-white hover:bg-navy-800">Exit, back to {user.viewAs.realName}</a>
          </div>
        )}
        <MainWidth>
          <PageTransition>
            {/* View as is read-only: every input and button on the page is disabled (the server refuses writes too). */}
            <fieldset disabled={!!user.viewAs} className="m-0 min-w-0 border-0 p-0">
              <Suspense><BackLink pages={pages.map((x) => ({ href: x.href, label: x.label }))} apps={apps.map((a) => ({ key: a.key, name: a.name, home: a.home, prefixes: a.prefixes }))} /></Suspense>
              <Suspense><FlashToast /></Suspense>
              {!offFeature && <Suspense><SectionTabs sections={SECTIONS
                // In My Space (e.g. a manager's My team pages) HR's own tabs — shifts, machines, logs — stay hidden.
                .filter((sec) => current.key !== "me" || sec.app === "me" || !sec.tabs.some((t) => t.href.startsWith("/hr")))
                .map((sec) => ({ ...sec, tabs: sec.tabs.filter(tabAllowed) })).filter((sec) => sec.tabs.length > 1)} app={current.key} /></Suspense>}
              {offFeature ? <FeatureOff label={offFeature.label} canManage={user.isSuperAdmin || can(user, "settings.company", "edit")} /> : children}
            </fieldset>
          </PageTransition>
        </MainWidth>
      </main>
      <CommandPalette pages={pages} />
      {!user.viewAs && <IdleSignOut minutes={security.idleMinutes} signOut={logout} />}
    </div>
  );
}
