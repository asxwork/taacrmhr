import Link from "@/components/link";
import { RotateCcw, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { fieldAccess } from "@/lib/field-rules";
import { maskPhone } from "@/lib/field-defs";
import { fmtPhone } from "@/lib/crm-shared";
import { fmtDate } from "@/lib/utils";
import { TRASH_DAYS, daysLeft, trashWhere } from "@/lib/lead-trash";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteForever, restoreFromTrash } from "./actions";

export const metadata = { title: "Trash — leads" };
const PAGE = 100;

/** Leads → Trash: deleted leads stay here for 30 days and can be put back with all their history. */
export default async function LeadTrashPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; restored?: string; failed?: string; purged?: string }> }) {
  const user = await requirePermission("crm.leads", "delete");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { ...trashWhere(user), ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : [])] } : {}) };
  const [rows, total, fields] = await Promise.all([
    db.leadTrash.findMany({ where, orderBy: { deletedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, select: { id: true, number: true, name: true, phone: true, ownerName: true, activities: true, deletedByName: true, deletedAt: true } }),
    db.leadTrash.count({ where }),
    fieldAccess(user),
  ]);
  const pm = fields["lead.phone"];
  return (
    <>
      <PageHeader title="Trash" description={`Deleted leads stay here for ${TRASH_DAYS} days with all their activities, then they're removed for good. Restoring puts a lead back with the same ID, stage, responsible person and history.`} />
      {sp.restored !== undefined && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Restored {sp.restored} lead(s).{sp.failed ? ` ${sp.failed} couldn't be restored.` : ""}</p>}
      {sp.purged !== undefined && <p role="status" className="mb-4 rounded-lg border border-line bg-canvas px-4 py-3 text-sm">Deleted {sp.purged} lead(s) for good.</p>}
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, phone or lead ID" className="input h-9 max-w-xs" />
        <button className="h-9 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-canvas">Search</button>
      </form>
      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState title={q ? "Nothing in the Trash matches" : "The Trash is empty"} description="Leads you delete show up here." /> : (
          <form>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line bg-canvas text-left text-xs text-muted">
                  <th className="w-8 px-3 py-2"></th><th className="px-3 py-2 font-medium">Lead</th><th className="px-3 py-2 font-medium">Phone</th><th className="px-3 py-2 font-medium">Responsible</th>
                  <th className="px-3 py-2 font-medium">Activities</th><th className="px-3 py-2 font-medium">Deleted</th><th className="px-3 py-2 font-medium">Removed for good in</th><th className="px-3 py-2"></th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-canvas/60">
                      <td className="px-3 py-2"><input type="checkbox" name="id" value={r.id} aria-label={`Select ${r.name}`} className="accent-navy-900" /></td>
                      <td className="px-3 py-2"><span className="font-medium">{r.name}</span>{r.number && <span className="ml-1.5 text-xs text-muted">#{r.number}</span>}</td>
                      <td className="px-3 py-2 tabular-nums">{!r.phone ? "—" : pm === "full" ? fmtPhone(r.phone) : pm === "mask" ? maskPhone(r.phone) : "Hidden"}</td>
                      <td className="px-3 py-2">{r.ownerName ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.activities}</td>
                      <td className="px-3 py-2 text-muted">{fmtDate(r.deletedAt)}{r.deletedByName && <> by {r.deletedByName}</>}</td>
                      <td className="px-3 py-2 tabular-nums">{daysLeft(r.deletedAt)} days</td>
                      <td className="px-3 py-2 text-right">
                        <button form={`restore-${r.id}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-navy-900 hover:bg-navy-50"><RotateCcw className="size-3.5" /> Restore</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line p-3">
              <button formAction={restoreFromTrash} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-navy-900 px-3 text-sm font-medium text-white hover:bg-navy-800"><RotateCcw className="size-4" /> Restore selected</button>
              {user.isSuperAdmin && (
                <ConfirmButton formAction={deleteForever} message="Delete the selected leads for good? They can't be restored after this." className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="size-4" /> Delete selected for good</ConfirmButton>
              )}
              <span className="ml-auto text-xs text-muted">{total} in the Trash{total > PAGE && <> · page {page} of {Math.ceil(total / PAGE)}{page > 1 && <> · <Link href={`?q=${encodeURIComponent(q)}&page=${page - 1}`} className="underline">Previous</Link></>}{page * PAGE < total && <> · <Link href={`?q=${encodeURIComponent(q)}&page=${page + 1}`} className="underline">Next</Link></>}</>}</span>
            </div>
          </form>
        )}
        {/* One small form per row for its Restore button (forms can't sit inside the table's form). */}
        {rows.map((r) => <form key={r.id} id={`restore-${r.id}`} action={restoreFromTrash} hidden><input type="hidden" name="id" value={r.id} /></form>)}
      </Card>
    </>
  );
}
