"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { saveSignature } from "@/lib/files";
import { notify } from "@/lib/notify";
import { invoiceEvent } from "@/lib/invoices";
import { str, type FormState } from "@/lib/utils";

/** The client accepts the invoice: typed name + drawn signature (no login; the link is the key). */
export async function clientSignInvoice(_: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, "token");
  const inv = token.length > 20 ? await db.invoice.findUnique({ where: { publicToken: token } }) : null;
  if (!inv || !["approved", "sent", "paid"].includes(inv.status)) return { error: "This invoice can't be signed." };
  if (inv.clientSignedAt) return { error: "Already signed. Thank you." };
  const name = str(fd, "name").slice(0, 100);
  if (name.length < 2) return { error: "Type your full name." };
  const sign = await saveSignature(str(fd, "signature"), "invoices/signatures");
  if (!sign) return { error: "Sign in the box first." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  await db.invoice.update({ where: { id: inv.id }, data: { clientSign: sign, clientSignedName: name, clientSignedAt: new Date(), clientSignedIp: ip } });
  await invoiceEvent(inv.id, null, "signed", `${name}${ip ? ` (IP ${ip})` : ""}`);
  if (inv.ownerId) await notify(inv.ownerId, `${inv.clientName} signed invoice ${inv.number}`, { body: `Signed as ${name}.`, link: `/invoices/${inv.id}` });
  revalidatePath(`/i/${token}`);
  return { ok: true, message: "Thank you. Your signature is saved." };
}
