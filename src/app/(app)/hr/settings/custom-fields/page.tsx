import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { saveCustomField, updateCustomField } from "../actions";

export const metadata = { title: "Custom Fields" };
const KINDS = { text: "Text", number: "Number", date: "Date", select: "Choice list" } as const;

/** System Settings → Customization → Custom Fields: extra employee fields shown on every profile. */
export default async function CustomFieldsPage() {
  const user = await requirePermission("settings.company");
  const canEdit = user.isSuperAdmin || can(user, "settings.company", "edit");
  const fields = await db.customField.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <>
      <PageHeader title="Custom Fields" description="Extra details you want on every employee (e.g. vehicle number, shirt size, EOBI number). They appear on the profile under Employee Info → Additional Information and in the employee report." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-x-auto">
          {fields.length === 0 ? <EmptyState title="No custom fields yet" /> : (
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">Field</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Required</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-line">
                {fields.map((f) => (
                  <tr key={f.id} className={f.active ? undefined : "opacity-50"}>
                    <td className="px-4 py-2.5 font-medium">{f.label}{f.options && <span className="block text-xs font-normal text-muted">{f.options.split(",").join(" · ")}</span>}</td>
                    <td className="px-4 py-2.5">{KINDS[f.kind as keyof typeof KINDS] ?? f.kind}</td>
                    <td className="px-4 py-2.5">{f.required ? <Badge tone="amber">required</Badge> : "—"}</td>
                    <td className="px-4 py-2.5">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <Op id={f.id} op="toggle" label={f.active ? "Hide" : "Show"} />
                          <Op id={f.id} op="delete" label="Delete" danger />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        {canEdit && (
          <Card className="h-fit p-5">
            <h2 className="mb-3 text-sm font-semibold">Add field</h2>
            <ActionForm action={saveCustomField} className="space-y-3">
              <Field label="Label"><input name="label" required className="input" placeholder="e.g. Vehicle number" /></Field>
              <Field label="Type"><select name="kind" className="input">{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Choices (for a choice list)" hint="Comma-separated"><input name="options" className="input" placeholder="S, M, L, XL" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="required" /> Required</label>
              <SubmitButton>Add field</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}

function Op({ id, op, label, danger }: { id: string; op: string; label: string; danger?: boolean }) {
  return (
    <form action={updateCustomField}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} />
      <button className={danger ? "rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" : "rounded px-2 py-1 text-xs text-navy-700 hover:bg-canvas"}>{label}</button>
    </form>
  );
}
