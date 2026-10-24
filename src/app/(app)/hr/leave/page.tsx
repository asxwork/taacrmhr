import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameDay, parse, startOfDay, startOfMonth, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { balancesFor } from "@/lib/leave";
import { color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { adjustBalance, cancelApprovedLeave } from "./actions";

export const metadata = { title: "Leave" };

const TONE = { pending: "amber", approved: "green", rejected: "red", cancelled: "neutral" } as const;
const fmtDays = (n: number) => (Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : "∞");
type SP = { tab?: string; status?: string; month?: string; adjust?: string };

export default async function LeavePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.leave");
  const sp = await searchParams;
  const tab = sp.tab === "calendar" ? "calendar" : sp.tab === "balances" ? "balances" : "requests";
  const canEdit = can(user, "hr.leave", "edit");
  const empScope = (await scopeWhere(user, "hr.leave", "view", { owner: "userId", branch: "branchId" })) as Prisma.EmployeeWhereInput;
  const now = new Date();

  const tabs = (
    <div className="mb-4 flex rounded-lg bg-black/5 p-0.5 sm:w-fit">
      {([["requests", "Requests"], ["calendar", "Who’s off"], ["balances", "Balances"]] as const).map(([t, label]) => (
        <Link key={t} href={t === "requests" ? "/hr/leave" : `/hr/leave?tab=${t}`} className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{label}</Link>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (tab === "requests") {
    const status = sp.status ?? "pending";
    const requests = await db.leaveRequest.findMany({
      where: { employee: empScope, ...(status !== "all" && { status }) },
      include: { type: true, employee: { select: { id: true, fullName: true, photo: true, code: true } } },
      orderBy: status === "pending" ? { from: "asc" } : { from: "desc" }, take: 200,
    });
    body = (
      <>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {["pending", "approved", "rejected", "cancelled", "all"].map((s) => (
            <Link key={s} href={`/hr/leave?status=${s}`} className={cn("rounded-full border px-3 py-1 capitalize", status === s ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted hover:text-ink")}>{s}</Link>
          ))}
        </div>
        <Card className="overflow-hidden">
          {requests.length === 0 ? <EmptyState title={`No ${status === "all" ? "" : status} requests`} /> : (
            <ul className="divide-y divide-line">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <PersonAvatar name={r.employee.fullName} photo={r.employee.photo} />
                  <span className="min-w-0 flex-1">
                    <Link href={`/hr/employees/${r.employee.id}`} className="block font-medium hover:underline">{r.employee.fullName}</Link>
                    <span className="block text-xs text-muted">
                      <span className={cn("mr-1 inline-block size-2 rounded-full align-middle", color(r.type.color).dot)} />
                      {r.type.name} · {r.days} day{r.days === 1 ? "" : "s"} · {format(r.from, "d MMM")}{isSameDay(r.from, r.to) ? "" : ` – ${format(r.to, "d MMM")}`}{r.halfDay ? " (half)" : ""}{r.reason ? ` · ${r.reason}` : ""}
                    </span>
                  </span>
                  <Badge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>{r.status}</Badge>
                  {r.status === "pending" && r.approvalId && <Link href={`/approvals?tab=waiting&open=${r.approvalId}`} className="text-xs font-medium text-navy-900 hover:underline">Review</Link>}
                  {r.status === "approved" && canEdit && r.to >= startOfDay(now) && (
                    <form action={cancelApprovedLeave}><input type="hidden" name="id" value={r.id} /><Button variant="ghost" className="h-8 px-2 text-xs">Cancel</Button></form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>
    );
  } else if (tab === "calendar") {
    const month = sp.month ? parse(sp.month, "yyyy-MM", now) : now;
    const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
    const leaves = await db.leaveRequest.findMany({
      where: { employee: empScope, status: { in: ["approved", "pending"] }, from: { lte: endOfMonth(month) }, to: { gte: startOfMonth(month) } },
      include: { type: true, employee: { select: { id: true, fullName: true } } }, orderBy: { from: "asc" },
    });
    const people = [...new Map(leaves.map((l) => [l.employee.id, l.employee])).values()];
    body = (
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <Link href={`/hr/leave?tab=calendar&month=${format(subMonths(month, 1), "yyyy-MM")}`} className="rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
          <span className="font-medium">{format(month, "MMMM yyyy")}</span>
          <Link href={`/hr/leave?tab=calendar&month=${format(addMonths(month, 1), "yyyy-MM")}`} className="rounded-md p-1.5 text-muted hover:bg-canvas" aria-label="Next month"><ChevronRight className="size-4" /></Link>
        </div>
        {people.length === 0 ? <EmptyState title="Nobody is off this month" /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead><tr className="border-b border-line"><th className="th sticky left-0 z-[2] min-w-40">Employee</th>{days.map((d) => <th key={d.getDate()} className="th px-0.5 text-center">{d.getDate()}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="sticky left-0 z-[1] whitespace-nowrap bg-surface px-4 py-2 text-sm font-medium">{p.fullName}</td>
                    {days.map((d) => {
                      const l = leaves.find((x) => x.employee.id === p.id && startOfDay(x.from) <= d && startOfDay(x.to) >= d);
                      return (
                        <td key={d.getDate()} className="px-0.5 py-1.5">
                          {l && <span title={`${l.type.name} (${l.status})`} className={cn("block h-5 rounded", color(l.type.color).bar, l.status === "pending" && "opacity-40")} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-muted">Faded bars are pending requests.</p>
          </div>
        )}
      </Card>
    );
  } else {
    const year = now.getFullYear();
    const employees = await db.employee.findMany({ where: { ...empScope, status: { not: "left" } }, select: { id: true, fullName: true, photo: true }, orderBy: { fullName: "asc" } });
    const all = await Promise.all(employees.map(async (e) => ({ e, b: await balancesFor(e.id, year) })));
    const types = all[0]?.b.map((x) => x.type) ?? [];
    body = (
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Employee</th>{types.map((t) => <th key={t.id} className="th text-center">{t.code}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {all.map(({ e, b }) => (
                <tr key={e.id} className="hover:bg-canvas/60">
                  <td className="td"><span className="flex items-center gap-3"><PersonAvatar name={e.fullName} photo={e.photo} /><span className="whitespace-nowrap font-medium">{e.fullName}</span></span></td>
                  {types.map((t) => {
                    const x = b.find((y) => y.type.id === t.id);
                    const cell = x ? (x.unlimited ? `${fmtDays(x.used)} used` : `${fmtDays(x.available)} / ${fmtDays(x.entitled + x.carried + x.adjusted)}`) : "—";
                    return (
                      <td key={t.id} className="td text-center tabular-nums">
                        {x && canEdit && !x.unlimited ? <Link href={`/hr/leave?tab=balances&adjust=${e.id}:${t.id}`} scroll={false} className="hover:underline">{cell}</Link> : cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-muted">Available / total for {year}. Click a balance to adjust it.</p>
      </Card>
    );
  }

  const [adjEmp, adjType] = (sp.adjust ?? "").split(":");
  const adjust = sp.adjust && canEdit ? await Promise.all([db.employee.findUnique({ where: { id: adjEmp ?? "" } }), db.leaveType.findUnique({ where: { id: adjType ?? "" } })]) : null;

  return (
    <>
      <PageHeader title="Leave" description="Requests, who’s off, and balances." />
      {tabs}
      {body}
      {adjust?.[0] && adjust[1] && (
        <Drawer title={`Adjust ${adjust[1].name} · ${adjust[0].fullName}`} closeHref="/hr/leave?tab=balances" width="max-w-md">
          <ActionForm action={adjustBalance} className="space-y-4">
            <input type="hidden" name="employeeId" value={adjust[0].id} />
            <input type="hidden" name="typeId" value={adjust[1].id} />
            <input type="hidden" name="year" value={now.getFullYear()} />
            <Field label="Days to add (use minus to deduct)"><input name="delta" type="number" step="0.5" required className="input" placeholder="e.g. 2 or -1" /></Field>
            <Field label="Reason"><input name="note" required className="input" placeholder="e.g. Compensatory leave for Sunday site visit" /></Field>
            <SubmitButton>Save adjustment</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
