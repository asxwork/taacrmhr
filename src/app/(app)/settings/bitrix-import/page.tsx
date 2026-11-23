import { redirect } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { leadBackups } from "@/lib/lead-wipe";
import { Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { BitrixImporter } from "./importer";
import { deleteAllLeads } from "./actions";

export const metadata = { title: "Import from Bitrix" };

export default async function BitrixImportPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  const [total, backups, sp] = await Promise.all([db.lead.count(), leadBackups(), searchParams]);
  const justDeleted = Number(sp.deleted);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Import leads from Bitrix24" description="Bring in your Bitrix leads with their responsible person, activities (tasks, to-dos, calls), timeline comments and stage history. To re-import everything from scratch, delete all leads first (below)." />
      {sp.deleted !== undefined && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          {justDeleted ? <>Deleted <b>{justDeleted.toLocaleString()}</b> leads. A backup of all of them was saved first (download it at the bottom). Now choose your Bitrix files below.</> : "There were no leads to delete."}
        </p>
      )}
      <BitrixImporter />

      <Card className="mt-6 border-red-200 p-5">
        <h2 className="flex items-center gap-2 font-semibold text-red-700"><Trash2 className="size-4" /> Start fresh: delete all leads</h2>
        <p className="mt-1 text-sm text-muted">
          Deletes <b className="text-ink">all {total.toLocaleString()} leads</b> in AMS — from Bitrix, Facebook, the website and typed in — with their activities and history,
          so you can import everything again. Deals, contacts and inventory stay. A full Excel backup of every lead and activity is saved first; it can be imported back from Leads → Import → full backup.
        </p>
        {total > 0 ? (
          <ActionForm action={deleteAllLeads} className="mt-4 space-y-3">
            <Field label="Type DELETE ALL LEADS to confirm"><input name="confirm" autoComplete="off" required className="input" placeholder="DELETE ALL LEADS" /></Field>
            <SubmitButton variant="danger" pendingText="Backing up and deleting…">Back up and delete all {total.toLocaleString()} leads</SubmitButton>
          </ActionForm>
        ) : <p className="mt-3 text-sm font-medium text-emerald-700">There are no leads now — ready to import.</p>}
        {backups.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Backups saved before deleting</p>
            <ul className="space-y-1.5 text-sm">
              {backups.map((b) => (
                <li key={b.name}><a href={`/api/lead-backups/${b.name}`} className="inline-flex items-center gap-1.5 font-medium text-navy-900 hover:underline"><Download className="size-4" />{b.name}</a> <span className="text-xs text-muted">{(b.size / 1024 / 1024).toFixed(1)} MB</span></li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
