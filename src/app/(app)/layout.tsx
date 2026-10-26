import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { NAV } from "@/lib/nav";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";
import { CommandPalette } from "@/components/command-palette";
import { NavProgress } from "@/components/nav-progress";
import { unreadCount } from "@/lib/notify";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const collapsed = (await cookies()).get("sidebar")?.value === "collapsed";

  // Only show what this user's roles allow — this is what makes Admin and Agent see different apps.
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => (!i.module || can(user, i.module)) && (!i.superAdmin || user.isSuperAdmin) && (!i.boss || user.isBoss || user.isSuperAdmin)) })).filter((g) => g.items.length);

  return (
    <div className="app-wallpaper min-h-screen" data-sidebar={collapsed ? "collapsed" : "open"}>
      <NavProgress />
      <Sidebar
        groups={groups}
        user={{ name: user.name, roles: user.roleNames.join(", ") || "No role", branch: user.branchName }}
        unread={await unreadCount(user.id)}
        initiallyCollapsed={collapsed}
      />
      <main className="app-main">
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-8 sm:pt-8 lg:pb-10">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>
      <CommandPalette pages={groups.flatMap((g) => g.items).filter((i) => !i.phase).map((i) => ({ href: i.href, label: i.label, icon: i.icon }))} />
    </div>
  );
}
