"use server";

import { db } from "@/lib/db";
import { saveImage, saveUpload } from "@/lib/files";
import { notify } from "@/lib/notify";
import { hrApproverIds } from "@/lib/approvals";
import { addEvent } from "@/lib/hr";
import { disabledFeatures } from "@/lib/features";
import { str, type FormState } from "@/lib/utils";

const TEXT = ["firstName", "lastName", "fatherName", "motherName", "gender", "maritalStatus", "religion", "nationality", "bloodGroup", "phone", "personalEmail", "address", "permanentAddress", "city", "cnic", "emergencyName", "emergencyRelation", "emergencyPhone", "bankName", "accountTitle", "accountNumber"] as const;

/** Public: the new hire submits their details from the onboarding link (once). */
export async function submitOnboarding(_: FormState, fd: FormData): Promise<FormState> {
  if ((await disabledFeatures()).has("onboarding")) return { error: "Onboarding links are switched off." };
  const inv = await db.onboardingInvite.findUnique({ where: { token: str(fd, "token") }, include: { employee: true } });
  if (!inv || inv.submittedAt || inv.expiresAt < new Date()) return { error: "This link has expired or was already used. Ask HR for a new one." };
  const data: Record<string, string | Date | null> = {};
  for (const k of TEXT) data[k] = str(fd, k).slice(0, 300) || null;
  if (!data.firstName || !data.phone || !data.cnic) return { error: "First name, mobile number and CNIC are required." };
  if (!/^\d{5}-?\d{7}-?\d$/.test(String(data.cnic))) return { error: "CNIC should look like 42101-1234567-1." };
  if (data.personalEmail && !/^\S+@\S+\.\S+$/.test(String(data.personalEmail))) return { error: "Enter a valid email." };
  const dob = str(fd, "dob");
  data.dob = dob ? new Date(`${dob}T00:00:00`) : null;
  data.fullName = [data.firstName, data.lastName].filter(Boolean).join(" ");

  const id = inv.employeeId;
  const photo = fd.get("photo");
  if (photo instanceof File && photo.size) {
    const res = await saveImage(photo, `people/${id}`, 4_000_000);
    if ("error" in res) return { error: `Photo: ${res.error}` };
    data.photo = res.path;
  }
  for (const [field, type] of [["cnicFront", "CNIC (front)"], ["cnicBack", "CNIC (back)"]] as const) {
    const f = fd.get(field);
    if (!(f instanceof File) || !f.size) continue;
    const res = await saveUpload(f, `hr/${id}`, { maxBytes: 10_000_000, allowPdf: true });
    if ("error" in res) return { error: `${type}: ${res.error}` };
    await db.employeeDocument.create({ data: { employeeId: id, type, title: type, path: res.path, size: res.size, verified: false } });
  }
  await db.employee.update({ where: { id }, data: data as never });
  await db.onboardingInvite.update({ where: { id: inv.id }, data: { submittedAt: new Date() } });
  await addEvent(id, "note", "Onboarding form submitted by the new hire");
  for (const hr of await hrApproverIds()) await notify(hr, `${data.fullName} completed their onboarding form`, { body: "Check their details and verify the CNIC pictures.", link: `/hr/employees/${id}` });
  return { ok: true, message: "Thank you! Your details have been sent to HR." };
}
