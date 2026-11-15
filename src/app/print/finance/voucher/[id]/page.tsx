import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { financeLimit, pkr, voucherNo } from "@/lib/finance";
import { rupeesInWords } from "@/lib/words";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Payment voucher" };

/** Printable payment voucher for one expense: who was paid, how much (in words), from which holder, and who prepared / approved / checked it. */
export default async function Voucher({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ auto?: string }> }) {
  const user = await requirePermission("finance");
  const { id } = await params;
  const lim = financeLimit(user);
  const e = await db.finEntry.findFirst({ where: { AND: [{ id }, ...(lim ? [lim] : [])] }, include: { account: true, toAccount: true, category: { include: { parent: true } }, proofs: true } });
  if (!e) notFound();
  const people = await db.user.findMany({ where: { id: { in: [e.createdById, e.approvedById, e.verifiedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const who = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? "";
  const company = (await db.setting.findUnique({ where: { key: "company.name" } }))?.value || "The Advisor Associates";
  const cat = e.category ? (e.category.parent ? `${e.category.parent.name} › ${e.category.name}` : e.category.name) : "—";
  const title = e.kind === "in" ? "Receipt voucher" : e.kind === "transfer" ? "Transfer voucher" : "Payment voucher";
  const row = "grid grid-cols-[9rem_1fr] gap-3 border-b border-gray-200 py-2";
  const sign = (label: string, name: string, at?: Date | null) => (
    <div className="text-center">
      <div className="h-12 border-b border-gray-400" />
      <p className="mt-1 text-xs font-medium">{label}</p>
      <p className="text-xs text-gray-600">{name || " "}{at ? ` · ${format(at, "d MMM yyyy")}` : ""}</p>
    </div>
  );
  return (
    <div data-print-area className="mx-auto max-w-[210mm] bg-white p-4 text-[13px] text-gray-900 sm:p-10 print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden"><Link href="/finance/entries" className="text-sm text-gray-500 hover:underline">← Entries</Link><PrintButton target="[data-print-area]" fileName={voucherNo(e)} auto={(await searchParams).auto as "print" | "pdf" | undefined} /></div>
      <header className="flex items-start justify-between border-b-2 border-gray-900 pb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/icon.png" alt="" className="size-12 rounded" />
          <div><p className="text-lg font-semibold">{company}</p><p className="text-xs uppercase tracking-widest text-gray-500">{title}</p></div>
        </div>
        <div className="text-right"><p className="font-mono text-base font-semibold">{voucherNo(e)}</p><p className="text-xs text-gray-500">Date {format(e.date, "d MMMM yyyy")}</p>{e.status !== "approved" && <p className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold uppercase text-amber-800">{e.status}</p>}</div>
      </header>
      <section className="mt-5">
        <div className={row}><span className="text-gray-500">{e.kind === "in" ? "Received from" : "Paid to"}</span><span className="font-medium">{e.party || (e.kind === "transfer" ? e.toAccount?.name : "—")}</span></div>
        <div className={row}><span className="text-gray-500">Amount</span><span className="text-lg font-semibold">{pkr(e.amount)}</span></div>
        <div className={row}><span className="text-gray-500">In words</span><span className="italic">{rupeesInWords(e.amount)}</span></div>
        <div className={row}><span className="text-gray-500">For</span><span>{e.description}</span></div>
        <div className={row}><span className="text-gray-500">Category</span><span>{cat}</span></div>
        <div className={row}><span className="text-gray-500">{e.kind === "in" ? "Received into" : "Paid from"}</span><span>{e.account.name}{e.account.branch ? ` · ${e.account.branch}` : ""}</span></div>
        <div className={row}><span className="text-gray-500">Proof attached</span><span>{e.proofs.length + (e.receipt && !e.proofs.some((p) => p.path === e.receipt) ? 1 : 0) || "None"}</span></div>
        {e.notes && <div className={row}><span className="text-gray-500">Notes</span><span className="whitespace-pre-line">{e.notes}</span></div>}
      </section>
      <section className="mt-14 grid grid-cols-2 gap-8 sm:grid-cols-4">
        {sign("Prepared by", who(e.createdById), e.createdAt)}
        {sign("Approved by", who(e.approvedById), e.approvedAt)}
        {sign("Checked by", who(e.verifiedById), e.verifiedAt)}
        {sign(e.kind === "in" ? "Paid by" : "Received by", "")}
      </section>
      <p className="mt-10 text-center text-[11px] text-gray-400">Printed from AMS on {format(new Date(), "d MMM yyyy, h:mm a")}</p>
    </div>
  );
}
