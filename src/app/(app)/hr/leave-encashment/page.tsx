import Link from "next/link";
import { format, startOfYear } from "date-fns";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { employeeWhere } from "@/lib/hr";
import { encashableBalances, perDayPay } from "@/lib/compensation";
import { Badge, Card, Drawer, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { DrillTiles } from "@/components/drill-tiles";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { EncashForm } from "@/components/hr/encash-form";

export const metadata = { title: "Leave Encashment" };

type SP = { status?: string; new?: string; emp?: string };
const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;
const TONE = { pending: "amber", approved: "navy", paid: "green", rejected: "red", cancelled: "neutral" } as const;
const LABEL: Record<string, string> = { approved: "awaiting payroll" };

/** People → Leave Encashment: unused paid leave turned into pay, approved through the chain and paid by payroll. */
export default async function LeaveEncashmentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("hr.leave");
  const sp = await searchParams;
  const canCreate = can(user, "hr.leave", "edit");
  const scope = (await employeeWhere(user)) ?? { id: "none" };
  const [rows, staff] = await Promise.all([
    db.leaveEncashment.findMany({
      where: { employee: scope, ...(sp.status && { status: sp.status }) },
      include: { employee: { select: { id: true, fullName: true, code: true } } }, orderBy: { createdAt: "desc" }, take: 300,
    }),
    canCreate ? db.employee.findMany({ where: { ...scope, status: { not: "left" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }) : [],
  ]);
  const runs = new Map((await db.payrollRun.findMany({ where: { id: { in: rows.map((r) => r.runId).filter(Boolean) as string[] } }, select: { id: true, month: true } })).map((r) => [r.id, r.month]));
  const picked = sp.new && sp.emp ? await db.employee.findFirst({ where: { ...scope, id: sp.emp }, include: { salary: true } }) : null;
  const balances = picked ? await encashableBalances(picked.id) : [];
  const year = startOfYear(new Date());
  const sum = (status: string) => rows.filter((r) => r.status === status);

  return (
    <>
      <PageHeader title="Leave Encashment" description="Unused paid leave paid out as salary: approved days leave the balance straight away and the amount is added to the next payroll."
        actions={canCreate && <LinkButton href="/hr/leave-encashment?new=1" scroll={false}><Plus className="size-4" /> New encashment</LinkButton>} />

      <DrillTiles className="mb-6 lg:grid-cols-4 xl:grid-cols-4" tiles={[
        { key: "p", label: "Waiting for approval", tone: "amber", value: sum("pending").length, href: "/hr/leave-encashment?status=pending" },
        { key: "a", label: "Approved, awaiting payroll", tone: "blue", value: sum("approved").length, sub: pkr(sum("approved").reduce((s, r) => s + r.amount, 0)), href: "/hr/leave-encashment?status=approved" },
        { key: "paid", label: `Paid in ${year.getFullYear()}`, tone: "green", value: pkr(sum("paid").filter((r) => r.createdAt >= year).reduce((s, r) => s + r.amount, 0)), href: "/hr/leave-encashment?status=paid" },
        { key: "d", label: "Days encashed this year", tone: "navy", value: rows.filter((r) => ["approved", "paid"].includes(r.status) && r.createdAt >= year).reduce((s, r) => s + r.days, 0) },
      ]} />

      <Card className="overflow-x-auto">
        {rows.length === 0 ? <EmptyState title="No leave encashments yet" description="Employees can request one from My Leave; HR can raise one here." /> : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Leave type</th><th className="px-4 py-2.5 text-right">Days</th><th className="px-4 py-2.5 text-right">Per day</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5">Requested</th><th className="px-4 py-2.5">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5"><Link href={`/hr/employees/${r.employee.id}?tab=policies`} className="font-medium hover:underline">{r.employee.fullName}</Link><span className="block text-xs text-muted">{r.employee.code}</span></td>
                  <td className="px-4 py-2.5">{r.typeName} · {r.year}{r.reason && <span className="block max-w-56 truncate text-xs text-muted">{r.reason}</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.days}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{pkr(r.perDay)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{pkr(r.amount)}</td>
                  <td className="px-4 py-2.5">{format(r.createdAt, "d MMM yyyy")}</td>
                  <td className="px-4 py-2.5">
                    <Link href={r.runId && runs.get(r.runId) ? `/hr/payroll/${runs.get(r.runId)}` : r.approvalId ? `/approvals?open=${r.approvalId}` : "#"}>
                      <Badge tone={TONE[r.status as keyof typeof TONE] ?? "neutral"}>{LABEL[r.status] ?? r.status}{r.runId && runs.get(r.runId) ? ` · ${runs.get(r.runId)}` : ""}</Badge>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {canCreate && sp.new && (
        <Drawer title="New leave encashment" closeHref="/hr/leave-encashment">
          <AutoFilterForm className="mb-5">
            <input type="hidden" name="new" value="1" />
            <select name="emp" defaultValue={sp.emp ?? ""} className="input" aria-label="Employee">
              <option value="">Choose the employee…</option>
              {staff.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </AutoFilterForm>
          {picked && <EncashForm employeeId={picked.id} balances={balances} perDay={picked.salary ? perDayPay(picked.salary.gross) : null} />}
        </Drawer>
      )}
    </>
  );
}
