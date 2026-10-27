"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PBX_KEYS, canStoreSecrets, pbxConfig, sealSecret } from "@/lib/softphone";
import { str, type FormState } from "@/lib/utils";

/** Saves the PBX connection (Issabel WebRTC address, feature codes, recording and retention). */
export async function savePbx(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin) return { error: "Only Super Admins can change the phone system." };
  const wss = str(fd, "wss");
  if (wss && !/^wss:\/\/[^\s/]+/.test(wss)) return { error: "The WebRTC address must start with wss:// (e.g. wss://pbx.example.com:8089/ws)." };
  const cur = await pbxConfig();
  const next = Object.fromEntries(PBX_KEYS.map((k) => [k, fd.has(k) ? str(fd, k).slice(0, 1000) : cur[k]]));
  next.record = fd.get("record") === "on" ? "on" : "off";
  const value = JSON.stringify(next);
  await db.setting.upsert({ where: { key: "calls.pbx" }, update: { value }, create: { key: "calls.pbx", value } });
  await audit(user.id, "update", "setting", "calls.pbx", `Phone system updated (recording ${next.record}, keep ${next.retentionDays} days)`);
  revalidatePath("/calls/phone-system");
  return { ok: true, message: "Saved." };
}

/** Gives an agent their Issabel extension. The SIP password is encrypted; leave it blank to keep the current one. */
export async function saveExtension(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin) return { error: "Only Super Admins can assign extensions." };
  const userId = str(fd, "userId");
  const extension = str(fd, "extension").replace(/[^\d*#a-zA-Z_-]/g, "").slice(0, 20);
  const password = String(fd.get("password") ?? "");
  const agent = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!agent) return { error: "Choose an agent." };
  if (!extension) {
    await db.sipAccount.deleteMany({ where: { userId } });
    await audit(user.id, "delete", "sipAccount", userId, `Extension removed from ${agent.name}`);
    revalidatePath("/calls/phone-system");
    return { ok: true, message: "Extension removed." };
  }
  if (password && !canStoreSecrets()) return { error: "Set SIP_SECRET_KEY (or CRON_SECRET) in the server's environment first, so passwords can be stored encrypted." };
  const taken = await db.sipAccount.findFirst({ where: { extension, userId: { not: userId } } });
  if (taken) return { error: `Extension ${extension} is already given to someone else.` };
  const secretEnc = password ? sealSecret(password.slice(0, 200)) : undefined;
  await db.sipAccount.upsert({
    where: { userId },
    update: { extension, enabled: fd.get("enabled") === "on", ...(secretEnc ? { secretEnc } : {}) },
    create: { userId, extension, enabled: fd.get("enabled") === "on", secretEnc: secretEnc ?? null },
  });
  await audit(user.id, "update", "sipAccount", userId, `${agent.name} → extension ${extension}${password ? " (password changed)" : ""}`);
  revalidatePath("/calls/phone-system");
  return { ok: true, message: `${agent.name}: extension ${extension} saved.` };
}
