"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canStoreSecrets } from "@/lib/softphone";
import { backupConfig, runBackup, saveBackupConfig } from "@/lib/backup";
import { str, type FormState } from "@/lib/utils";

async function superAdmin() {
  const user = await requireUser();
  if (!user.isSuperAdmin) throw new Error("Only a Super Admin can manage backups.");
  return user;
}

export async function saveBackupSettings(_: FormState, fd: FormData): Promise<FormState> {
  const user = await superAdmin();
  if (!canStoreSecrets()) return { error: "Set SIP_SECRET_KEY (or CRON_SECRET) on the server first — it's used to encrypt the Google keys." };
  const cur = await backupConfig();
  // The keys fields only appear when the keys aren't set on the server.
  const clientId = fd.has("clientId") ? str(fd, "clientId") : cur.clientId ?? "";
  const secret = str(fd, "clientSecret");
  const keepDays = Math.max(7, Math.min(365, Number(str(fd, "keepDays")) || 30));
  const changedClient = clientId !== (cur.clientId ?? "");
  await saveBackupConfig({
    clientId, clientSecret: secret || cur.clientSecret, keepDays, includeFiles: fd.get("includeFiles") === "on",
    ...(changedClient ? { refreshToken: null, email: null, folderId: null } : {}),
  });
  await audit(user.id, "update", "backup", null, "Backup settings saved");
  revalidatePath("/settings/backup");
  return { ok: true, message: changedClient ? "Saved. Now press Connect Google Drive." : "Saved." };
}

export async function disconnectDrive() {
  const user = await superAdmin();
  await saveBackupConfig({ refreshToken: null, email: null, folderId: null });
  await audit(user.id, "update", "backup", null, "Disconnected Google Drive");
  revalidatePath("/settings/backup");
}

export async function backupNow() {
  const user = await superAdmin();
  await audit(user.id, "create", "backup", null, "Started a backup");
  after(() => runBackup("manual").catch(() => {}));
  revalidatePath("/settings/backup");
}
