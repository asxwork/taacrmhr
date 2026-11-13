import Link from "@/components/link";
import { format, parse } from "date-fns";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Download, Paperclip, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { ProofInputs } from "./proof-inputs";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth";
import { categoryTree, ensureFinanceDefaults, entryWhere, financeConfig, pkr } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { AutoFilterForm } from "@/components/auto-filter-form";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteEntry, saveEntry } from "./actions";

export type EntrySP = { month?: string; holder?: string; cat?: string; kind?: string; q?: string; proof?: string; status?: string; new?: string; edit?: string; page?: string };
const PAGE = 100;

/** The entries list (all, or Sir personal) with filters, totals and the add/edit panel. */
export async function EntriesView({ user, sp, personal, base }: { user: SessionUser; sp: EntrySP; personal: boolean; base: string }) {
  await ensureFinanceDefaults();
  const tree = await categoryTree();
  const where = entryWhere(sp, personal, tree);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? parse(sp.month, "yyyy-MM", new Date()) : null;
  const q = sp.q?.trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const [entries, count, sums, holders] = await Promise.all([
    db.finEntry.findMany({ where, include: { account: true, toAccount: true, category: { include: { parent: true } }, _count: { select: { proofs: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE, take: PAGE }),
    db.finEntry.count({ where }),
    db.finEntry.groupBy({ by: ["kind"], where, _sum: { amount: true } }),
    db.finAccount.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const total = (k: string) => sums.find((s) => s.kind === k)?._sum.amount ?? 0;
  const keep = { month: sp.month, holder: sp.holder, cat: sp.cat, kind: sp.kind, q: sp.q, proof: sp.proof, status: sp.status };
  const href = (patch: Partial<EntrySP>) => {
    const p = new URLSearchParams(Object.entries({ ...keep, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `${base}${p.size ? `?${p}` : ""}`;
  };
  const mod = personal ? "finance.personal" : "finance";
  const canAdd = can(user, mod, "create"), canEdit = can(user, mod, "edit"), canDel = can(user, mod, "delete");
  const editing = sp.edit ? await db.finEntry.findUnique({ where: { id: sp.edit } }) : null;
  const newKind = sp.new === "in" || sp.new === "transfer" ? sp.new : sp.new ? "expense" : null;
  const formKind = editing?.kind ?? newKind;
  const cfg = await financeConfig();
  const proofRequired = cfg.proofAbove > 0 ? `Required for ${pkr(cfg.proofAbove)} and above` : "Bill, receipt or transfer screenshot. Your boss sees it on the entry.";
  const catName = (c: { name: string; parent: { name: string } | null } | null) => (c ? (c.parent ? `${c.parent.name} › ${c.name}` : c.name) : "");
  const exportHref = `/api/finance/export?${new URLSearchParams(Object.entries({ ...keep, personal: personal ? "1" : "" }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader title={personal ? "Sir personal" : "Entries"} description={personal ? "Mubeen sir's own spending, kept out of company totals." : "Every expense, money received and transfer between money holders."}
        actions={<div className="flex flex-wrap gap-2">
          {can(user, mod, "export") && <a href={exportHref} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-canvas"><Download className="size-4" /> Excel</a>}
          {canAdd && <>
            <Link href={href({ new: "expense" })} scroll={false} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-2 text-sm font-medium text-white hover:bg-navy-800"><Plus className="size-4" /> Expense</Link>
            {<Link href={href({ new: "in" })} scroll={false} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-canvas"><ArrowDownLeft className="size-4 text-emerald-600" /> Money in</Link>}
            {!personal && <Link href={href({ new: "transfer" })} scroll={false} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-canvas"><ArrowRight className="size-4 text-sky-600" /> Transfer</Link>}
          </>}
        </div>} />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([["Spent", total("expense"), "text-red-600"], ["Money in", total("in"), "text-emerald-600"], ["Transfers", total("transfer"), "text-sky-700"]] as const).map(([l, v, c]) => (
          <Card key={l} className="p-4"><p className="text-xs text-muted">{l}{month ? ` · ${format(month, "MMMM yyyy")}` : ""}</p><p className={cn("mt-1 text-2xl font-semibold tabular-nums", c)}>{pkr(v)}</p></Card>
        ))}
      </div>

      <AutoFilterForm className="mb-3 flex flex-wrap gap-2">
        <label className="relative min-w-52 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input name="q" defaultValue={q} placeholder="Search what, paid to, notes" aria-label="Search" className="input pl-9" /></label>
        <input name="month" type="month" defaultValue={sp.month} aria-label="Month" className="input w-auto" />
        <select name="holder" defaultValue={sp.holder ?? ""} aria-label="Money holder" className="input w-auto min-w-40"><option value="">Everyone</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
        {!personal && <select name="cat" defaultValue={sp.cat ?? ""} aria-label="Category" className="input w-auto min-w-44"><option value="">All categories</option>{tree.filter((c) => !c.personal).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        {!personal && <select name="kind" defaultValue={sp.kind ?? ""} aria-label="Type" className="input w-auto"><option value="">All types</option><option value="expense">Expenses</option><option value="in">Money in</option><option value="transfer">Transfers</option></select>}
        <select name="proof" defaultValue={sp.proof ?? ""} aria-label="Proof" className="input w-auto"><option value="">Any proof</option><option value="missing">No proof yet</option><option value="unverified">Proof not checked</option><option value="verified">Checked ✓</option></select>
      </AutoFilterForm>

      <Card className="overflow-hidden">
        {entries.length === 0 ? <EmptyState title="No entries" description={canAdd ? "Add an expense, money in or a transfer above, or import your Excel sheet." : undefined} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">What</th><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">By</th><th className="px-4 py-2.5">To / from</th><th className="px-4 py-2.5 text-right">Amount</th><th className="px-3 py-2.5">Proof</th><th className="w-20" /></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => (
                  <tr key={e.id} className="group hover:bg-canvas/50">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{format(e.date, "d MMM yyyy")}</td>
                    <td className="max-w-80 px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        {e.kind === "in" ? <ArrowDownLeft className="size-3.5 shrink-0 text-emerald-600" /> : e.kind === "transfer" ? <ArrowRight className="size-3.5 shrink-0 text-sky-600" /> : <ArrowUpRight className="size-3.5 shrink-0 text-red-500" />}
                        <Link href={`/finance/entries/${e.id}`} className="truncate hover:underline" title={e.description}>{e.description}</Link>
                      </span>
                      {e.notes && <span className="block truncate text-xs text-muted" title={e.notes}>{e.notes}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{e.kind === "expense" ? catName(e.category) : e.kind === "in" ? "Money in" : "Transfer"}</td>
                    <td className="px-4 py-2.5">{e.account.name}</td>
                    <td className="px-4 py-2.5 text-muted">{e.kind === "transfer" ? <span className="text-sky-700">→ {e.toAccount?.name ?? "—"}</span> : e.party ?? "—"}</td>
                    <td className={cn("whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums", e.kind === "in" ? "text-emerald-700" : e.kind === "transfer" ? "text-sky-700" : "")}>{e.kind === "in" ? "+" : ""}{pkr(e.amount)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {(() => { const n = e._count.proofs + (e.receipt ? 1 : 0); return n === 0
                        ? <Link href={`/finance/entries/${e.id}`} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100">No proof</Link>
                        : <Link href={`/finance/entries/${e.id}`} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", e.verifiedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800")}>{e.verifiedAt ? <ShieldCheck className="size-3" /> : <Paperclip className="size-3" />}{n}{e.verifiedAt ? " checked" : ""}</Link>; })()}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <span className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100">
                        {canEdit && <Link href={href({ edit: e.id })} scroll={false} className="rounded px-2 py-1 text-xs font-medium text-navy-900 hover:bg-canvas">Edit</Link>}
                        {canDel && <form action={deleteEntry}><input type="hidden" name="id" value={e.id} /><ConfirmButton message={`Delete “${e.description}” (${pkr(e.amount)})?`} title="Delete" className="rounded p-1 text-muted hover:text-red-600"><Trash2 className="size-3.5" /></ConfirmButton></form>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {count > PAGE && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-muted">{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, count)} of {count}</span>
            <span className="flex gap-3">{page > 1 && <Link href={href({ page: String(page - 1) })} className="font-medium text-navy-900 hover:underline">← Newer</Link>}{page * PAGE < count && <Link href={href({ page: String(page + 1) })} className="font-medium text-navy-900 hover:underline">Older →</Link>}</span>
          </div>
        )}
      </Card>

      {formKind && (canAdd || canEdit) && (
        <Drawer title={editing ? "Edit entry" : formKind === "in" ? "Money in" : formKind === "transfer" ? "Transfer between holders" : personal ? "Sir personal expense" : "New expense"} closeHref={href({})} width="max-w-md">
          {formKind === "transfer" && <p className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">Money moving inside the company, e.g. Bushra gives Samad Rs 6,000. It changes both balances but isn&apos;t spending: Samad then adds the actual expense.</p>}
          <ActionForm action={saveEntry} className="space-y-4">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input type="hidden" name="kind" value={formKind} />
            <input type="hidden" name="back" value={href({})} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input name="date" type="date" required defaultValue={format(editing?.date ?? new Date(), "yyyy-MM-dd")} className="input" /></Field>
              <Field label="Amount (Rs)"><input name="amount" inputMode="decimal" required defaultValue={editing?.amount ?? ""} className="input" autoFocus /></Field>
            </div>
            <Field label={formKind === "in" ? "Received by" : formKind === "transfer" ? "From" : "Paid by"}>
              <select name="accountId" required defaultValue={editing?.accountId ?? sp.holder ?? ""} className="input"><option value="">Choose…</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
            </Field>
            {formKind === "transfer" && (
              <Field label="To"><select name="toAccountId" required defaultValue={editing?.toAccountId ?? ""} className="input"><option value="">Choose…</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
            )}
            {formKind === "expense" && (
              <Field label="Category">
                <select name="categoryId" required defaultValue={editing?.categoryId ?? ""} className="input">
                  <option value="">Choose…</option>
                  {tree.filter((c) => c.personal === personal || (!personal && !c.personal)).map((c) => (
                    <optgroup key={c.id} label={c.name}>
                      <option value={c.id}>{c.name} (general)</option>
                      {c.subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </Field>
            )}
            <Field label={formKind === "in" ? "What for" : "Description"}><input name="description" required defaultValue={editing?.description} className="input" placeholder={formKind === "in" ? "e.g. Petty cash top-up" : "e.g. Lunch for guest"} /></Field>
            {formKind !== "transfer" && <Field label={formKind === "in" ? "Received from" : "Paid to"}><input name="party" defaultValue={editing?.party ?? ""} className="input" placeholder={formKind === "in" ? "e.g. Mubeen sir" : "e.g. Karachi Haleem"} /></Field>}
            <Field label="Notes (optional)"><input name="notes" defaultValue={editing?.notes ?? ""} className="input" /></Field>
            <ProofInputs required={proofRequired} />
            {personal && <input type="hidden" name="personal" value="on" />}
            <SubmitButton>{editing ? "Save" : "Add"}</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
