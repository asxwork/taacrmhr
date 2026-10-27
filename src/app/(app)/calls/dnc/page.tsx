import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { addDnc, removeDnc } from "../actions";

export const metadata = { title: "Do-not-call list" };

/** Calls → Do-not-call: never handed to agents (also added automatically when a caller asks). */
export default async function DncPage() {
  await requirePermission("calls", "create");
  const rows = await db.dncNumber.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return (
    <>
      <PageHeader title="Do-not-call list" description="Numbers here are skipped on upload and taken out of every queue. “Do not call” on a call adds the number automatically." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-x-auto">
          {rows.length === 0 ? <EmptyState title="The list is empty" /> : (
            <ul className="divide-y divide-line text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="font-mono">{r.phoneKey}</span><span className="flex-1 truncate text-xs text-muted">{r.reason}</span><span className="text-xs text-muted">{format(r.createdAt, "d MMM yyyy")}</span>
                  <form action={removeDnc}><input type="hidden" name="id" value={r.id} /><button aria-label="Remove" title="Remove" className="p-1 text-muted hover:text-red-600"><Trash2 className="size-3.5" /></button></form>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="h-fit p-5">
          <ActionForm action={addDnc} className="space-y-3">
            <Field label="Numbers" hint="One per line or comma-separated"><textarea name="numbers" rows={5} required className="input font-mono text-xs" /></Field>
            <Field label="Reason"><input name="reason" className="input" /></Field>
            <SubmitButton variant="secondary">Add to list</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
