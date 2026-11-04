import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { SWAP_STATUS } from "@/lib/shift-swap";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { decideSwap } from "./actions";

export const metadata = { title: "Shift swaps" };

/** Attendance → Shift swaps: swaps both colleagues agreed to, waiting for approval, and recent decisions. */
export default async function SwapsPage() {
  const user = await requirePermission("hr.shiftswap");
  const scope = (await scopeWhere(user, "hr.shiftswap", "view", { owner: "userId", branch: "branchId" })) as Prisma.EmployeeWhereInput;
  const swaps = await db.shiftSwap.findMany({
    where: { requester: scope, status: { not: "cancelled" } },
    include: { requester: { select: { fullName: true } }, partner: { select: { fullName: true } } },
    orderBy: [{ status: "asc" }, { date: "desc" }], take: 80,
  });
  const canDecide = can(user, "hr.shiftswap", "approve");
  const waiting = swaps.filter((s) => s.status === "manager");
  const rest = swaps.filter((s) => s.status !== "manager");
  const row = (s: (typeof swaps)[number]) => {
    const [label, tone] = SWAP_STATUS[s.status] ?? [s.status, "neutral" as const];
    return (
      <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{s.requester.fullName} ↔ {s.partner.fullName}</p>
          <p className="text-xs text-muted">{format(s.date, "EEEE d MMM yyyy")}{s.reason ? ` · ${s.reason}` : ""}</p>
        </div>
        <Badge tone={tone}>{label}</Badge>
        {canDecide && s.status === "manager" && (
          <span className="flex gap-2">
            <form action={decideSwap}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="decision" value="approve" /><button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700">Approve</button></form>
            <form action={decideSwap}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="decision" value="reject" /><button className="rounded-lg border border-line px-3 py-1.5 hover:bg-canvas">Reject</button></form>
          </span>
        )}
      </li>
    );
  };
  return (
    <>
      <PageHeader title="Shift swaps" description="Staff swap a day's shift with a colleague from My Space. Once both agree, approve here and the roster changes for both." />
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Waiting for approval</h2>
      <Card className="mb-6 overflow-hidden">{waiting.length ? <ul className="divide-y divide-line">{waiting.map(row)}</ul> : <EmptyState title="Nothing waiting" />}</Card>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Recent</h2>
      <Card className="overflow-hidden">{rest.length ? <ul className="divide-y divide-line">{rest.map(row)}</ul> : <EmptyState title="No swaps yet" />}</Card>
    </>
  );
}
