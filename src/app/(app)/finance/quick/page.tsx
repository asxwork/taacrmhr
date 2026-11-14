import Link from "@/components/link";
import { format } from "date-fns";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { categoryTree, holderLimit, pkr } from "@/lib/finance";
import { ActionForm } from "@/components/action-form";
import { saveEntry } from "../actions";
import { QuickForm } from "./quick-form";

export const metadata = { title: "Add expense" };

/** Phone-first: photo of the bill, amount, tap a category, save. About 10 seconds. */
export default async function Quick({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const user = await requirePermission("finance", "create");
  const sp = await searchParams;
  const [tree, holders, usage, last, payees] = await Promise.all([
    categoryTree(),
    db.finAccount.findMany({ where: { active: true, kind: { not: "owner" }, ...holderLimit(user) }, orderBy: { name: "asc" } }),
    db.finEntry.groupBy({ by: ["categoryId"], where: { kind: "expense", personal: false, categoryId: { not: null } }, _count: true, orderBy: { _count: { categoryId: "desc" } }, take: 10 }),
    db.finEntry.findFirst({ where: { createdById: user.id }, orderBy: { createdAt: "desc" }, include: { account: true } }),
    db.finEntry.groupBy({ by: ["party"], where: { party: { not: null } }, _count: true, orderBy: { _count: { party: "desc" } }, take: 200 }),
  ]);
  const all = tree.filter((c) => !c.personal).flatMap((c) => [{ id: c.id, name: c.name, group: c.name }, ...c.subs.map((s) => ({ id: s.id, name: s.name, group: c.name }))]);
  const top = usage.map((u) => all.find((c) => c.id === u.categoryId)).filter((c): c is (typeof all)[number] => !!c).slice(0, 8);
  const recent = sp.done ? await db.finEntry.findFirst({ where: { createdById: user.id }, orderBy: { createdAt: "desc" } }) : null;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-semibold">Add expense</h1>
      <p className="mb-5 text-sm text-muted">{format(new Date(), "EEEE d MMMM")} · photo, amount, category, save.</p>
      {recent && <Link href={`/finance/entries/${recent.id}`} className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="size-5" /> Saved {pkr(recent.amount)} · {recent.description}</Link>}
      <ActionForm action={saveEntry} className="space-y-5">
        <input type="hidden" name="kind" value="expense" />
        <input type="hidden" name="quick" value="1" />
        <input type="hidden" name="date" value={format(new Date(), "yyyy-MM-dd")} />
        <input type="hidden" name="back" value="/finance/quick?done=1" />
        <QuickForm top={top} all={all} holders={holders.map((h) => ({ id: h.id, name: h.name }))} defaultHolder={last?.accountId ?? holders[0]?.id ?? ""} payees={payees.map((p) => p.party!)} />
      </ActionForm>
      <p className="mt-6 text-center text-xs text-muted">Tip: add AMS to your phone&apos;s home screen and hold the icon for “Add expense”.</p>
    </div>
  );
}
