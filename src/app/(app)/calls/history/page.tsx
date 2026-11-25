import Link from "@/components/link";
import type { Prisma } from "@prisma/client";
import { format, startOfDay } from "date-fns";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { db } from "@/lib/db";
import { OLD_OUTCOMES, OUTCOMES, outcome } from "@/lib/calls";
import { fmtPhone } from "@/lib/crm-shared";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { BulkAll, BulkBar, BulkTick } from "@/components/calls/bulk-bar";
import { bulkCallLogs, countDuplicateLogs, deleteDuplicateLogs } from "../actions";

export const metadata = { title: "Call history" };

const LIMIT = 1000;

/**
 * Calls → Call history: every call and WhatsApp attempt (own for agents, everyone's for supervisors), filtered by
 * dates, campaign, agent, result or a name / number.
 */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ date?: string; from?: string; to?: string; campaign?: string; agent?: string; outcome?: string; q?: string }> }) {
  const user = await requirePermission("calls");
  const sp = await searchParams;
  const all = user.isSuperAdmin || scopeFor(user, "calls", "view") === "all";
  const parse = (v: string | undefined) => { const d = v ? startOfDay(new Date(`${v}T00:00:00`)) : null; return d && !Number.isNaN(+d) ? d : null; };
  const from = parse(sp.from ?? sp.date) ?? startOfDay(new Date());
  const toDay = parse(sp.to ?? sp.date) ?? from;
  const day = from;
  const end = new Date(Math.max(+toDay, +from) + 86_400_000);
  const oneDay = +end - +from === 86_400_000;
  const q = (sp.q ?? "").trim();
  const where: Prisma.CallLogWhereInput = {
    startedAt: { gte: from, lt: end },
    ...(all ? (sp.agent ? { agentId: sp.agent } : {}) : { agentId: user.id }),
    ...(sp.campaign ? { campaignId: sp.campaign } : {}),
    ...(sp.outcome ? { outcome: sp.outcome } : {}),
    ...(q ? { OR: [{ phone: { contains: q } }, { notes: { contains: q } }, { target: { name: { contains: q } } }] } : {}),
  };
  // Choices for the filters: campaigns I called in (supervisors: all) and, for supervisors, the agents.
  const usedCamps = (await db.callLog.groupBy({ by: ["campaignId"], where: all ? {} : { agentId: user.id } })).map((g) => g.campaignId).filter((x): x is string => !!x);
  const [logs, total, campaigns, agentList] = await Promise.all([
    db.callLog.findMany({ where, include: { target: { select: { name: true } } }, orderBy: { startedAt: "desc" }, take: LIMIT }),
    db.callLog.count({ where }),
    db.callCampaign.findMany({ where: { id: { in: usedCamps } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    all ? db.user.findMany({ where: { id: { in: (await db.callLog.groupBy({ by: ["agentId"], where: { startedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } } })).map((g) => g.agentId) } }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const campName = new Map(campaigns.map((c) => [c.id, c.name]));
  const dupes = user.isSuperAdmin && oneDay ? await countDuplicateLogs(day, end) : 0;
  const agents = new Map((await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.agentId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Call history" description={`${total.toLocaleString()} call(s) ${oneDay ? `on ${format(day, "EEEE d MMMM")}` : `from ${format(from, "d MMM")} to ${format(toDay, "d MMM yyyy")}`}${total > LIMIT ? ` · showing the latest ${LIMIT.toLocaleString()}` : ""}`}
        actions={<div className="flex flex-wrap items-center gap-2">
          <Link href={`/calls/reports/agent/${sp.agent && all ? sp.agent : user.id}?from=${format(from, "yyyy-MM-dd")}&to=${format(toDay, "yyyy-MM-dd")}${sp.campaign ? `&campaign=${sp.campaign}` : ""}`} className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm hover:bg-canvas">{sp.agent && all ? "Agent report" : "My report"}</Link>
          {dupes > 0 && (
            <form action={deleteDuplicateLogs}><input type="hidden" name="date" value={format(day, "yyyy-MM-dd")} />
              <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-sm text-red-700 hover:bg-red-50" title="Same agent, number and result within 10 minutes: keeps the first">Delete duplicates ({dupes})</button>
            </form>
          )}
        </div>} />
      <AutoFilterForm className="mb-4 flex flex-wrap items-center gap-2">
        <input type="date" name="from" defaultValue={format(from, "yyyy-MM-dd")} className="input h-9 w-40" aria-label="From" />
        <input type="date" name="to" defaultValue={format(toDay, "yyyy-MM-dd")} className="input h-9 w-40" aria-label="To" />
        <select name="campaign" defaultValue={sp.campaign ?? ""} className="input h-9 w-52" aria-label="Campaign">
          <option value="">All campaigns</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {all && (
          <select name="agent" defaultValue={sp.agent ?? ""} className="input h-9 w-44" aria-label="Agent">
            <option value="">All agents</option>
            {agentList.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <select name="outcome" defaultValue={sp.outcome ?? ""} className="input h-9 w-48" aria-label="Result">
          <option value="">All results</option>
          {[...OUTCOMES, ...OLD_OUTCOMES].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Name, number or remark" className="input h-9 w-52" aria-label="Search" />
        {(sp.campaign || sp.agent || sp.outcome || q || !oneDay || sp.from) && <Link href="/calls/history" className="text-sm text-muted hover:text-ink hover:underline">Clear</Link>}
      </AutoFilterForm>
      <Card className="overflow-x-auto">
        {logs.length === 0 ? <EmptyState title="No calls match" description="Change the dates or filters." /> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr>{user.isSuperAdmin && <th className="w-10 px-4 py-2.5"><BulkAll form="bulk-logs" /></th>}<th className="px-4 py-2.5">{oneDay ? "Time" : "When"}</th><th className="px-4 py-2.5">Who</th>{all && <th className="px-4 py-2.5">Agent</th>}<th className="px-4 py-2.5">Campaign</th><th className="px-4 py-2.5">Outcome</th><th className="px-4 py-2.5">Talk</th><th className="px-4 py-2.5">Notes</th></tr></thead>
            <tbody className="divide-y divide-line">
              {logs.map((l) => (
                <tr key={l.id}>
                  {user.isSuperAdmin && <td className="px-4 py-2"><BulkTick form="bulk-logs" id={l.id} label={l.target?.name ?? l.phone} /></td>}
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">{format(l.startedAt, oneDay ? "h:mm a" : "d MMM, h:mm a")}</td>
                  <td className="px-4 py-2"><span className="font-medium">{l.target?.name ?? "—"}</span><span className="block font-mono text-xs text-muted">{fmtPhone(l.phone)}</span></td>
                  {all && <td className="px-4 py-2">{agents.get(l.agentId) ?? "—"}</td>}
                  <td className="max-w-40 truncate px-4 py-2 text-xs text-muted">{l.campaignId ? campName.get(l.campaignId) ?? "Deleted campaign" : "—"}</td>
                  <td className="px-4 py-2"><Badge tone={outcome(l.outcome)?.reached ? "green" : "neutral"}>{outcome(l.outcome)?.label ?? l.outcome}</Badge>{l.channel === "whatsapp" && <span className="ml-1 text-xs text-teal-600">WhatsApp</span>}</td>
                  <td className="px-4 py-2 tabular-nums text-xs">{l.durationSec ? `${Math.floor(l.durationSec / 60)}:${String(l.durationSec % 60).padStart(2, "0")}` : "—"}</td>
                  <td className="max-w-xs truncate px-4 py-2 text-xs text-muted">{l.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {user.isSuperAdmin && <BulkBar form="bulk-logs" action={bulkCallLogs} noun="call history entr(ies)" ops={[{ value: "delete", label: "Delete", danger: true }]} />}
    </>
  );
}
