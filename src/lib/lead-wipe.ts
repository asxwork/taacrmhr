// "Start fresh" before re-importing every lead (Settings → Import from Bitrix): saves a full Excel backup of every
// lead with its activities on the server first, then deletes all leads. Super Admin only.
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "date-fns";
import { db } from "./db";
import { UPLOAD_ROOT } from "./files";
import { exportLeadsWorkbook } from "./lead-backup";
import { restartHoldClock } from "./lead-hold-core";

export const LEAD_BACKUP_DIR = path.join(UPLOAD_ROOT, "lead-backups");

/** Backup first, then delete in batches (activities, views and rule runs go with each lead; deals stay, unlinked). */
export async function backupAndDeleteAllLeads() {
  const total = await db.lead.count();
  if (!total) return { deleted: 0, backup: null as string | null };
  const { buffer, leads } = await exportLeadsWorkbook({});
  await mkdir(LEAD_BACKUP_DIR, { recursive: true });
  const name = `leads-before-delete-${format(new Date(), "yyyy-MM-dd-HHmm")}.xlsx`;
  await writeFile(path.join(LEAD_BACKUP_DIR, name), buffer);
  if (leads < total) throw new Error(`The backup has ${leads} of ${total} leads, so nothing was deleted.`);
  let deleted = 0;
  for (;;) {
    const ids = (await db.lead.findMany({ select: { id: true }, take: 500 })).map((l) => l.id);
    if (!ids.length) break;
    deleted += (await db.lead.deleteMany({ where: { id: { in: ids } } })).count;
  }
  await restartHoldClock(db);
  return { deleted, backup: name };
}

/** Backups saved before earlier deletes, newest first. */
export async function leadBackups() {
  const names = await readdir(LEAD_BACKUP_DIR).catch(() => [] as string[]);
  const rows = await Promise.all(names.filter((n) => /^leads-before-delete-[\d-]+\.xlsx$/.test(n)).map(async (n) => ({ name: n, size: (await stat(path.join(LEAD_BACKUP_DIR, n))).size })));
  return rows.sort((a, b) => b.name.localeCompare(a.name));
}
