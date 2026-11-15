import Link from "@/components/link";
import { redirect } from "next/navigation";
import { format, startOfDay, startOfMonth } from "date-fns";
import { Plus, Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { displayStatus } from "@/lib/invoices";
import { pkr } from "@/lib/finance";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Invoices" };

const TABS = [["all", "All"], ["draft", "Drafts"], ["pending", "Waiting for approval"], ["open", "Unpaid"], ["overdue", "Overdue"], ["paid", "Paid"], ["repeat", "Repeating"]] as const;

/** Invoices: what's owed, what's waiting for approval, what's overdue. */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const user = await requirePermission("invoices");
  const scope = await scopeWhere(user, "invoices");
  if (!scope) redirect("/no-access");
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : "all";
  const today = startOfDay(new Date());
  const tabWhere: Record<string, Prisma.InvoiceWhereInput> = {
    all: {}, draft: { status: { in: ["draft", "rejected"] } }, pending: { status: "pending" }, open: { status: { in: ["approved", "sent"] } },
    overdue: { status: { in: ["approved", "sent"] }, dueDate: { lt: today } }, paid: { status: "paid" }, repeat: { repeat: { not: "none" } },
  };
  const q = sp.q?.trim();
  const where: Prisma.InvoiceWhereInput = { AND: [scope, tabWhere[tab]!, ...(q ? [{ OR: [{ number: { contains: q } }, { clientName: { contains: q } }, { clientPhone: { contains: q } }] }] : [])] };
  const [rows, open, waitingMe, paidMonth] = await Promise.all([
    db.invoice.findMany({ where, orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }], take: 200 }),
    db.invoice.findMany({ where: { AND: [scope, { status: { in: ["approved", "sent"] } }] }, select: { total: true, paidAmount: true, dueDate: true } }),
    db.invoice.count({ where: { status: "pending", approverId: user.id } }),
    db.invoicePayment.aggregate({ where: { date: { gte: startOfMonth(today) }, invoice: scope }, _sum: { amount: true } }),
  ]);
  const owed = open.reduce((s, i) => s + i.total - i.paidAmount, 0);
  const overdue = open.filter((i) => i.dueDate < today).reduce((s, i) => s + i.total - i.paidAmount, 0);
  return (
    <>
      <PageHeader title="Invoices" description="Make invoices, get them approved and signed, send them to clients and track payments."
        actions={can(user, "invoices", "create") && <LinkButton href="/invoices/new"><Plus className="size-4" /> New invoice</LinkButton>} />
      {waitingMe > 0 && <Link href="/invoices?tab=pending" className="mb-4 block rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100"><b>{waitingMe} invoice{waitingMe === 1 ? "" : "s"}</b> waiting for your signature →</Link>}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Clients owe", pkr(owed), ""], ["Overdue", pkr(overdue), overdue ? "text-red-600" : ""], ["Received this month", pkr(paidMonth._sum.amount ?? 0), "text-emerald-700"], ["Unpaid invoices", String(open.length), ""]].map(([l, v, tone]) => (
          <Card key={l} className="p-4"><p className="text-xs text-muted">{l}</p><p className={cn("mt-1 text-lg font-semibold tabular-nums", tone)}>{v}</p></Card>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex max-w-full overflow-x-auto rounded-lg bg-black/5 p-0.5">
          {TABS.map(([t, l]) => <Link key={t} href={`/invoices${t === "all" ? "" : `?tab=${t}`}`} className={cn("shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm", t === tab ? "bg-surface font-medium shadow-xs" : "text-muted")}>{l}</Link>)}
        </div>
        <form className="relative ml-auto w-full sm:w-64"><input type="hidden" name="tab" value={tab} /><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><input name="q" defaultValue={q} placeholder="Search number or client" className="input h-9 pl-9" /></form>
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState title="No invoices here" description={tab === "all" ? "Press New invoice to make your first one." : "Nothing in this list."} /> : (
          <ul className="divide-y divide-line">
            {rows.map((i) => {
              const st = displayStatus(i);
              return (
                <li key={i.id}>
                  <Link href={`/invoices/${i.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-canvas/60">
                    <span className="w-36 font-mono text-sm">{i.number}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{i.clientName}</span><span className="text-xs text-muted">{format(i.issueDate, "d MMM yyyy")} · due {format(i.dueDate, "d MMM")}{i.repeat !== "none" ? ` · repeats ${i.repeat}` : ""}</span></span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="w-32 text-right tabular-nums"><span className="block font-medium">{pkr(i.total)}</span>{i.paidAmount > 0 && i.paidAmount < i.total && <span className="text-xs text-muted">{pkr(i.total - i.paidAmount)} due</span>}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
