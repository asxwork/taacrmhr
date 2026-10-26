import { format } from "date-fns";
import { Download } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeFor } from "@/lib/permissions";
import { fmtPKR, usersInScope } from "@/lib/crm";
import { PERIODS, crmReport, resolvePeriod } from "@/lib/reports";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { BarList, ColumnChart } from "@/components/charts";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { hrefWith } from "@/components/crm/bits";

export const metadata = { title: "CRM Reports" };

type SP = { period?: string; from?: string; to?: string; branch?: string; owner?: string };

export default async function CrmReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("reports.crm");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.period, sp.from, sp.to);
  const scope = scopeFor(user, "reports.crm");
  const [branches, people] = await Promise.all([
    scope === "all" ? db.branch.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    usersInScope(user, "reports.crm", "view"),
  ]);
  const owner = people.some((p) => p.id === sp.owner) ? sp.owner : undefined;
  const r = (await crmReport(user, { from, to, branchId: scope === "all" ? sp.branch : undefined, ownerId: owner }))!;
  const keep = { period: sp.period, from: sp.from, to: sp.to, branch: sp.branch, owner };
  const canExport = can(user, "reports.crm", "export");
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

  const tiles: [string, string, string?][] = [
    ["New leads", String(r.kpis.newLeads), r.kpis.junk ? `${r.kpis.junk} junk` : undefined],
    ["Lead → deal", pct(r.kpis.conversionRate), `${r.kpis.converted} converted`],
    ["Deals won", `${r.kpis.won} · ${fmtPKR(r.kpis.wonValue)}`, r.kpis.daysToClose != null ? `avg ${Math.round(r.kpis.daysToClose)} days to close` : undefined],
    ["Open pipeline", fmtPKR(r.kpis.openValue), `${r.kpis.openCount} open deals`],
  ];

  return (
    <>
      <PageHeader
        title="CRM Reports"
        description={`${format(from, "d MMM yyyy")} – ${format(to, "d MMM yyyy")} · ${scope === "all" ? "whole company" : scope === "branch" ? "your branch" : scope === "team" ? "you and your team" : "your own records"}`}
        actions={canExport && (
          <LinkButton href={hrefWith("/api/export/report", { ...keep, from: format(from, "yyyy-MM-dd"), to: format(to, "yyyy-MM-dd") }, {})} variant="secondary" prefetch={false}>
            <Download className="size-4" /> Leaderboard CSV
          </LinkButton>
        )}
      />

      <AutoFilterForm className="mb-6 flex flex-wrap items-end gap-2">
        <select name="period" defaultValue={sp.period ?? "month"} className="input w-40">
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <input type="date" name="from" defaultValue={sp.period === "custom" ? sp.from : ""} className="input w-40" aria-label="From (custom)" title="From (custom period)" />
        <input type="date" name="to" defaultValue={sp.period === "custom" ? sp.to : ""} className="input w-40" aria-label="To (custom)" title="To (custom period)" />
        {branches.length > 1 && (
          <select name="branch" defaultValue={sp.branch ?? ""} className="input w-40">
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {people.length > 1 && (
          <select name="owner" defaultValue={owner ?? ""} className="input w-44">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </AutoFilterForm>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-medium">New leads per {r.bucket}</h2>
          <ColumnChart data={r.overTime} unit="leads" />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-medium">Leads by source</h2>
          <BarList rows={r.bySource.map((s) => ({ name: s.name, value: s.leads, display: String(s.leads), sub: s.leads ? `${Math.round((s.converted / s.leads) * 100)}% conv.` : undefined }))} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-medium">Open pipeline by stage</h2>
          <p className="mb-4 text-xs text-muted">Current open deals (not limited to the period)</p>
          <BarList rows={r.pipeline.map((s) => ({ name: `${s.pipeline} · ${s.name}`, value: s.value, display: fmtPKR(s.value), sub: `${s.count} deal${s.count === 1 ? "" : "s"}` }))} empty="No open deals." />
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-medium">Why deals were lost</h2>
          <BarList rows={r.lostReasons.map((l) => ({ name: l.name, value: l.value, display: String(l.value) }))} empty="No lost deals in this period." />
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <h2 className="border-b border-line px-5 py-3 text-sm font-medium">Team performance</h2>
        {r.leaderboard.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">No activity in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas/60">
                <tr>
                  {["Person", "Leads", "Converted", "Calls", "Meetings & visits", "Emails", "Won", "Won value", "Commission"].map((h, i) => (
                    <th key={h} className={`th ${i ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.leaderboard.map((p) => (
                  <tr key={p.id}>
                    <td className="td font-medium">{p.name}</td>
                    <td className="td text-right tabular-nums">{p.leads}</td>
                    <td className="td text-right tabular-nums">{p.converted}{p.leads ? <span className="ml-1 text-xs text-muted">{Math.round((p.converted / p.leads) * 100)}%</span> : null}</td>
                    <td className="td text-right tabular-nums">{p.calls}</td>
                    <td className="td text-right tabular-nums">{p.meetings}</td>
                    <td className="td text-right tabular-nums">{p.emails}</td>
                    <td className="td text-right tabular-nums">{p.won}</td>
                    <td className="td whitespace-nowrap text-right tabular-nums">{fmtPKR(p.wonValue, { prefix: false })}</td>
                    <td className="td whitespace-nowrap text-right tabular-nums">{p.commission ? fmtPKR(p.commission, { prefix: false }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
