"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { FormState } from "@/lib/utils";
import { analyzeBitrix, importBitrix, readBitrixFiles, type BitrixFiles } from "@/lib/bitrix-import";

// Checked files wait here (memory only, never on disk) until the Super Admin confirms. A restart just means re-uploading.
const pending = ((globalThis as unknown as { __bitrixPending?: Map<string, { files: BitrixFiles; actorId: string; at: number }> }).__bitrixPending ??= new Map());

export type BitrixState = { error?: string; id?: string; preview?: Awaited<ReturnType<typeof analyzeBitrix>>; done?: Awaited<ReturnType<typeof importBitrix>> } | undefined;

export async function bitrixStep(prev: BitrixState, fd: FormData): Promise<BitrixState> {
  const user = await requireUser();
  if (!user.isSuperAdmin) return { error: "Only a Super Admin can do this." };
  const step = String(fd.get("step"));
  if (step === "check") {
    const files = await Promise.all(fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).map(async (f) => ({ name: f.name, text: await f.text() })));
    if (!files.length) return { error: "Choose the Bitrix CSV files (you can select all of them at once)." };
    const parsed = readBitrixFiles(files);
    if (!parsed.leads.length) return { error: "None of the files is the leads report (it has columns like full_name, status_name, assigned_by_name)." };
    for (const [k, v] of pending) if (Date.now() - v.at > 30 * 60_000) pending.delete(k);
    const id = randomBytes(12).toString("hex");
    pending.set(id, { files: parsed, actorId: user.id, at: Date.now() });
    return { id, preview: await analyzeBitrix(parsed) };
  }
  if (step === "import") {
    const p = pending.get(String(fd.get("id")));
    if (!p || p.actorId !== user.id) return { error: "Please upload the files again (they were checked too long ago or the server restarted)." };
    try {
      // Responsible person chosen per Bitrix name in the preview (owner:<name> → AMS user id).
      const owners = Object.fromEntries([...fd.entries()].filter(([k, v]) => k.startsWith("owner:") && typeof v === "string" && v).map(([k, v]) => [k.slice(6), String(v)]));
      const done = await importBitrix(p.files, { deleteDemo: fd.get("deleteDemo") === "on", userId: user.id, owners });
      pending.delete(String(fd.get("id")));
      await audit(user.id, "import", "lead", null, `Bitrix import: ${done.leads} leads, ${done.activities} activities, ${done.history} stage changes${done.failed ? `, ${done.failed} rows failed` : ""}${done.deleted ? `, ${done.deleted} demo leads deleted` : ""}`);
      revalidatePath("/crm/leads");
      return { done };
    } catch (e) {
      return { ...prev, error: `Import stopped: ${e instanceof Error ? e.message.slice(0, 300) : "unknown error"}` };
    }
  }
  return undefined;
}

// Direct connection: reading everything from Bitrix takes a few minutes, so it runs in the background and the page
// asks how it's going every few seconds. When it's done the data waits in `pending` like checked files do.
type FetchJob = { actorId: string; step: string; at: number; error?: string; result?: { id: string; preview: Awaited<ReturnType<typeof analyzeBitrix>>; people: number } };
const jobs = ((globalThis as unknown as { __bitrixJobs?: Map<string, FetchJob> }).__bitrixJobs ??= new Map());

export async function startBitrixFetch(webhook: string): Promise<{ job?: string; error?: string }> {
  const user = await requireUser();
  if (!user.isSuperAdmin || user.viewAs) return { error: "Only a Super Admin can do this." };
  const { fetchFromBitrix, webhookBase } = await import("@/lib/bitrix-api");
  if (!webhookBase(webhook)) return { error: "That isn't a Bitrix webhook link. It looks like https://yourcompany.bitrix24.com/rest/1/abc123…/" };
  if ([...jobs.values()].some((j) => !j.error && !j.result)) return { error: "Bitrix is already being read. Wait for it to finish." };
  for (const [k, v] of jobs) if (Date.now() - v.at > 60 * 60_000) jobs.delete(k);
  const job = randomBytes(12).toString("hex");
  const j: FetchJob = { actorId: user.id, step: "Starting…", at: Date.now() };
  jobs.set(job, j);
  void (async () => {
    try {
      const files = await fetchFromBitrix(webhook, (step) => { j.step = step; });
      if (!files.leads.length) throw new Error("Bitrix returned no leads. Check the webhook has the CRM permission.");
      const id = randomBytes(12).toString("hex");
      pending.set(id, { files, actorId: user.id, at: Date.now() });
      j.result = { id, preview: await analyzeBitrix(files), people: files.people };
      j.step = "Done";
    } catch (e) {
      j.error = e instanceof Error ? e.message.slice(0, 400) : "Something went wrong reading Bitrix.";
    }
  })();
  return { job };
}

export async function bitrixFetchStatus(job: string): Promise<{ step?: string; error?: string; result?: FetchJob["result"]; seconds?: number }> {
  const user = await requireUser();
  const j = jobs.get(job);
  if (!j || j.actorId !== user.id) return { error: "This reading isn't running any more (the server may have restarted). Start again." };
  return { step: j.step, error: j.error, result: j.result, seconds: Math.round((Date.now() - j.at) / 1000) };
}

/** Start fresh: back up every lead to Excel on the server, then delete them all. Needs the words typed to confirm. */
export async function deleteAllLeads(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin || user.viewAs) return { error: "Only a Super Admin can do this." };
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "DELETE ALL LEADS") return { error: "Type DELETE ALL LEADS to confirm." };
  let deleted = 0;
  try {
    const { backupAndDeleteAllLeads } = await import("@/lib/lead-wipe");
    const r = await backupAndDeleteAllLeads();
    deleted = r.deleted;
    await audit(user.id, "delete", "lead", null, `Deleted all ${r.deleted} leads before re-importing (backup: ${r.backup ?? "none"})`);
  } catch (e) {
    return { error: `Nothing deleted: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}` };
  }
  revalidatePath("/crm/leads");
  // The form disappears once there are no leads, so the confirmation goes on the page itself.
  redirect(`/settings/bitrix-import?deleted=${deleted}`);
}
