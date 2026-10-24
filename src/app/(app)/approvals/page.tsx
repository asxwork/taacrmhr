import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Check, Circle, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeFor } from "@/lib/permissions";
import { canAct, flowSteps, pendingForUser } from "@/lib/approvals";
import { APPROVAL_TYPES, SELF_EDITABLE } from "@/lib/hr-shared";
import { fileUrl } from "@/lib/files";
import { cn, fmtAgo, fmtDateTime } from "@/lib/utils";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { cancelMyRequest, decideRequest } from "./actions";

export const metadata = { title: "Approvals" };

const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red", cancelled: "neutral" } as const;
type SP = { tab?: string; open?: string };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const isHr = user.isSuperAdmin || scopeFor(user, "hr.employees", "view") === "all";
  const waiting = await pendingForUser(user);
  const tab = sp.tab === "mine" ? "mine" : sp.tab === "all" && isHr ? "all" : waiting.length || sp.tab === "waiting" ? "waiting" : "mine";

  const include = { employee: { select: { fullName: true, code: true } }, requester: { select: { name: true } } } as const;
  const list =
    tab === "waiting" ? waiting
    : await db.approvalRequest.findMany({
        where: (tab === "mine" ? { requesterId: user.id } : {}) as Prisma.ApprovalRequestWhereInput,
        include, orderBy: { createdAt: "desc" }, take: 200,
      });

  const open = sp.open
    ? await db.approvalRequest.findUnique({
        where: { id: sp.open },
        include: { ...include, employee: { select: { fullName: true, code: true, userId: true, phone: true, personalEmail: true, address: true, city: true, maritalStatus: true, emergencyName: true, emergencyRelation: true, emergencyPhone: true, bankName: true, accountTitle: true, accountNumber: true } }, actions: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } } },
      })
    : null;
  // Only people involved (requester, the employee, a past/current approver, HR) may open a request.
  const openAllowed = open && (isHr || open.requesterId === user.id || open.employee.userId === user.id || open.actions.some((a) => a.userId === user.id) || (await canAct(user, open)));
  const actNow = open && openAllowed ? await canAct(user, open) : false;
  const steps = open && openAllowed ? await flowSteps(open.type) : [];
  const stepUsers = new Map((await db.user.findMany({ where: { id: { in: steps.map((s) => s.userId).filter(Boolean) as string[] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const closeHref = tab === "waiting" ? "/approvals" : `/approvals?tab=${tab}`;

  return (
    <>
      <PageHeader title="Approvals" description="Requests waiting for you, and the ones you’ve sent." />
      <div className="mb-4 flex rounded-lg bg-black/5 p-0.5 sm:w-fit">
        {([["waiting", `Waiting for me${waiting.length ? ` (${waiting.length})` : ""}`], ["mine", "My requests"], ...(isHr ? [["all", "All requests"]] : [])] as [string, string][]).map(([t, label]) => (
          <Link key={t} href={`/approvals?tab=${t}`} className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-center text-sm", tab === t ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{label}</Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        {list.length === 0 ? (
          <EmptyState title={tab === "waiting" ? "Nothing waiting for you" : "No requests yet"} description={tab === "mine" ? "Profile changes, documents and (soon) leave requests show up here." : undefined} />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <li key={r.id}>
                <Link href={`/approvals?tab=${tab}&open=${r.id}`} scroll={false} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas/60">
                  <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status}</Badge>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block text-xs text-muted">{APPROVAL_TYPES[r.type] ?? r.type} · {r.employee.fullName} ({r.employee.code}){r.requester ? ` · by ${r.requester.name}` : ""}</span>
                  </span>
                  <span className="text-xs text-muted">{fmtAgo(r.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {open && openAllowed && (
        <Drawer title={open.title} closeHref={closeHref}>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={STATUS_TONE[open.status as keyof typeof STATUS_TONE] ?? "neutral"}>{open.status}</Badge>
              <span className="text-muted">{APPROVAL_TYPES[open.type] ?? open.type} · {open.employee.fullName} · {fmtDateTime(open.createdAt)}</span>
            </div>
            {open.summary && <p className="text-sm">{open.summary}</p>}

            <RequestDetails type={open.type} payload={open.payload} employee={open.employee} />

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Approval steps</h3>
              <ol className="space-y-2">
                {steps.map((s, i) => {
                  const done = open.actions.find((a) => a.step === i && (a.decision === "approved" || a.decision === "rejected"));
                  const current = open.status === "pending" && open.step === i;
                  return (
                    <li key={i} className="flex items-center gap-2.5 text-sm">
                      <span className={cn("flex size-6 items-center justify-center rounded-full",
                        done?.decision === "approved" ? "bg-emerald-100 text-emerald-700" : done?.decision === "rejected" ? "bg-red-100 text-red-700" : current ? "bg-amber-100 text-amber-700" : "bg-canvas text-muted")}>
                        {done?.decision === "approved" ? <Check className="size-3.5" /> : done?.decision === "rejected" ? <X className="size-3.5" /> : <Circle className="size-2.5" />}
                      </span>
                      <span className="flex-1">{s.kind === "manager" ? "Reporting manager" : s.kind === "hr" ? "HR" : stepUsers.get(s.userId ?? "") ?? "Named approver"}</span>
                      {done && <span className="text-xs text-muted">{done.user?.name} · {fmtAgo(done.createdAt)}</span>}
                      {current && !done && <span className="text-xs font-medium text-amber-700">Waiting</span>}
                    </li>
                  );
                })}
              </ol>
            </section>

            {open.actions.some((a) => a.comment) && (
              <section>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Comments</h3>
                <ul className="space-y-2 text-sm">
                  {open.actions.filter((a) => a.comment).map((a) => (
                    <li key={a.id} className="rounded-md bg-canvas p-2.5"><b className="font-medium">{a.user?.name}</b> <span className="text-xs text-muted">({a.decision})</span><br />{a.comment}</li>
                  ))}
                </ul>
              </section>
            )}

            {actNow && (
              <ActionForm action={decideRequest} className="space-y-3 border-t border-line pt-4">
                <input type="hidden" name="id" value={open.id} />
                <Field label="Comment" hint="Required when rejecting."><textarea name="comment" rows={2} className="input" /></Field>
                <div className="flex gap-2">
                  <button name="decision" value="approved" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 text-sm font-medium text-white hover:bg-emerald-700"><Check className="size-4" /> Approve</button>
                  <button name="decision" value="rejected" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 px-3.5 text-sm font-medium text-red-600 hover:bg-red-50"><X className="size-4" /> Reject</button>
                </div>
              </ActionForm>
            )}
            {open.status === "pending" && open.requesterId === user.id && (
              <form action={cancelMyRequest} className="border-t border-line pt-4">
                <input type="hidden" name="id" value={open.id} />
                <Button variant="ghost">Cancel request</Button>
              </form>
            )}
          </div>
        </Drawer>
      )}
    </>
  );
}

async function RequestDetails({ type, payload, employee }: { type: string; payload: string; employee: Record<string, unknown> }) {
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(payload); } catch {}

  if (type === "profile_update") {
    const changes = (data.changes ?? {}) as Record<string, string | null>;
    return (
      <table className="w-full text-sm">
        <thead><tr><th className="pb-1 text-left text-xs font-medium text-muted">Field</th><th className="pb-1 text-left text-xs font-medium text-muted">Now</th><th className="pb-1 text-left text-xs font-medium text-muted">Requested</th></tr></thead>
        <tbody className="divide-y divide-line">
          {Object.entries(changes).map(([k, v]) => (
            <tr key={k}>
              <td className="py-1.5 pr-2 text-muted">{SELF_EDITABLE.find((f) => f.key === k)?.label ?? k}</td>
              <td className="py-1.5 pr-2 text-muted line-through">{String(employee[k] ?? "—")}</td>
              <td className="py-1.5 font-medium">{v || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (type === "document" && typeof data.documentId === "string") {
    const doc = await db.employeeDocument.findUnique({ where: { id: data.documentId } });
    return doc ? (
      <p className="text-sm"><a href={fileUrl(doc.path)} target="_blank" rel="noreferrer" className="font-medium text-navy-900 underline">Open {doc.title}</a> <span className="text-muted">({doc.type})</span></p>
    ) : <p className="text-sm text-muted">The document was removed.</p>;
  }
  return null;
}
