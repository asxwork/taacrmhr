import { redirect } from "next/navigation";
import Link from "@/components/link";
import { ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, scopeFor } from "@/lib/permissions";
import { CrmOverview } from "./crm-overview";
import { TodayAttendance } from "./today-attendance";
import { MyTargets } from "./my-targets";
import { disabledFeatures } from "@/lib/features";
import { APPS } from "@/lib/nav";
import { NAV_ICONS } from "@/components/nav-icons";
import { MODULE_MAP, SCOPE_LABELS } from "@/lib/rbac";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.isBoss) redirect("/boss"); // the owner lands on their own overview
  const firstName = user.name.split(" ")[0];
  const featureOff = (await disabledFeatures()).has("targets");
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // CRM home: shortcuts to CRM screens only (other apps have their own homes).
  // Grouped like the menu: one card per area (Leads, Deals, Calls…) with its screens as quick links.
  const allowed = (i: { module?: string; action?: string; phase?: number }) => !!i.module && !i.phase && can(user, i.module as never, (i.action ?? "view") as never);
  const crm = APPS.find((x) => x.key === "crm");
  const areas = (crm?.groups ?? []).filter((g) => g.label !== "Home")
    .map((g) => ({ label: g.label ?? "", icon: g.icon ?? "list", links: g.items.flatMap((i) => i.children ?? [i]).filter(allowed) }))
    .filter((a) => a.links.length);
  const modules = areas.flatMap((a) => a.links);

  return (
    <>
      <PageHeader eyebrow={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} title={`${greeting}, ${firstName}`} description={`${user.roleNames.join(", ") || "No role assigned"}${user.branchName ? ` · ${user.branchName} branch` : ""}`} />

      <TodayAttendance userId={user.id} />
      {can(user, "crm.targets") && !featureOff && <MyTargets userId={user.id} />}
      {can(user, "crm.leads") && <CrmOverview user={user} />}

      <h2 className="mb-3 text-sm font-medium text-muted">Your workspace</h2>
      {modules.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          You have self-service access. Use <Link href="/me" className="font-medium text-navy-900 underline">My Profile</Link> to view your details.
        </Card>
      ) : (
        <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {areas.map((a) => {
            const Icon = NAV_ICONS[a.icon] ?? ArrowRight;
            const first = a.links[0]!;
            const scope = scopeFor(user, first.module!);
            return (
              <Card key={a.label} className="p-4">
                <Link href={first.href} className="group mb-3 flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-navy-900 text-white"><Icon className="size-4" /></span>
                  <span className="font-medium group-hover:underline">{a.label}</span>
                  {MODULE_MAP[first.module!]?.scoped && <Badge tone={scope === "all" ? "navy" : "gold"}>{SCOPE_LABELS[scope]}</Badge>}
                  <ArrowRight className="ml-auto size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  {a.links.map((m) => <Link key={m.href} href={m.href} className="rounded-md border border-line px-2 py-1 text-xs text-ink/80 transition hover:border-navy-900/30 hover:bg-canvas hover:text-ink">{m.label}</Link>)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
