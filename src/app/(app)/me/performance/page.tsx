import Link from "next/link";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { APPRAISAL_STATUS } from "@/lib/hr-shared";
import { Badge, Card, Drawer, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { AppraisalSummary, ManagerReviewForm, SelfReviewForm } from "../../hr/performance/review-forms";

export const metadata = { title: "My Performance" };
const TONE = { self: "amber", manager: "navy", done: "green" } as const;

export default async function MyPerformancePage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [mine, toReview] = await Promise.all([
    db.appraisal.findMany({ where: { employee: { userId: user.id } }, include: { cycle: true }, orderBy: { cycle: { from: "desc" } } }),
    db.appraisal.findMany({ where: { reviewerId: user.id, status: { not: "done" }, cycle: { status: "open" }, employee: { userId: { not: user.id } } }, include: { cycle: true, employee: true }, orderBy: { status: "desc" } }),
  ]);
  const reviewing = sp.r ? toReview.find((a) => a.id === sp.r) : null;

  return (
    <>
      <PageHeader title="My Performance" description="Your appraisals, and reviews waiting for you as a manager." />

      {toReview.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-medium">Reviews to complete ({toReview.length})</h2>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-line">
              {toReview.map((a) => (
                <li key={a.id}>
                  <Link href={`/me/performance?r=${a.id}`} scroll={false} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-canvas/60">
                    <PersonAvatar name={a.employee.fullName} photo={a.employee.photo} />
                    <span className="flex-1"><span className="block font-medium">{a.employee.fullName}</span><span className="block text-xs text-muted">{a.cycle.name}</span></span>
                    <Badge tone={a.status === "manager" ? "navy" : "amber"}>{a.status === "manager" ? "Ready for you" : "Self review pending"}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section className="space-y-4">
        {mine.length === 0 ? <Card><EmptyState title="No appraisals yet" description="HR opens review cycles; yours will appear here." /></Card> : mine.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{a.cycle.name}</p>
                <p className="text-sm text-muted">{format(a.cycle.from, "d MMM yyyy")} – {format(a.cycle.to, "d MMM yyyy")}</p>
              </div>
              <Badge tone={TONE[a.status as keyof typeof TONE] ?? "neutral"}>{APPRAISAL_STATUS[a.status as keyof typeof APPRAISAL_STATUS] ?? a.status}</Badge>
            </div>
            {a.status === "self" && a.cycle.status === "open" ? <SelfReviewForm a={a} /> : (
              <>
                <AppraisalSummary a={a} />
                {a.status === "manager" && <p className="mt-4 text-sm text-muted">Submitted — waiting for your manager’s review.</p>}
              </>
            )}
          </Card>
        ))}
      </section>

      {reviewing && (
        <Drawer title={`${reviewing.employee.fullName} · ${reviewing.cycle.name}`} closeHref="/me/performance" width="max-w-2xl">
          <ManagerReviewForm a={reviewing} />
        </Drawer>
      )}
    </>
  );
}
