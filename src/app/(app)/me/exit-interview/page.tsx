import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ExitInterviewForm } from "@/components/hr/exit-interview-form";

export const metadata = { title: "Exit interview" };

/** My Space → Exit interview: a short, honest survey for people serving notice. */
export default async function MyExitInterviewPage() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { status: true, exitInterview: true } });
  if (!emp || !["notice", "left"].includes(emp.status)) return <><PageHeader title="Exit interview" /><Card><EmptyState title="Nothing to fill in" description="The exit interview opens once a resignation is recorded." /></Card></>;
  return (
    <>
      <PageHeader title="Exit interview" description="We're sorry to see you go. Your honest answers help us improve — only HR sees them." />
      <Card className="p-5">
        {emp.exitInterview?.submittedAt && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Thank you — HR has your answers. You can still change them.</p>}
        <ExitInterviewForm saved={emp.exitInterview} />
      </Card>
    </>
  );
}
