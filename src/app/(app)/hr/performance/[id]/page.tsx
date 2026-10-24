import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { APPRAISAL_STATUS } from "@/lib/hr-shared";
import { cn } from "@/lib/utils";
import { Badge, Card, Drawer, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { deleteCycle, reopenAppraisal, setCycleStatus } from "../actions";
import { AppraisalSummary, ManagerReviewForm, ratingLabel } from "../review-forms";

export const metadata = { title: "Review cycle" };
const TONE = { self: "amber", manager: "navy", done: "green" } as const;

export default async function CyclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string; status?: string }> }) {
  const user = await requirePermission("hr.performance");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const cycle = await db.appraisalCycle.findUnique({ where: { id } });
  if (!cycle) notFound();
  const scope = (await scopeWhere(user, "hr.performance", "view", { owner: "userId", branch: "branchId" })) as Prisma.EmployeeWhereInput;
  const appraisals = await db.appraisal.findMany({
    // An empty relation filter inside OR matches nothing in Prisma, so only add the OR when scope is limited.
    where: { cycleId: id, ...(Object.keys(scope).length && { OR: [{ employee: scope }, { reviewerId: user.id }] }) },
    include: { employee: { include: { designation: true, department: true } } },
    orderBy: { employee: { fullName: "asc" } },
  });
  const reviewers = Object.fromEntries((await db.user.findMany({ where: { id: { in: appraisals.map((a) => a.reviewerId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const shown = sp.status ? appraisals.filter((a) => a.status === sp.status) : appraisals;
  const open = sp.a ? appraisals.find((a) => a.id === sp.a) : null;
  const canEdit = can(user, "hr.performance", "edit");
  const base = `/hr/performance/${id}${sp.status ? `?status=${sp.status}` : ""}`;
  const mayReview = (a: (typeof appraisals)[number]) => cycle.status === "open" && a.status !== "done" && a.employee.userId !== user.id && (a.reviewerId === user.id || canEdit);

  return (
    <>
      <Link href="/hr/performance" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> Performance</Link>
      <PageHeader
        title={cycle.name}
        description={`${format(cycle.from, "d MMM yyyy")} – ${format(cycle.to, "d MMM yyyy")} · ${appraisals.length} employee(s)`}
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <form action={setCycleStatus}>
                <input type="hidden" name="id" value={cycle.id} />
                <input type="hidden" name="status" value={cycle.status === "open" ? "closed" : "open"} />
                <button className={buttonClass("secondary")}>{cycle.status === "open" ? "Close cycle" : "Reopen cycle"}</button>
              </form>
            )}
            {can(user, "hr.performance", "delete") && cycle.status === "closed" && (
              <form action={deleteCycle}><input type="hidden" name="id" value={cycle.id} /><button className={buttonClass("danger")}>Delete</button></form>
            )}
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
        {([["", "All"], ...Object.entries(APPRAISAL_STATUS)] as [string, string][]).map(([s, label]) => (
          <Link key={s} href={`/hr/performance/${id}${s ? `?status=${s}` : ""}`} className={cn("rounded-full border px-3 py-1", (sp.status ?? "") === s ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted hover:text-ink")}>
            {label} {s ? appraisals.filter((a) => a.status === s).length : appraisals.length}
          </Link>
        ))}
      </div>
      <Card className="overflow-hidden">
        {shown.length === 0 ? <EmptyState title="Nobody here" /> : (
          <ul className="divide-y divide-line">
            {shown.map((a) => (
              <li key={a.id}>
                <Link href={`${base}${base.includes("?") ? "&" : "?"}a=${a.id}`} scroll={false} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-canvas/60">
                  <PersonAvatar name={a.employee.fullName} photo={a.employee.photo} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{a.employee.fullName}</span>
                    <span className="block text-xs text-muted">{[a.employee.designation?.name, a.employee.department?.name].filter(Boolean).join(" · ")} · Reviewer: {a.reviewerId ? reviewers[a.reviewerId] ?? "—" : "HR"}</span>
                  </span>
                  <span className="w-24 text-xs text-muted">Self {a.selfRating ? `${a.selfRating}/5` : "—"}</span>
                  <span className="w-28 text-xs font-medium">Manager {a.managerRating ? `${a.managerRating}/5` : "—"}</span>
                  <Badge tone={TONE[a.status as keyof typeof TONE] ?? "neutral"}>{APPRAISAL_STATUS[a.status as keyof typeof APPRAISAL_STATUS] ?? a.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && (
        <Drawer title={`${open.employee.fullName} · ${cycle.name}`} closeHref={base} width="max-w-2xl">
          {mayReview(open) ? <ManagerReviewForm a={open} /> : (
            <div className="space-y-5">
              <AppraisalSummary a={open} />
              {open.status !== "done" && <p className="text-sm text-muted">Waiting for {open.status === "self" ? "the employee’s self review" : "the manager’s review"}.</p>}
              {open.status === "done" && <p className="text-sm">Final rating: <span className="font-medium">{ratingLabel(open.managerRating)}</span></p>}
            </div>
          )}
          {canEdit && cycle.status === "open" && open.status !== "self" && open.employee.userId !== user.id && (
            <form action={reopenAppraisal} className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
              <input type="hidden" name="id" value={open.id} />
              <span className="text-muted">Send back to</span>
              <button name="to" value="self" className="font-medium text-navy-900 hover:underline">self review</button>
              {open.status === "done" && <><span className="text-muted">or</span><button name="to" value="manager" className="font-medium text-navy-900 hover:underline">manager review</button></>}
            </form>
          )}
        </Drawer>
      )}
    </>
  );
}
