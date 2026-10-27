import { format, isPast } from "date-fns";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { db } from "@/lib/db";
import { fmtPhone } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "Callbacks" };

/** Calls → Callbacks: promised call-backs, overdue first. Due ones also come up first in the Dialer. */
export default async function CallbacksPage() {
  const user = await requirePermission("calls");
  const all = user.isSuperAdmin || scopeFor(user, "calls", "view") === "all";
  const rows = await db.callTarget.findMany({ where: { status: "callback", ...(all ? {} : { assigneeId: user.id }) }, include: { campaign: { select: { name: true } } }, orderBy: { callbackAt: "asc" } });
  const agents = all ? new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.assigneeId).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])) : new Map();
  return (
    <>
      <PageHeader title="Callbacks" description="Due callbacks appear first in the Dialer." />
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <EmptyState title="No callbacks" /> : (
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Who</th><th className="px-4 py-2.5">Campaign</th>{all && <th className="px-4 py-2.5">Agent</th>}<th className="px-4 py-2.5">Notes</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={cn("px-4 py-2.5 whitespace-nowrap", r.callbackAt && isPast(r.callbackAt) && "font-medium text-red-600")}>{r.callbackAt ? format(r.callbackAt, "EEE d MMM, h:mm a") : "—"}</td>
                  <td className="px-4 py-2.5"><span className="font-medium">{r.name ?? "—"}</span><span className="block font-mono text-xs text-muted">{fmtPhone(r.phone)}</span></td>
                  <td className="px-4 py-2.5">{r.campaign.name}</td>
                  {all && <td className="px-4 py-2.5">{r.assigneeId ? agents.get(r.assigneeId) : "—"}</td>}
                  <td className="max-w-xs truncate px-4 py-2.5 text-xs text-muted">{r.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
