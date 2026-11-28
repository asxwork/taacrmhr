"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { saveSignature } from "@/lib/files";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { str, type FormState } from "@/lib/utils";

/** The employee signs a letter or document HR asked them to sign: drawn signature, typed name, time and IP. */
export async function signMyDocument(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, fullName: true } });
  if (!emp) return { error: "No employee record is linked to your login." };
  if (fd.get("agree") !== "on") return { error: "Tick that you have read it and agree." };
  const name = str(fd, "name").slice(0, 120);
  if (name.length < 3) return { error: "Type your full name." };
  const kind = str(fd, "kind"), id = str(fd, "id");
  const item = kind === "letter"
    ? await db.employeeLetter.findFirst({ where: { id, employeeId: emp.id }, select: { id: true, title: true, signedAt: true, issuedById: true } })
    : await db.employeeDocument.findFirst({ where: { id, employeeId: emp.id }, select: { id: true, title: true, signedAt: true, uploadedById: true } });
  if (!item) return { error: "Document not found." };
  if (item.signedAt) return { error: "You have already signed this." };
  const signature = await saveSignature(str(fd, "signature"), `signatures/${emp.id}`);
  if (!signature) return { error: "Draw your signature in the box." };
  const h = await headers();
  const signedIp = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const data = { signedAt: new Date(), signature, signedName: name, signedIp };
  if (kind === "letter") await db.employeeLetter.update({ where: { id }, data });
  else await db.employeeDocument.update({ where: { id }, data });
  await audit(user.id, "update", kind === "letter" ? "employeeLetter" : "employeeDocument", id, `${emp.fullName} signed ${item.title}`);
  const hrId = "issuedById" in item ? item.issuedById : item.uploadedById;
  if (hrId && hrId !== user.id) await notify(hrId, `${emp.fullName} signed: ${item.title}`, { link: `/hr/employees/${emp.id}?tab=documents` }).catch(() => {});
  revalidatePath("/me/documents");
  redirect(`/me/documents?signed=1`);
}
