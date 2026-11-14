import Link from "@/components/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowDown, ArrowDownLeft, ArrowRight, ArrowUpRight, Clock, FileText, History, Paperclip, ShieldCheck, Store, Trash2, Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { financeLimit, pkr } from "@/lib/finance";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { ProofInputs } from "../../proof-inputs";
import { addProof, decideEntry, deleteProof, makeBill, verifyEntry } from "../../actions";

export const metadata = { title: "Entry · Finance" };
const isImage = (p: string) => /\.(jpe?g|png|webp|gif|heic)$/i.test(p);

/** One transaction with its full trail: where the money came from, where it went, and the bills / receipts. */
export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await db.finEntry.findUnique({ where: { id }, include: { account: true, toAccount: true, category: { include: { parent: true } }, proofs: { orderBy: { createdAt: "asc" } } } });
  if (!e) notFound();
  const mod = e.personal ? "finance.personal" : "finance";
  const user = await requirePermission(mod);
  const limit = financeLimit(user);
  if (limit && !(await db.finEntry.findFirst({ where: { AND: [{ id: e.id }, limit] }, select: { id: true } }))) notFound();

  const ids = [e.createdById, e.verifiedById, e.approvedById, ...e.proofs.map((p) => p.createdById)].filter((x): x is string => !!x);
  const [people, cameFrom, wentOn, history] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    // Money that reached the payer before this entry: money in, or transfers to them.
    db.finEntry.findMany({ where: { status: { not: "rejected" }, date: { lte: e.date }, id: { not: e.id }, OR: [{ kind: "in", accountId: e.accountId }, { kind: "transfer", toAccountId: e.accountId }] }, include: { account: true }, orderBy: { date: "desc" }, take: 5 }),
    // For a transfer: what the receiver spent afterwards.
    e.kind === "transfer" && e.toAccountId ? db.finEntry.findMany({ where: { accountId: e.toAccountId, kind: { in: ["expense", "transfer"] }, date: { gte: e.date } }, include: { toAccount: true, category: true, _count: { select: { proofs: true } } }, orderBy: { date: "asc" }, take: 10 }) : [],
    db.auditLog.findMany({ where: { entity: "finEntry", entityId: e.id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const who = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? "—";
  const proofs = [...(e.receipt ? [{ id: "", path: e.receipt, name: "Receipt", createdById: e.createdById, createdAt: e.createdAt }] : []), ...e.proofs];
  const canProof = can(user, mod, "create"), canDel = can(user, mod, "delete"), canVerify = can(user, "finance", "approve");
  const cat = e.category ? (e.category.parent ? `${e.category.parent.name} › ${e.category.name}` : e.category.name) : null;
  const tone = e.kind === "in" ? "text-emerald-700" : e.kind === "transfer" ? "text-sky-700" : "text-ink";
  const KindIcon = e.kind === "in" ? ArrowDownLeft : e.kind === "transfer" ? ArrowRight : ArrowUpRight;
  const back = e.personal ? "/finance/personal" : "/finance/entries";

  return (
    <>
      <PageHeader eyebrow={format(e.date, "EEEE d MMMM yyyy")} title={e.description}
        actions={<div className="flex gap-2">{e.kind === "expense" && !e.recurringId && <form action={makeBill}><input type="hidden" name="id" value={e.id} /><button className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-canvas" title="Comes every month, like K-Electric or rent">Make it a monthly bill</button></form>}<Link href={`${back}?copy=${e.id}`} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-canvas">Duplicate</Link><Link href={`${back}?edit=${e.id}`} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-canvas">Edit</Link></div>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          {/* Amount + status */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted"><KindIcon className="size-3.5" /> {e.kind === "in" ? "Money in" : e.kind === "transfer" ? "Transfer between holders" : e.personal ? "Sir personal expense" : "Company expense"}</p>
                <p className={cn("mt-1 text-4xl font-semibold tabular-nums", tone)}>{pkr(e.amount)}</p>
                {cat && <p className="mt-1 text-sm text-muted">{cat}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 text-xs">
                {e.status === "pending" && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">Waiting for approval</span>}
                {e.status === "rejected" && <span className="rounded-full bg-red-100 px-2.5 py-1 font-medium text-red-700">Rejected{e.rejectReason ? `: ${e.rejectReason}` : ""}</span>}
                {proofs.length === 0 ? <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">No proof attached</span>
                  : e.verifiedAt ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700"><ShieldCheck className="size-3.5" /> Proof checked by {who(e.verifiedById)}, {format(e.verifiedAt, "d MMM")}</span>
                  : <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">{proofs.length} proof file{proofs.length === 1 ? "" : "s"}, not checked yet</span>}
              </div>
            </div>
            {canVerify && e.status === "pending" && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                <form action={decideEntry}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="op" value="approve" /><button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">Approve expense</button></form>
                <form action={decideEntry} className="flex gap-1"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="op" value="reject" /><input name="reason" placeholder="Reason" className="input w-40 py-1.5 text-sm" /><button className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50">Reject</button></form>
              </div>
            )}
            {canVerify && proofs.length > 0 && (
              <form action={verifyEntry} className="mt-4 border-t border-line pt-4">
                <input type="hidden" name="id" value={e.id} />
                {e.verifiedAt ? <><input type="hidden" name="undo" value="1" /><button className="text-sm text-muted hover:text-ink hover:underline">Undo “checked”</button></>
                  : <button className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"><ShieldCheck className="size-4" /> I checked the proof: it matches</button>}
              </form>
            )}
          </Card>

          {/* Money trail */}
          <Card className="p-5">
            <h2 className="mb-4 font-semibold">Where the money went</h2>
            <ol className="space-y-2">
              {cameFrom.length > 0 && (
                <li className="rounded-lg bg-canvas/60 p-3">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Money {e.account.name} received before this</p>
                  <ul className="space-y-1 text-sm">{cameFrom.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3"><Link href={`/finance/entries/${c.id}`} className="truncate hover:underline">{format(c.date, "d MMM")} · {c.kind === "transfer" ? `from ${c.account.name}` : c.party ? `from ${c.party}` : c.description}</Link><span className="shrink-0 tabular-nums text-emerald-700">+{pkr(c.amount)}</span></li>
                  ))}</ul>
                </li>
              )}
              {cameFrom.length > 0 && <li className="flex justify-center text-muted"><ArrowDown className="size-4" /></li>}
              <li className="flex items-center gap-3 rounded-lg border border-line p-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-navy-900 text-white"><Wallet className="size-4" /></span>
                <span className="flex-1"><span className="block text-xs text-muted">{e.kind === "in" ? "Received by" : "Paid by"}</span><Link href={`/finance/entries?holder=${e.accountId}`} className="font-medium hover:underline">{e.account.name}</Link>{e.account.branch && <span className="text-xs text-muted"> · {e.account.branch}</span>}</span>
                {e.kind === "in" && e.party && <span className="text-sm text-muted">from <b className="text-ink">{e.party}</b></span>}
              </li>
              {e.kind !== "in" && <li className="flex justify-center text-muted"><ArrowDown className="size-4" /></li>}
              {e.kind !== "in" && (
                <li className="flex items-center gap-3 rounded-lg border border-line p-3">
                  <span className={cn("flex size-9 items-center justify-center rounded-lg text-white", e.kind === "transfer" ? "bg-sky-600" : "bg-red-500")}>{e.kind === "transfer" ? <Wallet className="size-4" /> : <Store className="size-4" />}</span>
                  <span className="flex-1"><span className="block text-xs text-muted">{e.kind === "transfer" ? "Given to (money holder)" : "Paid to"}</span>
                    {e.kind === "transfer" ? <Link href={`/finance/entries?holder=${e.toAccountId}`} className="font-medium hover:underline">{e.toAccount?.name ?? "—"}</Link> : <span className="font-medium">{e.party || "Not written"}</span>}
                  </span>
                  <span className={cn("font-semibold tabular-nums", tone)}>{pkr(e.amount)}</span>
                </li>
              )}
              {e.kind === "transfer" && (
                <li className="rounded-lg bg-canvas/60 p-3">
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">What {e.toAccount?.name} spent after receiving it</p>
                  {wentOn.length === 0 ? <p className="text-sm text-muted">Nothing entered yet. The money is still with {e.toAccount?.name} until they add what they spent, with the bills.</p> : (
                    <ul className="space-y-1 text-sm">{wentOn.map((w) => (
                      <li key={w.id} className="flex justify-between gap-3"><Link href={`/finance/entries/${w.id}`} className="truncate hover:underline">{format(w.date, "d MMM")} · {w.description}{w.kind === "transfer" ? ` → ${w.toAccount?.name}` : ""}</Link><span className="flex shrink-0 items-center gap-2 tabular-nums">{w._count.proofs === 0 && <span className="text-[10px] text-red-600">no proof</span>}{pkr(w.amount)}</span></li>
                    ))}</ul>
                  )}
                </li>
              )}
            </ol>
          </Card>

          <Card className="p-5 text-sm">
            <h2 className="mb-3 font-semibold">Details</h2>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
              <dt className="text-muted">Date</dt><dd>{format(e.date, "d MMMM yyyy")}</dd>
              {cat && <><dt className="text-muted">Category</dt><dd>{cat}</dd></>}
              {e.notes && <><dt className="text-muted">Notes</dt><dd className="whitespace-pre-wrap">{e.notes}</dd></>}
              <dt className="text-muted">Entered by</dt><dd>{e.importKey ? "Imported from the Excel sheet" : who(e.createdById)} · {format(e.createdAt, "d MMM yyyy, h:mm a")}</dd>
              {e.approvedAt && <><dt className="text-muted">Approved by</dt><dd>{who(e.approvedById)} · {format(e.approvedAt, "d MMM yyyy")}</dd></>}
            </dl>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Paperclip className="size-4" /> Proof <span className="text-sm font-normal text-muted">{proofs.length}</span></h2>
            {proofs.length === 0 && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">No bill, receipt or screenshot yet. Add it below so the boss can see where this money went.</p>}
            <div className="grid grid-cols-2 gap-3">
              {proofs.map((p) => (
                <div key={p.id || p.path} className="group relative overflow-hidden rounded-lg border border-line">
                  <a href={fileUrl(p.path)} target="_blank" rel="noreferrer" className="block">
                    {isImage(p.path)
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={fileUrl(p.path)} alt={p.name} className="h-36 w-full bg-canvas object-cover" />
                      : <span className="flex h-36 flex-col items-center justify-center gap-1 bg-canvas text-muted"><FileText className="size-8" /><span className="text-xs">PDF</span></span>}
                    <span className="block truncate px-2 py-1.5 text-xs">{p.name}</span>
                    <span className="block px-2 pb-1.5 text-[10px] text-muted">{who(p.createdById ?? null)} · {format(p.createdAt, "d MMM")}</span>
                  </a>
                  {canDel && p.id && <form action={deleteProof} className="absolute right-1 top-1"><input type="hidden" name="id" value={p.id} /><ConfirmButton message={`Remove ${p.name}?`} title="Remove" className="rounded bg-white/90 p-1 text-muted opacity-0 shadow group-hover:opacity-100 hover:text-red-600"><Trash2 className="size-3.5" /></ConfirmButton></form>}
                </div>
              ))}
            </div>
            {canProof && (
              <ActionForm action={addProof} className="mt-4 space-y-3 border-t border-line pt-4">
                <input type="hidden" name="id" value={e.id} />
                <ProofInputs />
                <SubmitButton>Add proof</SubmitButton>
              </ActionForm>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><History className="size-4" /> History</h2>
            {history.length === 0 ? <p className="text-sm text-muted">{e.importKey ? "Imported from the Excel sheet; no changes since." : "No changes since it was added."}</p> : (
              <ul className="space-y-2.5 text-sm">{history.map((h) => (
                <li key={h.id} className="flex gap-2"><Clock className="mt-0.5 size-3.5 shrink-0 text-muted" /><span><span className="block">{h.summary}</span><span className="text-xs text-muted">{h.user?.name ?? "System"} · {format(h.createdAt, "d MMM yyyy, h:mm a")}</span></span></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
