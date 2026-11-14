import Link from "next/link";
import { notFound } from "next/navigation";
import { endOfMonth, format, parse, startOfMonth, startOfYear, subMonths } from "date-fns";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { balances, categoryTree, companyExpense, pkr } from "@/lib/finance";
import { fileUrl } from "@/lib/files";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Monthly finance report" };
const isImage = (p: string) => /\.(jpe?g|png|webp|gif)$/i.test(p);

/** Printable monthly report (Print / Save as PDF): summary, categories, offices, holders, Sir personal, bill images. */
export default async function FinanceReport({ params }: { params: Promise<{ month: string }> }) {
  const user = await requirePermission("finance");
  const { month: m } = await params;
  if (!/^\d{4}-\d{2}$/.test(m)) notFound();
  const month = parse(m, "yyyy-MM", new Date());
  const mFrom = startOfMonth(month), mTo = endOfMonth(month), yFrom = startOfYear(month), pFrom = startOfMonth(subMonths(month, 1)), pTo = endOfMonth(subMonths(month, 1));
  const seePersonal = can(user, "finance.personal");
  const [tree, byCat, byCatYear, prevTotal, entries, personal, holders, company] = await Promise.all([
    categoryTree(),
    db.finEntry.groupBy({ by: ["categoryId"], where: companyExpense({ date: { gte: mFrom, lte: mTo } }), _sum: { amount: true } }),
    db.finEntry.groupBy({ by: ["categoryId"], where: companyExpense({ date: { gte: yFrom, lte: mTo } }), _sum: { amount: true } }),
    db.finEntry.aggregate({ where: companyExpense({ date: { gte: pFrom, lte: pTo } }), _sum: { amount: true } }),
    db.finEntry.findMany({ where: companyExpense({ date: { gte: mFrom, lte: mTo } }), include: { account: true, proofs: { take: 1 } }, orderBy: { amount: "desc" } }),
    seePersonal ? db.finEntry.findMany({ where: { status: "approved", kind: "expense", personal: true, date: { gte: mFrom, lte: mTo } }, orderBy: { date: "asc" } }) : [],
    balances(mTo),
    db.setting.findUnique({ where: { key: "company.name" } }),
  ]);
  const sum = (rows: typeof byCat, ids: string[]) => rows.filter((r) => r.categoryId && ids.includes(r.categoryId)).reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const withProof = entries.filter((e) => e.receipt || e.proofs.length);
  const proofPct = total ? Math.round((withProof.reduce((s, e) => s + e.amount, 0) / total) * 100) : 100;
  const byOffice = new Map<string, number>();
  for (const e of entries) byOffice.set(e.account.branch || "Head office (DHA)", (byOffice.get(e.account.branch || "Head office (DHA)") ?? 0) + e.amount);
  const images = withProof.map((e) => ({ e, path: e.proofs[0]?.path ?? e.receipt! })).filter((x) => isImage(x.path)).slice(0, 60);
  const prev = prevTotal._sum.amount ?? 0;
  const th = "border-b border-gray-300 px-2 py-1.5 text-left text-[11px] uppercase text-gray-500";
  const td = "border-b border-gray-100 px-2 py-1.5";

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] text-gray-900 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden"><Link href="/finance" className="text-sm text-gray-500 hover:underline">← Finance</Link><PrintButton /></div>
      <header className="mb-6 border-b-2 border-gray-900 pb-3">
        <p className="text-xs uppercase tracking-widest text-gray-500">{company?.value || "The Advisor Associates"}</p>
        <h1 className="text-2xl font-semibold">Finance report · {format(month, "MMMM yyyy")}</h1>
        <p className="text-xs text-gray-500">Prepared {format(new Date(), "d MMM yyyy, h:mm a")} by {user.name}</p>
      </header>
      <section className="mb-6 grid grid-cols-4 gap-3">
        {[["Company spent", pkr(total)], [`vs ${format(pFrom, "MMMM")}`, prev ? `${total >= prev ? "+" : "−"}${Math.abs(Math.round(((total - prev) / prev) * 100))}%` : "—"], ["Entries", String(entries.length)], ["With a bill", `${proofPct}%`]].map(([l, v]) => (
          <div key={l} className="rounded border border-gray-300 p-3"><p className="text-[11px] text-gray-500">{l}</p><p className="text-lg font-semibold">{v}</p></div>
        ))}
      </section>
      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Spending by category</h2>
        <table className="w-full"><thead><tr><th className={th}>Category</th><th className={`${th} text-right`}>{format(month, "MMM")}</th><th className={`${th} text-right`}>Year to date</th></tr></thead>
          <tbody>{tree.filter((c) => !c.personal).flatMap((c) => {
            const ids = [c.id, ...c.subs.map((s) => s.id)]; const mm = sum(byCat, ids), yy = sum(byCatYear, ids);
            if (!mm && !yy) return [];
            return [<tr key={c.id} className="font-semibold"><td className={td}>{c.name}</td><td className={`${td} text-right`}>{pkr(mm)}</td><td className={`${td} text-right`}>{pkr(yy)}</td></tr>,
              ...c.subs.filter((s) => sum(byCat, [s.id]) || sum(byCatYear, [s.id])).map((s) => <tr key={s.id} className="text-gray-600"><td className={`${td} pl-6`}>{s.name}</td><td className={`${td} text-right`}>{pkr(sum(byCat, [s.id]))}</td><td className={`${td} text-right`}>{pkr(sum(byCatYear, [s.id]))}</td></tr>)];
          })}<tr className="font-semibold"><td className="px-2 py-2">Total</td><td className="px-2 py-2 text-right">{pkr(total)}</td><td className="px-2 py-2 text-right">{pkr(byCatYear.reduce((s, r) => s + (r._sum.amount ?? 0), 0))}</td></tr></tbody></table>
      </section>
      <section className="mb-6 grid grid-cols-2 gap-6">
        <div><h2 className="mb-2 font-semibold">By office</h2><table className="w-full"><tbody>{[...byOffice].map(([o, v]) => <tr key={o}><td className={td}>{o}</td><td className={`${td} text-right`}>{pkr(v)}</td></tr>)}</tbody></table></div>
        <div><h2 className="mb-2 font-semibold">Balances on {format(mTo, "d MMM")}</h2><table className="w-full"><tbody>{holders.filter((h) => h.active).map((h) => <tr key={h.id}><td className={td}>{h.name}</td><td className={`${td} text-right`}>{h.kind === "owner" && h.balance < 0 ? `${pkr(-h.balance)} put in` : pkr(h.balance)}</td></tr>)}</tbody></table></div>
      </section>
      <section className="mb-6">
        <h2 className="mb-2 font-semibold">Biggest expenses</h2>
        <table className="w-full"><thead><tr><th className={th}>Date</th><th className={th}>What</th><th className={th}>Paid by</th><th className={`${th} text-right`}>Amount</th><th className={th}>Bill</th></tr></thead>
          <tbody>{entries.slice(0, 25).map((e) => <tr key={e.id}><td className={td}>{format(e.date, "d MMM")}</td><td className={td}>{e.description}</td><td className={td}>{e.account.name}</td><td className={`${td} text-right`}>{pkr(e.amount)}</td><td className={td}>{e.receipt || e.proofs.length ? "✓" : "—"}</td></tr>)}</tbody></table>
      </section>
      {seePersonal && personal.length > 0 && (
        <section className="mb-6 break-before-page">
          <h2 className="mb-2 font-semibold">Sir personal · {pkr(personal.reduce((s, e) => s + e.amount, 0))} (not in company totals)</h2>
          <table className="w-full"><tbody>{personal.map((e) => <tr key={e.id}><td className={td}>{format(e.date, "d MMM")}</td><td className={td}>{e.description}</td><td className={`${td} text-right`}>{pkr(e.amount)}</td></tr>)}</tbody></table>
        </section>
      )}
      {images.length > 0 && (
        <section className="break-before-page">
          <h2 className="mb-3 font-semibold">Bills ({images.length})</h2>
          <div className="grid grid-cols-3 gap-3">{images.map(({ e, path }) => (
            <figure key={e.id} className="break-inside-avoid rounded border border-gray-200 p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(path)} alt="" className="h-40 w-full object-contain" />
              <figcaption className="mt-1 text-[10px] leading-tight text-gray-600">{format(e.date, "d MMM")} · {pkr(e.amount)} · {e.description.slice(0, 60)}</figcaption>
            </figure>
          ))}</div>
        </section>
      )}
    </div>
  );
}
