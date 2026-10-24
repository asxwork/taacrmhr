import Link from "next/link";
import { endOfDay, startOfMonth, subDays } from "date-fns";
import { db } from "@/lib/db";
import { scopeFor, scopeWhere } from "@/lib/permissions";
import { fmtPKR } from "@/lib/crm-shared";
import type { SessionUser } from "@/lib/auth";
import { Card } from "@/components/ui";
import { cn, fmtDateTime } from "@/lib/utils";

const SCOPE_TEXT = { all: "Whole company", branch: "Your branch", team: "You and your team", own: "Your records", none: "" } as const;

/** CRM numbers for whatever the user is allowed to see: own for agents, team for managers, all for admins. */
export async function CrmOverview({ user }: { user: SessionUser }) {
  const [leadScope, dealScope, actScope] = await Promise.all([
    scopeWhere(user, "crm.leads"),
    scopeWhere(user, "crm.deals"),
    scopeWhere(user, "crm.activities"),
  ]);
  const now = new Date();

  const [openLeads, newLeads, openDeals, wonMonth, agenda] = await Promise.all([
    db.lead.count({ where: { ...leadScope, status: { kind: "open" } } }),
    db.lead.count({ where: { ...leadScope, createdAt: { gte: subDays(now, 7) } } }),
    dealScope ? db.deal.aggregate({ where: { ...dealScope, closedAt: null }, _sum: { value: true }, _count: true }) : null,
    dealScope ? db.deal.aggregate({ where: { ...dealScope, stage: { kind: "won" }, closedAt: { gte: startOfMonth(now) } }, _sum: { value: true }, _count: true }) : null,
    actScope
      ? db.activity.findMany({
          where: { ...actScope, ownerId: user.id, doneAt: null, dueAt: { lte: endOfDay(now) } },
          include: { lead: { select: { id: true, name: true } }, deal: { select: { id: true, title: true } } },
          orderBy: { dueAt: "asc" },
          take: 8,
        })
      : [],
  ]);

  const tiles: [string, React.ReactNode, string, string?][] = [
    ["Open leads", openLeads, "/crm/leads"],
    ["New leads (7 days)", newLeads, "/crm/leads?closed=1"],
    ...(openDeals ? [["Open deals", `${openDeals._count} · ${fmtPKR(openDeals._sum.value ?? 0)}`, "/crm/deals"] as [string, string, string]] : []),
    ...(wonMonth ? [["Won this month", `${wonMonth._count} · ${fmtPKR(wonMonth._sum.value ?? 0)}`, "/crm/deals?view=list", "text-emerald-700"] as [string, string, string, string]] : []),
  ];

  return (
    <div className="mb-8 space-y-4">
      <p className="text-xs text-muted">CRM · {SCOPE_TEXT[scopeFor(user, "crm.leads")]}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, href, tone]) => (
          <Link key={label} href={href}>
            <Card className="p-4 transition hover:border-navy-900/20">
              <p className="text-xs text-muted">{label}</p>
              <p className={cn("mt-1 text-xl font-semibold", tone)}>{value}</p>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Today’s agenda</h2>
          <Link href="/crm/tasks" className="text-xs text-muted hover:text-ink">All tasks →</Link>
        </div>
        {agenda.length === 0 ? (
          <p className="text-sm text-muted">Nothing due today.</p>
        ) : (
          <ul className="divide-y divide-line">
            {agenda.map((a) => {
              const overdue = a.dueAt! < new Date(new Date().setHours(0, 0, 0, 0));
              const ctx = a.deal ? { label: a.deal.title, href: `/crm/deals/${a.deal.id}` } : a.lead ? { label: a.lead.name, href: `/crm/leads/${a.lead.id}` } : null;
              return (
                <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className={cn("w-36 shrink-0 text-xs", overdue ? "font-medium text-red-600" : "text-muted")}>{overdue ? "Overdue · " : ""}{fmtDateTime(a.dueAt)}</span>
                  <span className="flex-1 truncate">{a.subject}</span>
                  {ctx && <Link href={ctx.href} className="truncate text-xs text-muted hover:underline">{ctx.label}</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
