"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, scopeFor } from "@/lib/permissions";
import { parseAmount } from "@/lib/crm-shared";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { agentShare } from "@/lib/commission-tracker";

/** Managers (all-deals edit) mark a deal's commission as received from the developer, or as paid to the agent. */
export async function markCommission(fd: FormData) {
  const user = await requirePermission("crm.deals", "edit");
  if (scopeFor(user, "crm.deals", "edit") !== "all") return;
  const id = String(fd.get("id") ?? ""), what = String(fd.get("what") ?? "");
  const deal = await db.deal.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true, commissionAmount: true, agentSharePct: true } });
  if (!deal) return;
  if (what === "received") await db.deal.update({ where: { id }, data: { commissionReceivedAt: new Date() } });
  else if (what === "unreceived") await db.deal.update({ where: { id }, data: { commissionReceivedAt: null } });
  else if (what === "paid") {
    const amount = parseAmount(String(fd.get("amount") ?? "")) ?? agentShare(deal);
    await db.deal.update({ where: { id }, data: { agentPaidAt: new Date(), agentPaidAmount: amount } });
    if (deal.ownerId) await notify(deal.ownerId, "Commission paid", { body: `Your commission for "${deal.title}" was marked paid.`, link: "/crm/commissions" }).catch(() => {});
  } else if (what === "unpaid") await db.deal.update({ where: { id }, data: { agentPaidAt: null, agentPaidAmount: null } });
  else return;
  await audit(user.id, "update", "deal", id, `Commission: ${what}`).catch(() => {});
  revalidatePath("/crm/commissions");
}
