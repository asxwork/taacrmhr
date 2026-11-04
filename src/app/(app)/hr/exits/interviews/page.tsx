import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { EXIT_RATINGS } from "@/lib/exit-interview";
import { fmtDate } from "@/lib/utils";
import { Badge, Card, Drawer, EmptyState, PageHeader } from "@/components/ui";
import { BarList } from "@/components/charts";
import { ExitInterviewForm } from "@/components/hr/exit-interview-form";

export const metadata = { title: "Exit interviews" };

/** Exits → Interviews: what leavers said — top reasons, average ratings, would-rejoin — and each answer. */
export default async function ExitInterviewsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const user = await requirePermission("hr.exit");
  const sp = await searchParams;
  const scope = (await scopeWhere(user, "hr.exit", "view", { owner: "userId", branch: "branchId" })) as Prisma.EmployeeWhereInput;
  const people = await db.employee.findMany({
    where: { ...scope, status: { in: ["notice", "left"] } },
    select: { id: true, fullName: true, status: true, leftAt: true, lastWorkingDay: true, designation: { select: { name: true } }, exitInterview: true },
    orderBy: [{ lastWorkingDay: "desc" }], take: 200,
  });
  const done = people.filter((p) => p.exitInterview?.submittedAt).map((p) => ({ ...p, x: p.exitInterview! }));
  const reasons = new Map<string, number>();
  for (const p of done) for (const r of (p.x.reasons ?? "").split(", ").filter(Boolean)) reasons.set(r, (reasons.get(r) ?? 0) + 1);
  const avg = EXIT_RATINGS.map(([k, label]) => {
    const vals = done.map((p) => { try { return (JSON.parse(p.x.ratings ?? "{}") as Record<string, number | null>)[k]; } catch { return null; } }).filter((v): v is number => !!v);
    return { label, value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, n: vals.length };
  });
  const answered = done.filter((p) => p.x.wouldRejoin != null);
  const rejoin = answered.length ? Math.round((answered.filter((p) => p.x.wouldRejoin).length / answered.length) * 100) : null;
  const open = people.find((p) => p.id === sp.open);
  const canEdit = can(user, "hr.exit", "edit");

  return (
    <>
      <PageHeader title="Exit interviews" description="Leavers fill this in from My Space once their resignation is recorded. HR can also fill it in on their behalf." />
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5"><h2 className="mb-3 font-medium">Top reasons</h2><BarList rows={[...reasons].sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, value: v, display: String(v) }))} empty="No answers yet." /></Card>
        <Card className="p-5"><h2 className="mb-3 font-medium">Average ratings (out of 5)</h2><BarList rows={avg.filter((a) => a.n).map((a) => ({ name: a.label, value: a.value, display: a.value.toFixed(1) }))} empty="No answers yet." /></Card>
        <Card className="p-5"><h2 className="mb-1 font-medium">Would work here again</h2><p className="text-4xl font-semibold tabular-nums">{rejoin == null ? "—" : `${rejoin}%`}</p><p className="text-xs text-muted">{done.length} of {people.length} leavers answered</p></Card>
      </div>
      <Card className="overflow-hidden">
        {people.length === 0 ? <EmptyState title="No leavers" /> : (
          <ul className="divide-y divide-line">
            {people.map((p) => (
              <li key={p.id}>
                <Link href={`/hr/exits/interviews?open=${p.id}`} scroll={false} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-canvas/50">
                  <span className="min-w-0 flex-1"><span className="block font-medium">{p.fullName}</span><span className="block text-xs text-muted">{p.designation?.name ?? ""} · {p.status === "left" ? `left ${p.leftAt ? fmtDate(p.leftAt) : ""}` : `last day ${p.lastWorkingDay ? fmtDate(p.lastWorkingDay) : "—"}`}</span></span>
                  {p.exitInterview?.submittedAt ? <Badge tone="green">Answered</Badge> : <Badge>Not yet</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {open && (
        <Drawer title={`Exit interview · ${open.fullName}`} closeHref="/hr/exits/interviews">
          {canEdit ? <ExitInterviewForm saved={open.exitInterview} employeeId={open.id} /> : open.exitInterview?.submittedAt ? (
            <div className="space-y-3 text-sm">
              <p><span className="text-muted">Reasons: </span>{open.exitInterview.reasons || "—"}</p>
              <p className="whitespace-pre-line"><span className="text-muted">Liked: </span>{open.exitInterview.liked || "—"}</p>
              <p className="whitespace-pre-line"><span className="text-muted">Improve: </span>{open.exitInterview.improve || "—"}</p>
              <p><span className="text-muted">Would rejoin: </span>{open.exitInterview.wouldRejoin == null ? "—" : open.exitInterview.wouldRejoin ? "Yes" : "No"}</p>
            </div>
          ) : <p className="text-sm text-muted">Not answered yet.</p>}
        </Drawer>
      )}
    </>
  );
}
