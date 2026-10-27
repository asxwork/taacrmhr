import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { sendEncashment } from "@/app/(app)/hr/compensation-actions";

/** Encash unused paid leave (HR → Leave Encashment and My Leave). Value = days × gross / 30. */
export function EncashForm({ employeeId, balances, perDay }: { employeeId?: string; balances: { typeId: string; name: string; available: number }[]; perDay: number | null }) {
  if (!balances.length) return <p className="text-sm text-muted">No paid leave left to encash this year.</p>;
  if (perDay == null) return <p className="text-sm text-muted">No salary is set, so leave can’t be valued yet.</p>;
  return (
    <ActionForm action={sendEncashment} className="space-y-3">
      {employeeId && <input type="hidden" name="employeeId" value={employeeId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Leave type">
          <select name="typeId" required className="input">
            {balances.map((b) => <option key={b.typeId} value={b.typeId}>{b.name} ({b.available} day{b.available === 1 ? "" : "s"} left)</option>)}
          </select>
        </Field>
        <Field label="Days" hint={`PKR ${Math.round(perDay).toLocaleString("en-PK")} per day`}><input name="days" type="number" min={0.5} step={0.5} required className="input" /></Field>
      </div>
      <Field label="Reason (optional)"><input name="reason" className="input" /></Field>
      <SubmitButton>Send for approval</SubmitButton>
    </ActionForm>
  );
}
