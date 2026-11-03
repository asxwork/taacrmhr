import { cookies, headers } from "next/headers";
import { Eye } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { appsForUser } from "@/lib/apps";
import { appForPath, sidebarMode, type AppKey } from "@/lib/nav";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";
import { CommandPalette } from "@/components/command-palette";
import { NavProgress } from "@/components/nav-progress";
import { unreadCount } from "@/lib/notify";
import { maybeRunHoldRules } from "@/lib/lead-hold";
import { db } from "@/lib/db";
import { SECTIONS, sectionForPath, type SectionTab } from "@/lib/sections";
import { SectionTabs } from "@/components/section-tabs";
import { redirect } from "next/navigation";
import { securitySettings } from "@/lib/security";
import { IdleSignOut } from "@/components/idle-sign-out";
import { logout } from "@/app/login/actions";
import { disabledFeatures, featureForPath } from "@/lib/features";
import { can } from "@/lib/permissions";
import { FeatureOff } from "@/components/feature-off";
import { fileUrl } from "@/lib/files";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  maybeRunHoldRules(); // background, at most every 5 minutes
  // Everything the frame needs, fetched side by side (each is a database round trip on the live server).
  // apps = only the apps and pages this user's roles allow — this is what makes Admin and Agent see different apps.
  const [jar, h, apps, me, off, security, unread] = await Promise.all([
    cookies(), headers(), appsForUser(user),
    db.employee.findUnique({ where: { userId: user.id }, select: { photo: true } }),
    disabledFeatures(), securitySettings(), unreadCount(user.id),
  ]);
  const collapsed = jar.get("sidebar")?.value === "collapsed";
  const myPhoto = me?.photo ?? null;
  const last = apps.find((a) => a.key === jar.get("app")?.value);
  const current = appForPath(apps, h.get("x-pathname") ?? "") ?? last ?? apps[0]!;
  // Pages of a feature switched off in Settings → Features show a notice instead.
  const offFeature = featureForPath(h.get("x-pathname") ?? "", off);
  // Two-step login required by policy (Settings → Security) and not set up yet: set it up first.
  const needs2fa = !user.viewAs && !user.totpEnabled && (security.require2fa === "all" || (security.require2fa === "superadmin" && user.isSuperAdmin));
  if (needs2fa && (h.get("x-pathname") ?? "") !== "/profile/security") redirect("/profile/security");
  // Section tabs for this page (CRM: Leads / Deals / Calls / Contacts & Property / Reports), filtered by permission and features.
  const path = h.get("x-pathname") ?? "";
  const tabAllowed = (t: SectionTab) => (!t.module || can(user, t.module, t.action ?? "view")) && (!t.superAdmin || user.isSuperAdmin) && !featureForPath(t.href, off);
  const section = sectionForPath(path);
  const tabs = section ? section.tabs.filter(tabAllowed) : [];
  const pageItems = apps.flatMap((a) => a.groups.flatMap((g) => g.items.flatMap((item) => item.children ?? [item]))).filter((item) => !item.phase);
  const sectionPages = SECTIONS.flatMap((sec) => sec.tabs.filter(tabAllowed).map((t) => ({ href: t.href, label: t.label, icon: "list" })));
  const pages = [...new Map([...pageItems.map((item) => ({ href: item.href, label: item.label, icon: item.icon })), ...sectionPages].map((p) => [p.href, p])).values()];

  return (
    <div className="app-wallpaper min-h-screen" data-sidebar={sidebarMode(current.layout, collapsed)}>
      <NavProgress />
      <Sidebar
        apps={apps}
        initialApp={current.key as AppKey}
        user={{ name: user.name, roles: user.roleNames.join(", ") || "No role", branch: user.branchName, photo: myPhoto ? fileUrl(myPhoto) : null }}
        unread={unread}
        initiallyCollapsed={collapsed}
      />
      <main className="app-main">
        {user.viewAs && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-navy-950 print:hidden">
            <Eye className="size-4" aria-hidden />
            Viewing as <b>{user.name}</b> ({user.roleNames.join(", ") || "no role"}) · read-only, changes are blocked
            {/* A full page load: the route clears the cookie and redirects. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/view-as?exit=1" className="rounded-md bg-navy-950 px-3 py-1 text-xs font-semibold text-white hover:bg-navy-800">Exit, back to {user.viewAs.realName}</a>
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-8 sm:pt-8 lg:pb-10">
          <PageTransition>
            {/* View as is read-only: every input and button on the page is disabled (the server refuses writes too). */}
            <fieldset disabled={!!user.viewAs} className="m-0 min-w-0 border-0 p-0">
              {!offFeature && tabs.length > 1 && <SectionTabs tabs={tabs} />}
              {offFeature ? <FeatureOff label={offFeature.label} canManage={user.isSuperAdmin || can(user, "settings.company", "edit")} /> : children}
            </fieldset>
          </PageTransition>
        </div>
      </main>
      <CommandPalette pages={pages} />
      {!user.viewAs && <IdleSignOut minutes={security.idleMinutes} signOut={logout} />}
    </div>
  );
}
