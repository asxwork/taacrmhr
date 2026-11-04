import Link from "next/link";
import { addMonths, format, parse, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { MOODS } from "@/lib/checkins";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { saveManagerCheckIn } from "./actions";

export const metadata = { title: "Monthly check-ins" };

/** HR → Check-ins: each person's monthly 1:1 — what they wrote, and the manager's notes and goals. */
export default async function CheckInsPage({ searchParams }: { searchParams: Promise<{ m?: string; open?: string }> }) {
  const user = await requirePermission("hr.checkins");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? parse(sp.m!, "yyyy-MM", new Date()) : startOfMonth(new Date());
  const m = format(month, "yyyy-MM");
  const scope = (await scopeWhere(user, "hr.checkins", "view", { owner: "userId", branch: "branchId" })) as Prisma.EmployeeWhereInput;
  const people = await db.employee.findMany({
    where: { ...scope, status: { not: "left" } },
    select: { id: true, fullName: true, photo: true, designation: { select: { name: true } }, checkIns: { where: { month: m } } },
    orderBy: { fullName: "asc" }, take: 300,
  });
  const open = people.find((p) => p.id === sp.open);
  const oc = open?.checkIns[0];
  const canEdit = can(user, "hr.checkins", "edit");
  const nav = (d: Date) => `/hr/check-ins?m=${format(d, "yyyy-MM")}`;
  const filled = people.filter((p) => p.checkIns[0]?.wins || p.checkIns[0]?.goals).length;

  return (
    <>
      <PageHeader title="Monthly check-ins" description="A short 1:1 each month: the employee writes wins, blockers and goals in My Space; the manager adds notes and agreed goals here." />
      <div className="mb-4 flex items-center gap-2">
        <Link href={nav(addMonths(month, -1))} className="rounded-lg border border-line p-2 hover:bg-canvas" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
        <span className="min-w-32 text-center font-medium">{format(month, "MMMM yyyy")}</span>
        <Link href={nav(addMonths(month, 1))} className="rounded-lg border border-line p-2 hover:bg-canvas" aria-label="Next month"><ChevronRight className="size-4" /></Link>
        <span className="ml-auto text-sm text-muted">{filled} of {people.length} filled in</span>
      </div>
      <Card className="overflow-hidden">
        {people.length === 0 ? <EmptyState title="No one to show" /> : (
          <ul className="divide-y divide-line">
            {people.map((p) => {
              const c = p.checkIns[0];
              return (
                <li key={p.id}>
                  <Link href={`/hr/check-ins?m=${m}&open=${p.id}`} scroll={false} className="flex items-center gap-3 px-4 py-3 hover:bg-canvas/50">
                    <PersonAvatar name={p.fullName} photo={p.photo} className="size-9" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.fullName}</span><span className="block truncate text-xs text-muted">{p.designation?.name ?? ""}{c?.mood ? ` · ${MOODS[c.mood]}` : ""}</span></span>
                    {c?.wins || c?.goals ? <Badge tone="green">Filled in</Badge> : <Badge>Not yet</Badge>}
                    {c?.managerNotes && <Badge tone="navy">Notes added</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {open && (
        <Drawer title={`${open.fullName} · ${format(month, "MMMM yyyy")}`} closeHref={`/hr/check-ins?m=${m}`}>
          <div className="space-y-3 text-sm">
            <p><span className="text-muted">Month: </span>{oc?.mood ? MOODS[oc.mood] : "—"}</p>
            {([["Wins", oc?.wins], ["Blockers", oc?.blockers]] as const).map(([k, v]) => <div key={k}><p className="text-xs font-medium uppercase text-muted">{k}</p><p className="whitespace-pre-line">{v || "—"}</p></div>)}
          </div>
          {canEdit ? (
            <ActionForm action={saveManagerCheckIn} className="mt-5 space-y-4 border-t border-line pt-4">
              <input type="hidden" name="employeeId" value={open.id} /><input type="hidden" name="month" value={m} />
              <Field label="Goals for next month"><textarea name="goals" rows={3} defaultValue={oc?.goals ?? ""} className="input" /></Field>
              <Field label="Your notes"><textarea name="managerNotes" rows={4} defaultValue={oc?.managerNotes ?? ""} className="input" /></Field>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          ) : (
            <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
              {([["Goals", oc?.goals], ["Manager's notes", oc?.managerNotes]] as const).map(([k, v]) => <div key={k}><p className="text-xs font-medium uppercase text-muted">{k}</p><p className="whitespace-pre-line">{v || "—"}</p></div>)}
            </div>
          )}
        </Drawer>
      )}
    </>
  );
}
