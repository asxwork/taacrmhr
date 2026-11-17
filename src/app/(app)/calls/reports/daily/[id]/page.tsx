import { notFound } from "next/navigation";
import { format } from "date-fns";
import { can, requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { agentDay, callReportText, pkDay, type DaySummary } from "@/lib/call-daily";
import { CopyText } from "@/components/calls/copy-text";
import { Card, PageHeader } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { DayReport } from "@/components/calls/day-report";

export const metadata = { title: "Daily calls report" };

/**
 * One agent's day of calls. `id` is a saved end-of-shift report, or "live" with ?agent=&date= to see any day as it is
 * now. The agent sees their own; their manager and call supervisors see everyone's.
 */
export default async function DailyCallReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ agent?: string; date?: string }> }) {
  const viewer = await requirePermission("calls");
  const { id } = await params;
  const sp = await searchParams;
  let agentId: string, date: string, s: DaySummary, sentAt: Date | null = null;
  if (id === "live") {
    agentId = sp.agent || viewer.id;
    date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : pkDay().date;
    const { start, end } = pkDay(new Date(`${date}T12:00:00+05:00`));
    s = await agentDay(agentId, start, end);
  } else {
    const r = await db.callDailyReport.findUnique({ where: { id } });
    if (!r) notFound();
    agentId = r.agentId; date = r.date; sentAt = r.sentAt;
    s = JSON.parse(r.data) as DaySummary;
  }
  const agent = await db.user.findUnique({ where: { id: agentId }, select: { name: true, managerId: true } });
  if (!agent) notFound();
  const note = await db.callDayNote.findUnique({ where: { agentId_date: { agentId, date } } });
  const allowed = agentId === viewer.id || viewer.isSuperAdmin || can(viewer, "calls", "assign") || agent.managerId === viewer.id;
  if (!allowed) notFound();

  return (
    <>
      <PageHeader title={`${agent.name} · ${format(new Date(`${date}T12:00:00`), "EEE d MMM yyyy")}`}
        description={sentAt ? `End-of-shift report, sent ${format(sentAt, "h:mm a")}` : "Live — updates as calls are logged"}
        actions={<PrintButton fileName={`calls-${agent.name}-${date}`} />} />
      <Card className="mb-5 p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Report (copy for WhatsApp)</p>
        <CopyText text={callReportText(s, note?.feedback, agent.name)} />
      </Card>
      <Card className="p-5 sm:p-6" data-print-area>
        <DayReport s={s} />
      </Card>
    </>
  );
}
