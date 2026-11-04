import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeWhere } from "@/lib/permissions";
import { disabledFeatures } from "@/lib/features";
import { waHref } from "@/lib/crm-shared";
import { renderTemplate } from "@/lib/templates";

/**
 * Sends a message template to a lead: fills in the placeholders, notes it on the lead's timeline and opens
 * WhatsApp / the mail app. Works for masked numbers too (the number never reaches the page).
 * /api/leads/<id>/template?t=<templateId>
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user, "crm.templates") || (await disabledFeatures()).has("templates")) return new Response("Forbidden", { status: 403 });
  const scope = await scopeWhere(user, "crm.leads");
  const lead = scope ? await db.lead.findFirst({ where: { id: (await params).id, ...scope }, include: { project: { select: { name: true } }, unit: { select: { unitNo: true } } } }) : null;
  const tpl = await db.messageTemplate.findFirst({ where: { id: new URL(req.url).searchParams.get("t") ?? "", active: true } });
  if (!lead || !tpl) return new Response("Not found", { status: 404 });
  const [me, company] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { phone: true } }),
    db.setting.findUnique({ where: { key: "company.name" } }),
  ]);
  const vars = {
    first_name: lead.name.split(" ")[0], name: lead.name, agent: user.name, agent_phone: me?.phone,
    project: lead.project?.name, unit: lead.unit?.unitNo, company: company?.value || "The Advisor Associates",
  };
  const text = renderTemplate(tpl.body, vars);
  const to = tpl.channel === "email" ? lead.email : lead.phone;
  if (!to) return new Response(tpl.channel === "email" ? "This lead has no email." : "This lead has no phone number.", { status: 404 });
  if (!user.viewAs) {
    await db.activity.create({ data: { type: "note", subject: `${tpl.channel === "email" ? "Email" : "WhatsApp"} sent: ${tpl.name}`, body: text, leadId: lead.id, ownerId: user.id, createdById: user.id, doneAt: new Date(), branchId: lead.branchId } });
    await db.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } });
  }
  const url = tpl.channel === "email"
    ? `mailto:${to}?subject=${encodeURIComponent(renderTemplate(tpl.subject ?? tpl.name, vars))}&body=${encodeURIComponent(text)}`
    : `${waHref(to)}?text=${encodeURIComponent(text)}`;
  return NextResponse.redirect(url, 302);
}
