import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopeWhere } from "@/lib/permissions";
import { telHref, waHref } from "@/lib/crm-shared";

/**
 * Call / WhatsApp a lead whose number is masked for this user (Field rules): checks they may see the lead, then
 * hands the number straight to the phone app or WhatsApp without showing it on the page.
 * /api/leads/<id>/dial?via=tel|wa&i=<index in the lead's phone list>
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const scope = await scopeWhere(user, "crm.leads");
  const lead = scope ? await db.lead.findFirst({ where: { id: (await params).id, ...scope }, select: { phone: true, phone2: true, phones: true } }) : null;
  if (!lead) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  let list: string[] = [];
  try { list = lead.phones ? (JSON.parse(lead.phones) as { value: string }[]).map((p) => p.value) : []; } catch {}
  if (!list.length) list = [lead.phone, lead.phone2].filter(Boolean) as string[];
  const phone = list[Number(url.searchParams.get("i")) || 0] ?? list[0];
  if (!phone) return new Response("No phone number", { status: 404 });
  return NextResponse.redirect(url.searchParams.get("via") === "wa" ? waHref(phone) : telHref(phone), 302);
}
