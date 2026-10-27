"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteUpload } from "@/lib/files";
import { str } from "@/lib/utils";

/** Super Admin: deletes a recording's audio (the row stays, marked deleted, so the audit trail is complete). */
export async function deleteRecording(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const rec = await db.callRecording.findUnique({ where: { id: str(fd, "id") } });
  if (!rec || rec.deletedAt) return;
  if (rec.path) await deleteUpload(rec.path);
  await db.callRecording.update({ where: { id: rec.id }, data: { deletedAt: new Date(), path: null } });
  await db.callLog.updateMany({ where: { recordingId: rec.id }, data: { recordingPath: null } });
  await audit(user.id, "delete", "callRecording", rec.id, `Deleted recording of ${rec.phone} (${rec.startedAt.toISOString().slice(0, 16).replace("T", " ")})`);
  revalidatePath("/calls/recordings");
}
