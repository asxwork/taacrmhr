"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { connectSync, runBitrixSync, syncStatus, updateSync } from "@/lib/bitrix-sync";
import { webhookBase } from "@/lib/bitrix-api";
import type { FormState } from "@/lib/utils";

async function boss() {
  const user = await requireUser();
  if (!user.isSuperAdmin || user.viewAs) throw new Error("Only a Super Admin can do this.");
  return user;
}

export async function connectBitrixSync(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await boss();
    const url = String(fd.get("webhook") ?? "").trim();
    const base = webhookBase(url);
    if (!base) return { error: "That isn't a Bitrix webhook link. It looks like https://yourcompany.bitrix24.com/rest/1/abc123…/" };
    // Quick check the link works before saving it.
    const res = await fetch(`${base}profile.json`, { method: "POST", signal: AbortSignal.timeout(20_000) }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { error?: string; error_description?: string }) : { error: "no answer" };
    if (!res || body.error) return { error: `Bitrix didn't accept the link: ${body.error_description || body.error || "no answer"}.` };
    await connectSync(base, { userId: user.id, every: Number(fd.get("every")) || 15, last: null });
    await audit(user.id, "update", "setting", null, `Bitrix sync connected (${new URL(base).hostname})`);
    void runBitrixSync(); // first sync now, in the background
  } catch (e) { return { error: e instanceof Error ? e.message : "Couldn't save." }; }
  revalidatePath("/settings/bitrix-sync");
  return { ok: true, message: "Connected. The first sync is running now: it reads everything once, then only what changes." };
}

export async function bitrixSyncNow(full: boolean) {
  await boss();
  const s = await syncStatus();
  if (!s.connected) return { error: "Connect Bitrix first." };
  if (s.running) return { error: "A sync is already running." };
  void runBitrixSync({ full });
  return { ok: true };
}

export async function bitrixSyncSettings(patch: { enabled?: boolean; every?: number; disconnect?: boolean }) {
  const user = await boss();
  await updateSync(patch);
  if (patch.disconnect) await audit(user.id, "update", "setting", null, "Bitrix sync disconnected");
  revalidatePath("/settings/bitrix-sync");
}

export async function bitrixBackupNow() {
  await boss();
  const { bitrixBackupState, runBitrixBackup } = await import("@/lib/bitrix-backup");
  if ((await bitrixBackupState()).running) return { error: "A Bitrix backup is already running." };
  void runBitrixBackup();
  return { ok: true };
}

export async function bitrixBackupSwitch(enabled: boolean) {
  await boss();
  await (await import("@/lib/bitrix-backup")).setBitrixBackup(enabled);
}

export async function bitrixBackupInfo() {
  await boss();
  const [{ bitrixBackupState, bitrixLocalBackups }, { driveConnected }] = await Promise.all([import("@/lib/bitrix-backup"), import("@/lib/backup")]);
  return { ...(await bitrixBackupState()), drive: await driveConnected(), files: await bitrixLocalBackups() };
}

export async function bitrixSyncState() {
  await boss();
  return syncStatus();
}
