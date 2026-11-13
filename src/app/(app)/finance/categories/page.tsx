import { Plus, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { categoryTree, ensureFinanceDefaults } from "@/lib/finance";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { saveCategory } from "../actions";

export const metadata = { title: "Categories · Finance" };

/** Finance → Categories: main categories and their sub-categories. */
export default async function CategoriesPage() {
  await requirePermission("finance.settings", "edit");
  await ensureFinanceDefaults();
  const [tree, used] = await Promise.all([categoryTree(), db.finEntry.groupBy({ by: ["categoryId"], _count: true })]);
  const n = (id: string) => used.find((u) => u.categoryId === id)?._count ?? 0;

  const row = (c: { id: string; name: string; personal: boolean }, sub: boolean) => (
    <div key={c.id} className={`flex flex-wrap items-center gap-2 py-2 ${sub ? "pl-6" : ""}`}>
      <ActionForm action={saveCategory} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={c.id} />
        <input name="name" defaultValue={c.name} aria-label="Name" className={`input h-9 max-w-xs ${sub ? "" : "font-semibold"}`} />
        {!sub && <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" name="personal" defaultChecked={c.personal} className="accent-navy-900" /> Owner personal (not company)</label>}
        {sub && <input type="hidden" name="personal" value={c.personal ? "on" : ""} />}
        <span className="text-xs text-muted">{n(c.id)} entries</span>
        <SubmitButton variant="secondary" className="h-8 px-3 text-xs">Save</SubmitButton>
      </ActionForm>
      <ActionForm action={saveCategory} className="flex max-w-[14rem] flex-col items-end text-right text-xs">
        <input type="hidden" name="op" value="delete" /><input type="hidden" name="id" value={c.id} />
        <ConfirmButton message={`Delete ${c.name}?`} title="Delete" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="size-3.5" /> Delete</ConfirmButton>
      </ActionForm>
    </div>
  );

  return (
    <>
      <PageHeader title="Categories" description="What money is spent on. Each category can have sub-categories; a category used by entries can be renamed but not deleted." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {tree.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="divide-y divide-line">
              {row(c, false)}
              {c.subs.map((s) => row(s, true))}
            </div>
            <ActionForm action={saveCategory} className="mt-2 flex gap-2 pl-6">
              <input type="hidden" name="parentId" value={c.id} />
              {c.personal && <input type="hidden" name="personal" value="on" />}
              <input name="name" required placeholder={`New sub-category in ${c.name}`} aria-label="New sub-category" className="input h-9" />
              <SubmitButton variant="secondary" className="h-9 px-3 text-xs"><Plus className="size-3.5" /> Add</SubmitButton>
            </ActionForm>
          </Card>
        ))}
        <Card className="h-fit p-4">
          <p className="mb-2 font-medium">New main category</p>
          <ActionForm action={saveCategory} className="flex flex-wrap gap-2">
            <input name="name" required placeholder="e.g. Travel" aria-label="New category" className="input h-9 flex-1" />
            <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" name="personal" className="accent-navy-900" /> Owner personal</label>
            <SubmitButton className="h-9 px-3 text-xs"><Plus className="size-3.5" /> Add</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
