import Link from "@/components/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { flowSteps, type Step } from "@/lib/approvals";
import { APPROVAL_TYPES } from "@/lib/hr-shared";
import { REQUEST_TYPES } from "@/lib/request-types";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Request Policy" };

const BUILT_IN: Record<string, { about: string; filedFrom: string }> = {
  leave: { about: "Time off against the leave balance.", filedFrom: "My Space → Requests → Leave" },
  attendance_correction: { about: "Fix a missed or wrong punch.", filedFrom: "My Space → Attendance" },
  expense: { about: "Claim money spent on company work; paid with salary.", filedFrom: "My Space → Requests → Expenses & loans" },
  loan: { about: "Loan or salary advance, repaid from salary.", filedFrom: "My Space → Requests → Expenses & loans" },
  profile_update: { about: "Changes to my profile, photo, relatives or qualifications.", filedFrom: "My Space → My profile" },
  document: { about: "A document an employee uploads for HR to check.", filedFrom: "My Space → Documents" },
  leave_encashment: { about: "Turn unused leave into pay.", filedFrom: "My Space → Requests → Leave" },
  salary_revision: { about: "Increment, promotion or adjustment of salary.", filedFrom: "HR → People → Salary Revisions" },
  device_change: { about: "Check in from a new phone or computer.", filedFrom: "Automatic, when someone checks in from a new device" },
};

/**
 * Compliance → Request Policy: every kind of request, who can file it, where from, and who approves it in which
 * order. Approvers are changed on the approval chains page.
 */
export default async function RequestPolicyPage() {
  const user = await requirePermission("hr.employees");
  const canEdit = user.isSuperAdmin || scopeFor(user, "hr.employees", "edit") === "all";
  const types = Object.keys(APPROVAL_TYPES);
  const [chains, pending, users] = await Promise.all([
    Promise.all(types.map(async (t) => [t, await flowSteps(t)] as const)),
    db.approvalRequest.groupBy({ by: ["type"], where: { status: "pending" }, _count: true }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const stepLabel = (s: Step) => (s.kind === "manager" ? "Line manager" : s.kind === "hr" ? "HR" : users.find((u) => u.id === (s as { userId?: string }).userId)?.name ?? "Named approver");
  const rows = types.map((t) => {
    const rt = REQUEST_TYPES.find((x) => x.type === t);
    return {
      type: t, label: APPROVAL_TYPES[t]!,
      about: rt?.description ?? BUILT_IN[t]?.about ?? "",
      who: rt?.forOthers ? "HR / managers for an employee" : t === "salary_revision" ? "HR" : "Every employee (HR can file for them)",
      from: rt ? `HR → Requests → ${rt.label}` : BUILT_IN[t]?.filedFrom ?? "—",
      steps: Object.fromEntries(chains)[t] ?? [],
      pending: pending.find((p) => p.type === t)?._count ?? 0,
    };
  });

  return (
    <>
      <PageHeader title="Request Policy" description="Every kind of request: who can file it, where from, and who approves it, in order."
        actions={canEdit && <Link href="/settings/hr?tab=approvals" className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"><ShieldCheck className="size-4" /> Change approvers</Link>} />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-4 py-2.5">Request</th><th className="px-4 py-2.5">Who can file</th><th className="px-4 py-2.5">Filed from</th><th className="px-4 py-2.5">Approved by (in order)</th><th className="px-4 py-2.5 text-right">Waiting</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.type} className="align-top hover:bg-canvas/60">
                  <td className="px-4 py-3"><p className="font-medium">{r.label}</p>{r.about && <p className="max-w-64 text-xs text-muted">{r.about}</p>}</td>
                  <td className="px-4 py-3 text-muted">{r.who}</td>
                  <td className="px-4 py-3 text-xs text-muted">{r.from}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap items-center gap-1">
                      {r.steps.map((s, i) => <span key={i} className="inline-flex items-center gap-1">{i > 0 && <ArrowRight className="size-3 text-muted" />}<Badge tone={s.kind === "hr" ? "navy" : s.kind === "manager" ? "amber" : "neutral"}>{stepLabel(s)}</Badge></span>)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{r.pending ? <Link href={`/approvals?type=${r.type}`} className="font-medium text-navy-900 hover:underline">{r.pending}</Link> : <span className="text-muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted">“Line manager” is the employee&apos;s reporting manager; if they have none it goes to HR.</p>
    </>
  );
}
