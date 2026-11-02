import { format } from "date-fns";
import { getCurrentUser } from "@/lib/auth";
import { fieldAccess } from "@/lib/field-rules";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { LEAD_FILTER_KEYS, leadWhere, type LeadFilters } from "@/lib/lead-filters";
import { exportLeadsWorkbook } from "@/lib/lead-backup";

// Full export: leads (every field) + all their activities, as an Excel workbook that imports back.
// Uses the same filters as the lead list. /api/export/leads-full?<lead list filters>
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "crm.leads", "export")) return new Response("Forbidden", { status: 403 });
  // A full backup can't be masked: only people who see lead phones and emails in full may download it.
  const f = await fieldAccess(user);
  if (f["lead.phone"] !== "full" || f["lead.email"] !== "full") return new Response("Your role sees lead contact details masked, so it can't download a full backup.", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const filters = Object.fromEntries(LEAD_FILTER_KEYS.filter((k) => sp.get(k)).map((k) => [k, sp.get(k)!])) as LeadFilters;
  const where = await leadWhere(user, sp.get("everything") ? { ...filters, group: "all" } : filters, await db.leadStatus.findMany());
  const { buffer, leads } = await exportLeadsWorkbook(where);
  await audit(user.id, "export", "leads", null, `Exported ${leads} lead(s) with activities to Excel`);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leads-with-activities-${format(new Date(), "yyyy-MM-dd")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
