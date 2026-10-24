import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { NAV } from "@/lib/nav";
import { Sidebar } from "@/components/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Only show what this user's roles allow — this is what makes Admin and Agent see different apps.
  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.module || can(user, i.module)) })).filter((g) => g.items.length);

  return (
    <div className="app-wallpaper min-h-screen">
      <Sidebar groups={groups} user={{ name: user.name, roles: user.roleNames.join(", ") || "No role", branch: user.branchName }} />
      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</div>
      </main>
    </div>
  );
}
