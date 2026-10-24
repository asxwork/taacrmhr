import Link from "next/link";
import { Building2, Wallet, X } from "lucide-react";
import { fmtPKR } from "@/lib/crm-shared";
import { fmtDate } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, LinkButton } from "@/components/ui";
import { StatusPill } from "@/components/crm/bits";
import { linkUnitToDeal, unlinkUnitFromDeal } from "@/app/(app)/inventory/actions";

type Props = {
  dealId: string;
  canEdit: boolean;
  units: { id: string; label: string; price: number | null; status: { label: string; color: string } }[];
  linkable: { id: string; group: string; label: string }[];
  plan: { total: number; paid: number; overdue: number; next: { label: string; dueDate: Date; amount: number; paidAmount: number } | null } | null;
};

/** Property units on a deal plus the payment plan summary. */
export function DealProperty({ dealId, canEdit, units, linkable, plan }: Props) {
  const groups = [...new Set(linkable.map((l) => l.group))];
  return (
    <>
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Building2 className="size-4 text-muted" /> Property</h2>
        {units.length === 0 && <p className="mb-3 text-sm text-muted">No unit linked yet.</p>}
        <ul className="mb-3 space-y-2.5">
          {units.map((u) => (
            <li key={u.id} className="flex items-center gap-2 text-sm">
              <Link href={`/inventory/units/${u.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{u.label}</Link>
              <StatusPill name={u.status.label} colorName={u.status.color} />
              {canEdit && (
                <form action={unlinkUnitFromDeal}>
                  <input type="hidden" name="dealId" value={dealId} />
                  <input type="hidden" name="unitId" value={u.id} />
                  <button title="Unlink unit" aria-label="Unlink unit" className="rounded p-1 text-muted hover:bg-canvas hover:text-red-600"><X className="size-3.5" /></button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {canEdit && linkable.length > 0 && (
          <ActionForm action={linkUnitToDeal} className="flex gap-2">
            <input type="hidden" name="dealId" value={dealId} />
            <select name="unitId" required defaultValue="" className="input min-w-0 flex-1 text-xs">
              <option value="" disabled>Link an available unit…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {linkable.filter((l) => l.group === g).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </optgroup>
              ))}
            </select>
            <SubmitButton variant="secondary">Link</SubmitButton>
          </ActionForm>
        )}
        <p className="mt-2 text-xs text-muted">Linked units are booked or sold automatically as the deal moves through stages.</p>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium"><Wallet className="size-4 text-muted" /> Payment plan</h2>
        {plan ? (
          <>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-canvas">
              <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (plan.paid / plan.total) * 100)}%` }} />
            </div>
            <p className="text-sm"><b className="font-semibold">{fmtPKR(plan.paid)}</b> <span className="text-muted">of {fmtPKR(plan.total)} received</span></p>
            {plan.overdue > 0 && <p className="mt-1 text-sm font-medium text-red-600">{plan.overdue} overdue</p>}
            {plan.next && <p className="mt-1 text-xs text-muted">Next: {plan.next.label} · {fmtPKR(plan.next.amount - plan.next.paidAmount)} on {fmtDate(plan.next.dueDate)}</p>}
            <LinkButton href={`/crm/deals/${dealId}/payments`} variant="secondary" className="mt-3 w-full">View schedule</LinkButton>
          </>
        ) : canEdit ? (
          <LinkButton href={`/crm/deals/${dealId}/payments`} variant="secondary" className="w-full">Create payment plan</LinkButton>
        ) : (
          <p className="text-sm text-muted">No payment plan.</p>
        )}
      </Card>
    </>
  );
}
