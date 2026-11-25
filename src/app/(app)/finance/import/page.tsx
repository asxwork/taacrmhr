import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { SHEET_TYPES } from "@/lib/finance-import";
import { ImportForm } from "./import-form";

export const metadata = { title: "Import Excel · Finance" };

export default async function FinanceImport() {
  await requirePermission("finance", "import");
  const imported = await db.finEntry.count({ where: { importKey: { not: null } } });
  // Where the expenses in AMS end (Samad's marketing sheet is kept up to date separately, so it isn't counted).
  const samad = await db.finAccount.findFirst({ where: { name: { contains: "Samad" } }, select: { id: true } });
  const last = await db.finEntry.findFirst({ where: { importKey: { not: null }, ...(samad ? { accountId: { not: samad.id } } : {}) }, orderBy: { date: "desc" }, select: { date: true } });
  const lastDay = last ? last.date.toISOString().slice(0, 10) : null;
  const defaultFrom = last ? new Date(+last.date + 86_400_000).toISOString().slice(0, 10) : "";
  return (
    <>
      <PageHeader title="Import Excel" description="Bring in your expense sheet: tick the sheets, choose the day to start from, Preview what will be added, then Import. Rows already imported are skipped." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <ImportForm sheets={SHEET_TYPES.map(([key, label]) => ({ key, label, on: key !== "samad" }))} defaultFrom={defaultFrom} lastDay={lastDay} canReplace={imported > 0} />
          {imported > 0 && <p className="mt-3 text-xs text-muted">{imported.toLocaleString()} entries came from earlier imports.</p>}
        </Card>
        <Card className="p-5 text-sm">
          <h2 className="mb-2 font-medium">How your sheet is read</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-muted">
            <li><b className="text-ink">BUSHRA ENTRIES</b>: spending from Bushra&apos;s petty cash. The “Received” column becomes Money in.</li>
            <li><b className="text-ink">SAMAD ENTRIES</b>: marketing spending by Samad.</li>
            <li><b className="text-ink">OTHER ENTRIES</b>: paid by someone else (“Paid by” e.g. Mubeen sir, Muhammad). Each becomes a money holder.</li>
            <li><b className="text-ink">Sir Personal Expense</b>: goes to Sir personal, never counted as company spending.</li>
            <li>Petty cash sent to <b className="text-ink">Affan, Riaz, Faizan</b> becomes a transfer to their Bahadurabad branch cash. It counts as spending once they enter what they spent, with the bill.</li>
            <li><b className="text-ink">Internal Transfer</b> rows become transfers between holders, so the money is counted once, when it is actually spent.</li>
            <li>Category spellings are tidied (Conveyence → Conveyance, Miscellenious → Miscellaneous, …).</li>
            <li>The Summary sheet is skipped: the dashboard works it out from the entries.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
