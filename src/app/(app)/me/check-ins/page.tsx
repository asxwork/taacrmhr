import { format, parse } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { saveMyCheckIn } from "../../hr/check-ins/actions";
import { MOODS } from "@/lib/checkins";

export const metadata = { title: "Monthly check-ins" };

/** My Space → Profile → Check-ins: this month's 1:1 with my manager and past months. */
export default async function MyCheckInsPage() {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, manager: { select: { fullName: true } } } });
  if (!emp) return <><PageHeader title="Monthly check-ins" /><Card><EmptyState title="Your login isn't linked to an employee record" /></Card></>;
  const month = format(new Date(), "yyyy-MM");
  const all = await db.checkIn.findMany({ where: { employeeId: emp.id }, orderBy: { month: "desc" }, take: 13 });
  const cur = all.find((c) => c.month === month);
  const past = all.filter((c) => c.month !== month);
  const mName = (m: string) => format(parse(m, "yyyy-MM", new Date()), "MMMM yyyy");
  return (
    <>
      <PageHeader title="Monthly check-ins" description={`A short monthly 1:1${emp.manager ? ` with ${emp.manager.fullName}` : " with your manager"}: how it went, what's in the way, and goals for next month.`} />
      <Card className="mb-6 p-5">
        <h2 className="mb-4 font-medium">{mName(month)}</h2>
        <ActionForm action={saveMyCheckIn} className="space-y-4">
          <input type="hidden" name="month" value={month} />
          <Field label="How was your month?">
            <div className="flex flex-wrap gap-2">{MOODS.slice(1).map((m, i) => (
              <label key={m} className="cursor-pointer"><input type="radio" name="mood" value={i + 1} defaultChecked={cur?.mood === i + 1} className="peer sr-only" />
                <span className="block rounded-full border border-line px-3 py-1.5 text-sm peer-checked:border-navy-900 peer-checked:bg-navy-900 peer-checked:text-white">{m}</span></label>
            ))}</div>
          </Field>
          <Field label="Wins — what went well"><textarea name="wins" rows={3} defaultValue={cur?.wins ?? ""} className="input" /></Field>
          <Field label="Blockers — anything in your way"><textarea name="blockers" rows={2} defaultValue={cur?.blockers ?? ""} className="input" /></Field>
          <Field label="Goals for next month"><textarea name="goals" rows={3} defaultValue={cur?.goals ?? ""} className="input" /></Field>
          {cur?.managerNotes && <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900"><p className="text-xs font-medium uppercase">Manager&apos;s notes</p><p className="whitespace-pre-line">{cur.managerNotes}</p></div>}
          <SubmitButton>Save check-in</SubmitButton>
        </ActionForm>
      </Card>
      {past.length > 0 && (
        <div className="space-y-3">
          {past.map((c) => (
            <Card key={c.id} className="p-4 text-sm">
              <p className="mb-2 font-medium">{mName(c.month)} {c.mood ? <span className="font-normal text-muted">· {MOODS[c.mood]}</span> : null}</p>
              {([["Wins", c.wins], ["Blockers", c.blockers], ["Goals", c.goals], ["Manager's notes", c.managerNotes]] as const).filter(([, v]) => v).map(([k, v]) => (
                <p key={k} className="mb-1 whitespace-pre-line"><span className="text-muted">{k}: </span>{v}</p>
              ))}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
