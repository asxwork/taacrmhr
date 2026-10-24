"use server";

import { db } from "@/lib/db";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { readAppearanceForm } from "@/lib/appearance-server";
import { deleteUpload } from "@/lib/files";

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
