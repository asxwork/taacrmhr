import type { CommissionValues } from "@/lib/deal-commission";

const box = "block text-sm font-medium";
const v = (x: string | number | null | undefined) => (x == null ? "" : String(x));

/** Commission form fields (unit, community, project, developer, commission split, payment structure). Server-renderable. */
export function CommissionFields({ d = {}, hideMoney = false }: { d?: CommissionValues; hideMoney?: boolean }) {
  return (
    <div className="space-y-4">
      <fieldset className="min-w-0 rounded-xl border border-line p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Property</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className={box}>Unit no.<input name="unitNo" defaultValue={v(d.unitNo)} placeholder="e.g. A-1203, Plot 45" className="input mt-1" /></label>
          <label className={box}>Community / area<input name="community" defaultValue={v(d.community)} placeholder="e.g. Dubai Marina, DHA Phase 8" className="input mt-1" /></label>
          <label className={box}>Project<input name="projectName" defaultValue={v(d.projectName)} placeholder="e.g. Emaar Beachfront" className="input mt-1" /></label>
          <label className={box}>Developer<input name="developer" defaultValue={v(d.developer)} placeholder="e.g. Emaar, Bahria" className="input mt-1" /></label>
        </div>
      </fieldset>
      {!hideMoney && (
        <fieldset className="min-w-0 rounded-xl border border-line p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Commission</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className={`${box} col-span-2`}>Commission amount<input name="commissionAmount" defaultValue={v(d.commissionAmount)} placeholder="Empty = value × commission %" className="input mt-1" /></label>
            <label className={box}>Agent share %<input name="agentSharePct" inputMode="decimal" defaultValue={v(d.agentSharePct)} placeholder="e.g. 40" className="input mt-1" /></label>
            <label className={box}>Company share %<input name="companySharePct" inputMode="decimal" defaultValue={v(d.companySharePct)} placeholder="e.g. 60" className="input mt-1" /></label>
            <label className={`${box} col-span-2 sm:col-span-4`}>Other agents sharing<input name="otherAgents" defaultValue={v(d.otherAgents)} placeholder="e.g. Ali 10%, Sara 5%" className="input mt-1" /></label>
          </div>
        </fieldset>
      )}
      <fieldset className="min-w-0 rounded-xl border border-line p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Payment structure</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={box}>Down payment %<input name="downPaymentPct" inputMode="decimal" defaultValue={v(d.downPaymentPct)} placeholder="e.g. 20" className="input mt-1" /></label>
          <label className={`${box} col-span-2`}>Installments<input name="installmentPlan" defaultValue={v(d.installmentPlan)} placeholder="e.g. 60 monthly, 4 yearly" className="input mt-1" /></label>
          <label className={box}>On handover %<input name="handoverPct" inputMode="decimal" defaultValue={v(d.handoverPct)} placeholder="e.g. 20" className="input mt-1" /></label>
        </div>
      </fieldset>
    </div>
  );
}
