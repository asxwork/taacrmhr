import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, scopeFor } from "@/lib/permissions";
import { CrmOverview } from "./crm-overview";
import { TodayAttendance } from "./today-attendance";
import { NAV } from "@/lib/nav";
import { MODULE_MAP, SCOPE_LABELS } from "@/lib/rbac";
import { db } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const modules = NAV.flatMap((g) => g.items.filter((i) => i.module && g.label !== "Settings" && can(user, i.module)).map((i) => ({ ...i, group: g.label })));

  const stats = user.isSuperAdmin
    ? await Promise.all([db.user.count({ where: { active: true } }), db.role.count(), db.branch.count({ where: { active: true } }), db.leadSource.count({ where: { active: true } })])
    : null;

  return (
    <>
      <PageHeader eyebrow={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} title={`${greeting}, ${firstName}`} description={`${user.roleNames.join(", ") || "No role assigned"}${user.branchName ? ` · ${user.branchName} branch` : ""}`} />

      {stats && (
        <div className="stagger mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Active users", stats[0], "/settings/users"],
            ["Roles", stats[1], "/settings/roles"],
            ["Branches", stats[2], "/settings/company"],
            ["Lead sources", stats[3], "/settings/company"],
          ].map(([label, value, href]) => (
            <Link key={label as string} href={href as string}>
              <Card className="p-4 transition hover:border-navy-900/20">
                <p className="text-xs text-muted">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <TodayAttendance userId={user.id} />
      {can(user, "crm.leads") && <CrmOverview user={user} />}

      <h2 className="mb-3 text-sm font-medium text-muted">Your workspace</h2>
      {modules.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          You have self-service access. Use <Link href="/me" className="font-medium text-navy-900 underline">My Profile</Link> to view your details.
        </Card>
      ) : (
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => {
            const scope = scopeFor(user, m.module!);
            return (
              <Link key={m.href} href={m.href}>
                <Card className="group flex items-center justify-between p-4 transition hover:border-navy-900/20">
                  <div>
                    <p className="text-xs text-muted">{m.group}</p>
                    <p className="mt-0.5 font-medium">{m.label}</p>
                    <div className="mt-2 flex gap-1.5">
                      {MODULE_MAP[m.module!]?.scoped && <Badge tone={scope === "all" ? "navy" : "gold"}>{SCOPE_LABELS[scope]}</Badge>}
                      {m.phase && <Badge>Phase {m.phase}</Badge>}
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
