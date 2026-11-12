"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { saveImage, saveUpload } from "@/lib/files";
import { notify } from "@/lib/notify";
import { hrApproverIds } from "@/lib/approvals";
import { addEvent } from "@/lib/hr";
import { disabledFeatures } from "@/lib/features";
import { ONB_FIELDS, onbStatus } from "@/lib/onboarding";
import { str, type FormState } from "@/lib/utils";

/**
 * Public: the new hire sends their details from the onboarding link. Nothing touches their profile yet: it waits
 * for HR to approve (or send it back with the wrong fields marked).
 */
export async function submitOnboarding(_: FormState, fd: FormData): Promise<FormState> {
  if ((await disabledFeatures()).has("onboarding")) return { error: "Onboarding links are switched off." };
  const token = str(fd, "token");
  const inv = await db.onboardingInvite.findUnique({ where: { token }, include: { employee: { select: { fullName: true } } } });
  const st = inv ? onbStatus(inv) : null;
  if (!inv || !(st === "open" || st === "rejected") || inv.expiresAt < new Date()) return { error: "This link has expired or was already used. Ask HR for a new one." };
  const before = (inv.payload ? JSON.parse(inv.payload) : {}) as Record<string, string>;
  const wrong = new Set((inv.wrongFields ?? "").split(",").filter(Boolean));
  const p: Record<string, string> = { ...before };

  for (const f of ONB_FIELDS) {
    if (f.kind === "file") continue;
    const v = str(fd, f.key).slice(0, 300);
    if (!v) return { error: `${f.label} is required.` };
    if (f.options && !f.options.some(([o]) => o === v)) return { error: `${f.label}: choose from the list.` };
    p[f.key] = v;
  }
  if (!/^\d{5}-?\d{7}-?\d$/.test(p.cnic!)) return { error: "CNIC should look like 42101-1234567-1." };
  if (!/^\S+@\S+\.\S+$/.test(p.personalEmail!)) return { error: "Enter a valid email." };
  if (!/^\+?[\d\s-]{10,15}$/.test(p.phone!) || !/^\+?[\d\s-]{10,15}$/.test(p.emergencyPhone!)) return { error: "Enter phone numbers like 0300 1234567." };
  if (Number.isNaN(new Date(`${p.dob}T00:00:00`).getTime())) return { error: "Enter your date of birth." };

  // Files: required the first time, and again when HR marked them wrong; otherwise the earlier upload stays.
  for (const f of ONB_FIELDS.filter((x) => x.kind === "file")) {
    const file = fd.get(f.key);
    const has = file instanceof File && file.size > 0;
    if (!has) {
      if (!before[f.key] || wrong.has(f.key)) return { error: `${f.label}: please attach it.` };
      continue;
    }
    const res = f.key === "photo" ? await saveImage(file, `people/${inv.employeeId}`, 4_000_000) : await saveUpload(file, `hr/${inv.employeeId}`, { maxBytes: 10_000_000, allowPdf: true });
    if ("error" in res) return { error: `${f.label}: ${res.error}` };
    p[f.key] = res.path;
    if ("size" in res) p[`${f.key}Size`] = String(res.size);
  }

  await db.onboardingInvite.update({ where: { id: inv.id }, data: { payload: JSON.stringify(p), status: "submitted", submittedAt: new Date() } });
  await addEvent(inv.employeeId, "note", st === "rejected" ? "Onboarding form corrected and sent again" : "Onboarding form submitted by the new hire");
  const name = `${p.firstName} ${p.lastName}`;
  for (const hr of await hrApproverIds()) await notify(hr, `${name} sent their onboarding details`, { body: "Check them and approve, or send back what's wrong.", link: `/hr/onboarding?review=${inv.id}`, email: true });
  redirect(`/onboard/${token}`);
}
