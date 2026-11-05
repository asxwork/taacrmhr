"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { smtpConfigured } from "@/lib/mail";
import { addHrData, clearForFreshImport, parseHrFiles, sendWelcomeToAll, type HrFiles, type HrPreview, type ParsedHr } from "@/lib/hr-import";

// Checked files wait here (memory only, never on disk) until the Super Admin confirms. A restart just means re-uploading.
const pending = new Map<string, { parsed: ParsedHr; actorId: string; at: number }>();
const TTL = 30 * 60_000;

export type HrImportState = { error?: string; preview?: HrPreview; id?: string; done?: Awaited<ReturnType<typeof addHrData>> & { cleared?: Awaited<ReturnType<typeof clearForFreshImport>> }; welcome?: { sent: number; failed: string[] } } | undefined;

async function superAdmin() {
  const user = await requireUser();
  return user.isSuperAdmin ? user : null;
}

export async function checkHrFiles(_: HrImportState, fd: FormData): Promise<HrImportState> {
  const user = await superAdmin();
  if (!user) return { error: "Only a Super Admin can do this." };
  const read = async (name: string) => { const f = fd.get(name); return f instanceof File && f.size > 0 ? f.arrayBuffer() : undefined; };
  const employee = await read("employee");
  if (!employee) return { error: "Choose the Employee detail file. The others are optional." };
  const files: HrFiles = { employee, attendance: await read("attendance"), salary: await read("salary"), leave: await read("leave"), probation: await read("probation") };
  try {
    const res = await parseHrFiles(files);
    if ("error" in res) return { error: res.error };
    for (const [k, v] of pending) if (Date.now() - v.at > TTL) pending.delete(k);
    const id = randomBytes(12).toString("hex");
    pending.set(id, { parsed: res.parsed, actorId: user.id, at: Date.now() });
    return { preview: res.preview, id };
  } catch (e) {
    return { error: `Couldn't read the files: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}

export async function confirmHrImport(state: HrImportState, fd: FormData): Promise<HrImportState> {
  const user = await superAdmin();
  if (!user) return { error: "Only a Super Admin can do this." };
  const job = pending.get(String(fd.get("id") ?? ""));
  if (!job || job.actorId !== user.id) return { error: "That check has expired. Upload the files again." };
  try {
    const fresh = fd.get("fresh") === "on";
    if (fresh && String(fd.get("confirm") ?? "").trim() !== "DELETE") return { ...state, error: "Type DELETE to confirm starting fresh." };
    const cleared = fresh ? await clearForFreshImport(user.id) : undefined;
    const done = { ...(await addHrData(job.parsed, { id: user.id, email: user.email })), cleared };
    pending.delete(String(fd.get("id")));
    revalidatePath("/", "layout");
    return { done };
  } catch (e) {
    return { ...state, error: `The import stopped: ${e instanceof Error ? e.message.slice(0, 400) : "unknown error"}. Nothing was deleted; run it again and it continues, skipping what was already added.` };
  }
}

export async function emailEveryone(state: HrImportState): Promise<HrImportState> {
  const user = await superAdmin();
  if (!user) return { error: "Only a Super Admin can do this." };
  if (!smtpConfigured()) return { ...state, error: "Email isn't set up yet. See Settings → Integrations." };
  return { ...state, error: undefined, welcome: await sendWelcomeToAll(user.id) };
}
