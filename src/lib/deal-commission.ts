// The commission form on a deal (filled when a lead is converted, which now means the deal is closed): unit,
// community, project, developer, commission and how it's split, and the payment structure.
import { parseAmount } from "./crm-shared";

const pct = (v: FormDataEntryValue | null) => { const n = parseFloat(String(v ?? "").replace(/[%,\s]/g, "")); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; };
const txt = (v: FormDataEntryValue | null, n = 190) => String(v ?? "").trim().slice(0, n) || null;

/** Commission form fields from a posted form; commission amount = value × % when it's left empty. */
export function commissionData(fd: FormData, value: number | null, commissionPct: number | null) {
  const typed = parseAmount(String(fd.get("commissionAmount") ?? ""));
  return {
    unitNo: txt(fd.get("unitNo"), 60), community: txt(fd.get("community"), 120), projectName: txt(fd.get("projectName"), 190), developer: txt(fd.get("developer"), 120),
    commissionAmount: typed ?? (value && commissionPct !== null ? Math.round((value * commissionPct) / 100) : null),
    agentSharePct: pct(fd.get("agentSharePct")), companySharePct: pct(fd.get("companySharePct")), otherAgents: txt(fd.get("otherAgents"), 500),
    downPaymentPct: pct(fd.get("downPaymentPct")), installmentPlan: txt(fd.get("installmentPlan"), 190), handoverPct: pct(fd.get("handoverPct")),
  };
}

export type CommissionValues = Partial<Record<"unitNo" | "community" | "projectName" | "developer" | "otherAgents" | "installmentPlan", string | null> & Record<"commissionAmount" | "agentSharePct" | "companySharePct" | "downPaymentPct" | "handoverPct", number | null>>;
