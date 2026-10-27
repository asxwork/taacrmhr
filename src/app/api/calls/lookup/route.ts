import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { phoneKey } from "@/lib/crm-shared";
import { outcome } from "@/lib/calls";

/** Screen pop for a ringing number: who it is in the calling lists and the CRM. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "calls")) return new Response("Unauthorized", { status: 401 });
  const key = phoneKey(new URL(req.url).searchParams.get("phone") ?? "");
  if (!key) return Response.json({ ok: false });
  const [target, lead, last] = await Promise.all([
    db.callTarget.findFirst({ where: { phoneKey: key }, orderBy: { createdAt: "desc" }, include: { campaign: { select: { name: true } } } }),
    can(user, "crm.leads") ? db.lead.findFirst({ where: { phoneKey: key }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, status: { select: { name: true } } } }) : null,
    db.callLog.findFirst({ where: { phone: { contains: key.slice(-9) } }, orderBy: { startedAt: "desc" }, select: { outcome: true, startedAt: true, notes: true } }),
  ]);
  return Response.json({
    ok: true,
    name: lead?.name ?? target?.name ?? null,
    campaign: target?.campaign.name ?? null,
    lead: lead ? { id: lead.id, status: lead.status.name } : null,
    last: last ? { outcome: outcome(last.outcome)?.label ?? last.outcome, at: last.startedAt, notes: last.notes } : null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
