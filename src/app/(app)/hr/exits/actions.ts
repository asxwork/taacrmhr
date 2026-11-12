"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { exitReasons } from "@/lib/exit-reasons";
import { str, type FormState } from "@/lib/utils";

/** Add or remove a reason for leaving. */
export async function saveExitReason(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("hr.employees", "edit");
  const list = await exitReasons();
  const name = str(fd, "name").replace(/\s+/g, " ").replace(/—/g, "-").slice(0, 60);
  let next = list;
  if (str(fd, "op") === "remove") next = list.filter((r) => r !== str(fd, "old"));
  else {
    if (name.length < 2) return { error: "Type a reason." };
    if (list.some((r) => r.toLowerCase() === name.toLowerCase())) return { error: `“${name}” is already there.` };
    next = [...list, name];
  }
  if (!next.length) return { error: "Keep at least one reason." };
  const value = JSON.stringify(next);
  await db.setting.upsert({ where: { key: "hr.exitReasons" }, update: { value }, create: { key: "hr.exitReasons", value } });
  await audit(user.id, "update", "setting", "hr.exitReasons", "Exit reasons changed");
  revalidatePath("/hr/exits");
  return { ok: true, message: "Saved." };
}
