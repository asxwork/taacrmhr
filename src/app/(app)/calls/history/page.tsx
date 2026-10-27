import { format, startOfDay } from "date-fns";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { db } from "@/lib/db";
import { outcome } from "@/lib/calls";
import { fmtPhone } from "@/lib/crm-shared";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";

export const metadata = { title: "Call history" };

/** Calls → Call history: every call and WhatsApp attempt (own for agents, everyone's for supervisors). */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const user = await requirePermission("calls");
  const sp = await searchParams;
  const all = user.isSuperAdmin || scopeFor(user, "calls", "view") === "all";
  const day = sp.date ? startOfDay(new Date(`${sp.date}T00:00:00`)) : startOfDay(new Date());
  const logs = await db.callLog.findMany({
    where: { startedAt: { gte: day, lt: new Date(day.getTime() + 86_400_000) }, ...(all ? {} : { agentId: user.id }) },
    include: { target: { select: { name: true } } }, orderBy: { startedAt: "desc" }, take: 1000,
  });
  const agents = new Map((await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.agentId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title="Call history" description={`${logs.length} call(s) on ${format(day, "EEEE d MMMM")}`}
        actions={<AutoFilterForm><input type="date" name="date" defaultValue={format(day, "yyyy-MM-dd")} className="input h-9" aria-label="Day" /></AutoFilterForm>} />
      <Card className="overflow-x-auto">
        {logs.length === 0 ? <EmptyState title="No calls on this day" /> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Time</th><th className="px-4 py-2.5">Who</th>{all && <th className="px-4 py-2.5">Agent</th>}<th className="px-4 py-2.5">Outcome</th><th className="px-4 py-2.5">Talk</th><th className="px-4 py-2.5">Notes</th></tr></thead>
            <tbody className="divide-y divide-line">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2 tabular-nums">{format(l.startedAt, "h:mm a")}</td>
                  <td className="px-4 py-2"><span className="font-medium">{l.target?.name ?? "—"}</span><span className="block font-mono text-xs text-muted">{fmtPhone(l.phone)}</span></td>
                  {all && <td className="px-4 py-2">{agents.get(l.agentId) ?? "—"}</td>}
                  <td className="px-4 py-2"><Badge tone={outcome(l.outcome)?.reached ? "green" : "neutral"}>{outcome(l.outcome)?.label ?? l.outcome}</Badge>{l.channel === "whatsapp" && <span className="ml-1 text-xs text-teal-600">WhatsApp</span>}</td>
                  <td className="px-4 py-2 tabular-nums text-xs">{l.durationSec ? `${Math.floor(l.durationSec / 60)}:${String(l.durationSec % 60).padStart(2, "0")}` : "—"}</td>
                  <td className="max-w-xs truncate px-4 py-2 text-xs text-muted">{l.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
