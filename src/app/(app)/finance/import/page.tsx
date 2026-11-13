import { FileSpreadsheet } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { importWorkbook } from "../actions";

export const metadata = { title: "Import Excel · Finance" };

export default async function FinanceImport() {
  await requirePermission("finance", "import");
  const imported = await db.finEntry.count({ where: { importKey: { not: null } } });
  return (
    <>
      <PageHeader title="Import Excel" description="Bring in your expense sheet. Upload it again any time: rows already imported are skipped." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="p-5">
          <ActionForm action={importWorkbook} className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line p-8 text-center hover:bg-canvas/50">
              <FileSpreadsheet className="size-8 text-emerald-600" />
              <span className="text-sm font-medium">Choose the expense workbook (.xlsx)</span>
              <input type="file" name="file" accept=".xlsx" required className="text-sm" />
            </label>
            {imported > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="replace" className="mt-0.5" /> <span>Replace the earlier import <span className="block text-xs text-muted">Removes the {imported.toLocaleString()} imported entries first (entries typed in by hand and their proofs stay). Use this if the sheet was corrected.</span></span></label>}
            <SubmitButton>Import</SubmitButton>
          </ActionForm>
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
