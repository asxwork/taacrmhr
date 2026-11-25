"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { EMAIL_MODES, saveNotifyPrefs, type EmailMode } from "@/lib/notify-prefs";
import { NOTIFY_CATEGORIES, type NotifyCategory } from "@/lib/notify";
import type { FormState } from "@/lib/utils";

export async function saveMyNotifications(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const email = (EMAIL_MODES.map((m) => m[0]) as string[]).includes(String(fd.get("email"))) ? (String(fd.get("email")) as EmailMode) : "daily";
  const muted = NOTIFY_CATEGORIES.map(([k]) => k).filter((k) => fd.get(`mute:${k}`) === "on") as NotifyCategory[];
  await saveNotifyPrefs(user.id, { email, muted, ...(fd.has("allLeadsShown") ? { allLeads: fd.get("allLeads") === "on" } : {}) });
  revalidatePath("/profile/notifications");
  return { ok: true, message: "Saved." };
}
