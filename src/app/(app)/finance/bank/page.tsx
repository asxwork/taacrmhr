import Link from "@/components/link";
import { format, subDays } from "date-fns";
import { Landmark } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { categoryTree, pkr } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { bankLineAction, uploadStatement } from "../actions";

export const metadata = { title: "Bank matching · Finance" };

/** Statement vs AMS: money that moved with no entry, and entries with no bank line. */
export default async function Bank({ searchParams }: { searchParams: Promise<{ a?: string }> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  const holders = await db.finAccount.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  const counts = await db.finBankLine.groupBy({ by: ["accountId"], _count: true });
  const withLines = holders.filter((h) => counts.some((c) => c.accountId === h.id));
  const sel = sp.a ?? withLines[0]?.id ?? "";
  const lines = sel ? await db.finBankLine.findMany({ where: { accountId: sel }, orderBy: { date: "desc" }, take: 400 }) : [];
  const from = lines.length ? lines[lines.length - 1]!.date : subDays(new Date(), 30), to = lines[0]?.date ?? new Date();
  const matchedIds = new Set(lines.map((l) => l.entryId).filter(Boolean) as string[]);
  const [noLine, tree] = await Promise.all([
    sel ? db.finEntry.findMany({ where: { status: "approved", date: { gte: from, lte: to }, OR: [{ accountId: sel }, { toAccountId: sel, kind: "transfer" }], id: { notIn: [...matchedIds] }, sourceType: { not: "bank" } }, orderBy: { date: "desc" }, take: 100 }) : [],
    categoryTree(),
  ]);
  const open = lines.filter((l) => !l.entryId && !l.ignored);
  const matched = lines.filter((l) => l.entryId);
  const canImport = can(user, "finance", "import"), canAdd = can(user, "finance", "create");
  return (
    <>
      <PageHeader title="Bank matching" description="Upload the bank, JazzCash or Easypaisa statement. Each line is matched to an entry; anything that doesn't match shows here." />
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div>
          {withLines.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{withLines.map((h) => <Link key={h.id} href={`/finance/bank?a=${h.id}`} className={cn("rounded-full border px-3 py-1 text-sm", h.id === sel ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-surface")}>{h.name}</Link>)}</div>}
          {sel ? (
            <div className="grid grid-cols-3 gap-3">
              {([["Matched", matched.length, "text-emerald-700"], ["Bank lines with no entry", open.length, open.length ? "text-red-600" : ""], ["Entries with no bank line", noLine.length, noLine.length ? "text-amber-700" : ""]] as const).map(([l, v, t]) => <Card key={l} className="p-4"><p className="text-xs text-muted">{l}</p><p className={cn("text-2xl font-semibold", t)}>{v}</p></Card>)}
            </div>
          ) : <Card className="flex items-center gap-3 p-5 text-sm text-muted"><Landmark className="size-6" /> No statements uploaded yet. Add a Bank account money holder, then upload its statement.</Card>}
        </div>
        {canImport && (
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">Upload statement</h2>
            <ActionForm action={uploadStatement} className="space-y-3">
              <Field label="Account"><select name="accountId" required defaultValue={sel} className="input"><option value="">Choose…</option>{holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
              <Field label="Statement (.xlsx or .csv)" hint="Download from internet banking / the JazzCash or Easypaisa app. Uploading the same file again adds nothing."><input type="file" name="file" required accept=".xlsx,.csv" className="text-sm" /></Field>
              <SubmitButton>Upload and match</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
      {sel && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card className="overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Bank lines with no entry <span className="text-sm font-normal text-muted">{open.length}</span></h2>
            <ul className="divide-y divide-line text-sm">{open.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <span className="w-14 text-xs text-muted">{format(l.date, "d MMM")}</span>
                <span className="min-w-0 flex-1 truncate" title={l.description}>{l.description}</span>
                <span className={cn("tabular-nums", l.direction === "in" ? "text-emerald-700" : "")}>{l.direction === "in" ? "+" : "−"}{pkr(l.amount)}</span>
                {canAdd && <span className="flex w-full items-center justify-end gap-1 sm:w-auto">
                  <form action={bankLineAction} className="flex gap-1"><input type="hidden" name="id" value={l.id} /><input type="hidden" name="op" value="create" />
                    {l.direction === "out" && <select name="categoryId" aria-label="Category" className="input w-36 py-1 text-xs"><option value="">Category…</option>{tree.filter((c) => !c.personal).map((c) => <optgroup key={c.id} label={c.name}><option value={c.id}>{c.name}</option>{c.subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}</select>}
                    <button className="rounded-md bg-navy-900 px-2 py-1 text-xs text-white">Add entry</button></form>
                  <form action={bankLineAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="op" value="ignore" /><button className="rounded-md border border-line px-2 py-1 text-xs text-muted">Ignore</button></form>
                </span>}
              </li>
            ))}{open.length === 0 && <li className="px-4 py-3 text-muted">Every bank line has an entry.</li>}</ul>
          </Card>
          <Card className="overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-semibold">Entries with no bank line <span className="text-sm font-normal text-muted">{noLine.length}</span></h2>
            <p className="px-4 pt-2 text-xs text-muted">Between {format(from, "d MMM")} and {format(to, "d MMM yyyy")}. Maybe paid in cash, or entered on the wrong account / amount.</p>
            <ul className="divide-y divide-line text-sm">{noLine.map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-4 py-2.5"><span className="w-14 text-xs text-muted">{format(e.date, "d MMM")}</span><Link href={`/finance/entries/${e.id}`} className="min-w-0 flex-1 truncate hover:underline">{e.description}</Link><span className="tabular-nums">{pkr(e.amount)}</span></li>
            ))}{noLine.length === 0 && <li className="px-4 py-3 text-muted">None.</li>}</ul>
          </Card>
        </div>
      )}
    </>
  );
}
