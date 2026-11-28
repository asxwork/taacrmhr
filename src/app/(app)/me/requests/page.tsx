import Link from "@/components/link";
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";
import { Check, Clock, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { flowSteps } from "@/lib/approvals";
import { APPROVAL_TYPES } from "@/lib/hr-shared";
import { cn } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata = { title: "My requests" };

/** Every request I made (leave, expenses, loans, WFH, documents, profile changes…) with where it is now: each
 * approval step, who it's waiting on and for how long, and the comments. */
export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const show = sp.show === "done" ? "done" : sp.show === "all" ? "all" : "open";
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, manager: { select: { fullName: true } } } });
  const reqs = await db.approvalRequest.findMany({
    where: { OR: [{ requesterId: user.id }, ...(emp ? [{ employeeId: emp.id }] : [])], ...(show === "open" ? { status: "pending" } : show === "done" ? { status: { not: "pending" } } : {}) },
    include: { actions: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  // Step names: line manager (by name), HR, or the named person.
  const types = [...new Set(reqs.map((r) => r.type))];
  const flows = new Map(await Promise.all(types.map(async (t) => [t, await flowSteps(t)] as const)));
  const named = new Map((await db.user.findMany({ where: { id: { in: [...flows.values()].flat().map((s) => s.userId).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const stepName = (s: { kind: string; userId?: string }) => (s.kind === "manager" ? `Line manager${emp?.manager ? ` (${emp.manager.fullName})` : ""}` : s.kind === "user" ? named.get(s.userId ?? "") ?? "Approver" : "HR");
  const counts = await db.approvalRequest.groupBy({ by: ["status"], where: { OR: [{ requesterId: user.id }, ...(emp ? [{ employeeId: emp.id }] : [])] }, _count: { _all: true } });
  const n = (st: string) => counts.find((c) => c.status === st)?._count._all ?? 0;

  return (
    <>
      <PageHeader title="My requests" description="Where each of your requests is: every approval step, who it's waiting on now and since when." />
      <div className="mb-4 flex gap-1 text-sm">
        {([["open", `Waiting (${n("pending")})`], ["done", "Decided"], ["all", "All"]] as const).map(([k, l]) => (
          <Link key={k} href={`/me/requests?show=${k}`} className={cn("rounded-lg px-3 py-1.5", show === k ? "bg-navy-900 text-white" : "border border-line hover:bg-canvas")}>{l}</Link>
        ))}
        <Link href="/me/leave" className="ml-auto rounded-lg border border-line px-3 py-1.5 hover:bg-canvas">New request</Link>
      </div>
      {reqs.length === 0 ? <Card><EmptyState title={show === "open" ? "Nothing waiting" : "No requests"} description="Leave, expense, loan, WFH and other requests you make show here with their progress." /></Card> : (
        <div className="space-y-3">
          {reqs.map((r) => {
            const steps = flows.get(r.type) ?? [{ kind: "hr" as const }];
            const decided = r.actions.filter((a) => a.decision === "approved" || a.decision === "rejected");
            const last = r.actions.at(-1);
            const waitingSince = r.status === "pending" ? last?.createdAt ?? r.createdAt : null;
            const days = waitingSince ? differenceInCalendarDays(new Date(), waitingSince) : 0;
            return (
              <Card key={r.id} className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.title}</span>
                  <Badge>{APPROVAL_TYPES[r.type] ?? r.type}</Badge>
                  <Badge tone={r.status === "approved" ? "green" : r.status === "rejected" ? "red" : r.status === "cancelled" ? "neutral" : "amber"}>{r.status === "pending" ? "Waiting" : r.status[0]!.toUpperCase() + r.status.slice(1)}</Badge>
                  <span className="ml-auto text-xs text-muted">sent {format(r.createdAt, "d MMM yyyy, h:mm a")}</span>
                </div>
                {/* The steps: submitted → each approver → done. */}
                <ol className="flex flex-wrap items-start gap-y-3">
                  <Step state="done" title="Sent" sub={format(r.createdAt, "d MMM")} />
                  {steps.map((s, i) => {
                    const act = decided.find((a) => a.step === i);
                    const state = act ? (act.decision === "rejected" ? "rejected" : "done") : r.status === "pending" && r.step === i ? "current" : "todo";
                    return <Step key={i} state={state} title={stepName(s)} sub={act ? `${act.decision === "rejected" ? "Rejected" : "Approved"} by ${act.user?.name ?? "—"} · ${format(act.createdAt, "d MMM")}` : state === "current" ? `waiting ${formatDistanceToNowStrict(waitingSince!)}` : ""} />;
                  })}
                  <Step state={r.status === "approved" ? "done" : r.status === "rejected" ? "rejected" : "todo"} title={r.status === "rejected" ? "Rejected" : "Approved"} sub={r.decidedAt ? format(r.decidedAt, "d MMM") : ""} last />
                </ol>
                {r.status === "pending" && days >= 3 && <p className="mt-3 text-xs text-amber-700">Waiting {days} days at this step. You can remind the approver, or ask HR.</p>}
                {r.actions.some((a) => a.comment) && (
                  <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
                    {r.actions.filter((a) => a.comment).map((a) => <li key={a.id}><b className="font-medium">{a.user?.name ?? "—"}:</b> {a.comment} <span className="text-muted">· {format(a.createdAt, "d MMM")}</span></li>)}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Step({ state, title, sub, last }: { state: "done" | "current" | "todo" | "rejected"; title: string; sub?: string; last?: boolean }) {
  const Icon = state === "done" ? Check : state === "rejected" ? X : Clock;
  return (
    <li className="flex min-w-0 items-start">
      <div className="flex w-36 flex-col items-center text-center">
        <span className={cn("flex size-7 items-center justify-center rounded-full border-2", state === "done" ? "border-emerald-500 bg-emerald-500 text-white" : state === "rejected" ? "border-red-500 bg-red-500 text-white" : state === "current" ? "border-amber-500 bg-amber-50 text-amber-600" : "border-line text-muted")}><Icon className="size-3.5" /></span>
        <span className={cn("mt-1 text-xs font-medium", state === "todo" && "text-muted")}>{title}</span>
        {sub && <span className={cn("text-[11px]", state === "current" ? "text-amber-700" : "text-muted")}>{sub}</span>}
      </div>
      {!last && <span className={cn("mt-3.5 h-0.5 w-6 shrink-0", state === "done" ? "bg-emerald-400" : "bg-line")} />}
    </li>
  );
}
