"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { str, type FormState } from "@/lib/utils";

const PBX_FIELDS = ["make", "model", "host", "wss", "trunk", "extensions", "notes"] as const;

/** Saves PBX details (no passwords: those go in server environment variables when the softphone is connected). */
export async function savePbx(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin) return { error: "Only Super Admins can change the phone system." };
  const value = JSON.stringify(Object.fromEntries(PBX_FIELDS.map((k) => [k, str(fd, k).slice(0, 1000)])));
  await db.setting.upsert({ where: { key: "calls.pbx" }, update: { value }, create: { key: "calls.pbx", value } });
  await audit(user.id, "update", "setting", "calls.pbx", "Phone system details updated");
  revalidatePath("/calls/phone-system");
  return { ok: true, message: "Saved." };
}
