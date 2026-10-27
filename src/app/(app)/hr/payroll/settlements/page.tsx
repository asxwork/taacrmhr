import Link from "next/link";
import { format, subMonths } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { computeSettlement, type SettlementLine } from "@/lib/payroll-extra";
import { fmtPKR } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { approveSettlement, markSettlementPaid } from "../extra-actions";

export const metadata = { title: "Final Settlement" };

/** Payroll → Final Settlement: what each leaver is owed on their last day, approved once and kept as a snapshot. */
export default async function SettlementsPage({ searchParams }: { searchParams: Promise<{ emp?: string }> }) {
  const user = await requirePermission("hr.payroll");
  const sp = await searchParams;
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.payroll", "edit") === "all";
  const leavers = await db.employee.findMany({
    where: { OR: [{ status: "notice" }, { status: "left", leftAt: { gte: subMonths(new Date(), 6) } }] },
    include: { settlements: true, designation: { select: { name: true } } },
    orderBy: [{ status: "asc" }, { lastWorkingDay: "asc" }],
  });
  const picked = sp.emp ? leavers.find((e) => e.id === sp.emp) : null;
  const saved = picked?.settlements[0];
  const preview = picked && !saved ? await computeSettlement(picked.id) : null;
  const lines: SettlementLine[] = saved ? JSON.parse(saved.lines) : preview?.lines ?? [];

  return (
    <>
      <PageHeader title="Final Settlement" description="Employees serving notice or who left in the last six months. The settlement adds the last salary, unused leave, approved claims and pay items, and recovers loans." />
      <Card className="overflow-x-auto">
        {leavers.length === 0 ? <EmptyState title="Nobody is leaving" /> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Last working day</th><th className="px-4 py-2.5">Settlement</th><th className="px-4 py-2.5" /></tr></thead>
            <tbody className="divide-y divide-line">
              {leavers.map((e) => {
                const s = e.settlements[0];
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-2.5"><Link href={`/hr/employees/${e.id}`} className="font-medium hover:underline">{e.fullName}</Link><span className="block text-xs text-muted">{e.code} · {e.designation?.name ?? ""}</span></td>
                    <td className="px-4 py-2.5"><Badge tone={e.status === "notice" ? "amber" : "neutral"}>{e.status === "notice" ? "notice period" : "left"}</Badge></td>
                    <td className="px-4 py-2.5">{e.lastWorkingDay ?? e.leftAt ? format((e.lastWorkingDay ?? e.leftAt)!, "d MMM yyyy") : "—"}</td>
                    <td className="px-4 py-2.5">{s ? <span className="tabular-nums">{fmtPKR(s.net)} <Badge tone={s.status === "paid" ? "green" : "navy"}>{s.status}</Badge></span> : <span className="text-muted">not prepared</span>}</td>
                    <td className="px-4 py-2.5 text-right"><Link href={`/hr/payroll/settlements?emp=${e.id}`} scroll={false} className="text-sm font-medium text-navy-700 hover:underline">{s ? "View" : "Prepare"}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {picked && (
        <Drawer title={`Final settlement · ${picked.fullName}`} closeHref="/hr/payroll/settlements" width="max-w-xl">
          <p className="mb-4 text-sm text-muted">Last working day {format((saved?.lastWorkingDay ?? preview?.lastWorkingDay)!, "d MMMM yyyy")}{saved ? ` · approved ${format(saved.createdAt, "d MMM yyyy")}` : " · preview, recalculated each time you open it"}</p>
          <ul className="mb-4 divide-y divide-line rounded-lg border border-line text-sm">
            {lines.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className={cn(l.kind === "info" && "text-muted")}>{l.label}</span>
                {l.kind !== "info" && <span className={cn("shrink-0 tabular-nums", l.kind === "deduction" && "text-red-600")}>{l.kind === "deduction" ? "−" : ""}{fmtPKR(l.amount)}</span>}
              </li>
            ))}
            <li className="flex justify-between bg-canvas/50 px-4 py-3 font-semibold"><span>Net {((saved?.net ?? preview?.net) ?? 0) < 0 ? "recoverable from employee" : "payable"}</span><span className="tabular-nums">{fmtPKR(Math.abs((saved?.net ?? preview?.net) ?? 0))}</span></li>
          </ul>
          {saved ? (
            saved.status === "approved" && canEdit && (
              <form action={markSettlementPaid}><input type="hidden" name="id" value={saved.id} /><Button>Mark as paid</Button></form>
            )
          ) : canEdit && (
            <ActionForm action={approveSettlement} className="space-y-3">
              <input type="hidden" name="employeeId" value={picked.id} />
              <Field label="Note (optional)"><input name="note" className="input" /></Field>
              <p className="text-xs text-muted">Approving closes their loans, marks the claims and encashments above as paid, and keeps these figures.</p>
              <SubmitButton>Approve settlement</SubmitButton>
            </ActionForm>
          )}
        </Drawer>
      )}
    </>
  );
}
