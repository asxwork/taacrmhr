"use server";

import { queueProfileChange } from "@/lib/profile-requests";

import { db } from "@/lib/db";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { readAppearanceForm } from "@/lib/appearance-server";
import { deleteUpload, saveImage } from "@/lib/files";
import { BLOOD_GROUPS, SELF_EDITABLE } from "@/lib/hr-shared";

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const current = str(fd, "current");
  const next = str(fd, "next");
  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== str(fd, "confirm")) return { error: "New passwords don't match." };

  const record = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(current, record.passwordHash))) return { error: "Current password is incorrect." };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  await audit(user.id, "update", "user", user.id, `${user.name} changed their password`);
  return { ok: true };
}

export async function saveMyAppearance(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const res = await readAppearanceForm(fd, `wallpapers/${user.id}`, true);
  if ("error" in res) return { error: res.error };
  const current = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { wallpaper: true } });
  const keep = res.wallpaper === "keep" || res.wallpaper === undefined;
  if (!keep && current.wallpaper?.startsWith("upload:") && current.wallpaper !== res.wallpaper) await deleteUpload(current.wallpaper.slice(7));
  await db.user.update({
    where: { id: user.id },
    data: { ...(res.theme !== undefined && { theme: res.theme }), ...(res.accent !== undefined && { accent: res.accent }), ...(!keep && { wallpaper: res.wallpaper }) },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Appearance saved." };
}

/** Employees can't edit HR data directly — they send the changed fields to HR for approval. */
export async function requestProfileUpdate(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id } });
  if (!emp) return { error: "Your login isn't linked to an employee record yet. Ask HR." };
  const changes: Record<string, string | null> = {};
  for (const { key } of SELF_EDITABLE) {
    const next = str(fd, key) || null;
    if (next !== (emp[key] ?? null)) changes[key] = next;
  }
  if (!Object.keys(changes).length) return { error: "Nothing has changed." };
  if (changes.cnic && !/^\d{5}-?\d{7}-?\d$/.test(changes.cnic)) return { error: "CNIC should look like 42101-1234567-1." };
  if (changes.bloodGroup && !(BLOOD_GROUPS as readonly string[]).includes(changes.bloodGroup)) return { error: "Choose a blood group from the list." };
  await queueProfileChange(emp, user.id, { changes }, `${Object.keys(changes).length} field(s) changed`);
  revalidatePath("/me");
  return { ok: true, message: "Sent to HR for approval." };
}

/** Employees send a new profile photo to HR; it replaces the current one only when HR approves. */
export async function updateMyPhoto(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, fullName: true } });
  if (!emp) return { error: "Your login isn't linked to an employee record yet. Ask HR." };
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  const res = await saveImage(file, `people/${emp.id}`, 4_000_000);
  if ("error" in res) return { error: res.error };
  // A newer photo replaces one still waiting in the same request.
  const pending = await db.approvalRequest.findFirst({ where: { employeeId: emp.id, type: "profile_update", status: "pending" } });
  const old = pending ? (JSON.parse(pending.payload) as { photo?: string }).photo : undefined;
  if (old) await deleteUpload(old).catch(() => {});
  await queueProfileChange(emp, user.id, { photo: res.path }, "new photo");
  revalidatePath("/me");
  revalidatePath("/profile");
  return { ok: true, message: "Photo sent to HR. It shows on your profile once approved." };
}
