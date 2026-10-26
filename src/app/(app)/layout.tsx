import { cookies, headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { appsFor } from "@/lib/apps";
import { appForPath, sidebarMode, type AppKey } from "@/lib/nav";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";
import { CommandPalette } from "@/components/command-palette";
import { NavProgress } from "@/components/nav-progress";
import { unreadCount } from "@/lib/notify";
import { maybeRunHoldRules } from "@/lib/lead-hold";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  maybeRunHoldRules(); // background, at most every 5 minutes
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const collapsed = jar.get("sidebar")?.value === "collapsed";

  // Only the apps and pages this user's roles allow — this is what makes Admin and Agent see different apps.
  const apps = appsFor(user);
  const last = apps.find((a) => a.key === jar.get("app")?.value);
  const current = appForPath(apps, h.get("x-pathname") ?? "") ?? last ?? apps[0]!;
  const pageItems = apps.flatMap((a) => a.groups.flatMap((g) => g.items.flatMap((item) => item.children ?? [item]))).filter((item) => !item.phase);
  const pages = [...new Map(pageItems.map((item) => [item.href, { href: item.href, label: item.label, icon: item.icon }])).values()];

  return (
    <div className="app-wallpaper min-h-screen" data-sidebar={sidebarMode(current.layout, collapsed)}>
      <NavProgress />
      <Sidebar
        apps={apps}
        initialApp={current.key as AppKey}
        user={{ name: user.name, roles: user.roleNames.join(", ") || "No role", branch: user.branchName }}
        unread={await unreadCount(user.id)}
        initiallyCollapsed={collapsed}
      />
      <main className="app-main">
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-8 sm:pt-8 lg:pb-10">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <CommandPalette pages={pages} />
    </div>
  );
}
