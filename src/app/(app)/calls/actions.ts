"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { phoneKey } from "@/lib/crm-shared";
import { OUTCOMES, convertToLead, importNumbers, makeBatches, parseNumbers, recordOutcome, type Outcome } from "@/lib/calls";
import { linkRecording } from "@/lib/softphone";
import { str, type FormState } from "@/lib/utils";

/** Campaigns, numbers and batches: supervisors (calls with company-wide create rights) and Super Admins. */
const manager = (u: SessionUser) => u.isSuperAdmin || scopeFor(u, "calls", "create") === "all";
const refresh = () => ["/calls", "/calls/campaigns", "/calls/wallboard", "/calls/callbacks"].forEach((p) => revalidatePath(p));

export async function saveCampaign(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can manage campaigns." };
  const name = str(fd, "name").slice(0, 120);
  if (!name) return { error: "Name the campaign." };
  const data = {
    name, description: str(fd, "description") || null, script: str(fd, "script").slice(0, 8000) || null, waMessage: str(fd, "waMessage").slice(0, 1000) || null,
    maxAttempts: Math.max(1, Math.min(10, Number(str(fd, "maxAttempts")) || 3)), sourceName: str(fd, "sourceName") || null,
  };
  const id = str(fd, "id");
  const c = id ? await db.callCampaign.update({ where: { id }, data }) : await db.callCampaign.create({ data: { ...data, createdById: user.id } });
  await audit(user.id, id ? "update" : "create", "callCampaign", c.id, `Campaign ${name}`);
  refresh();
  redirect(`/calls/campaigns/${c.id}`);
}

export async function setCampaignStatus(fd: FormData) {
  const user = await requireUser();
  if (!manager(user)) return;
  const status = ["active", "paused", "done"].includes(str(fd, "status")) ? str(fd, "status") : "active";
  await db.callCampaign.update({ where: { id: str(fd, "id") }, data: { status } });
  refresh();
  revalidatePath(`/calls/campaigns/${str(fd, "id")}`);
}

/** Paste numbers or upload a CSV (columns: phone/mobile and optionally name and anything else). */
export async function uploadNumbers(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can add numbers." };
  const campaignId = str(fd, "campaignId");
  const file = fd.get("file");
  const text = [str(fd, "numbers"), file instanceof File && file.size ? await file.text() : ""].filter(Boolean).join("\n");
  if (file instanceof File && file.size > 5_000_000) return { error: "The file is larger than 5 MB." };
  const rows = parseNumbers(text);
  if (!rows.length) return { error: "No phone numbers found. Paste one per line, or upload a CSV with a phone column." };
  const res = await importNumbers(campaignId, rows.slice(0, 20_000));
  await audit(user.id, "create", "callTarget", campaignId, `Imported ${res.added} number(s)`);
  revalidatePath(`/calls/campaigns/${campaignId}`);
  return { ok: true, message: `Added ${res.added} number${res.added === 1 ? "" : "s"}${res.duplicates > 0 ? `, skipped ${res.duplicates} duplicate(s)` : ""}${res.dnc ? `, ${res.dnc} on the do-not-call list` : ""}.` };
}

export async function createBatches(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can assign numbers." };
  const campaignId = str(fd, "campaignId");
  const agents = fd.getAll("agents").map(String);
  const size = Math.max(1, Math.min(5000, Number(str(fd, "size")) || 100));
  if (!agents.length) return { error: "Choose at least one agent." };
  const res = await makeBatches(campaignId, agents, size);
  if (!res.numbers) return { error: "There are no unassigned numbers left in this campaign." };
  await audit(user.id, "assign", "callBatch", campaignId, `${res.batches} batch(es), ${res.numbers} numbers`);
  revalidatePath(`/calls/campaigns/${campaignId}`);
  refresh();
  return { ok: true, message: `Made ${res.batches} batch${res.batches === 1 ? "" : "es"} (${res.numbers} numbers).` };
}

/** Moves a batch's unfinished numbers to another agent, or back to unassigned. */
export async function reassignBatch(fd: FormData) {
  const user = await requireUser();
  if (!manager(user)) return;
  const batch = await db.callBatch.findUnique({ where: { id: str(fd, "batchId") } });
  if (!batch) return;
  const to = str(fd, "agentId") || null;
  await db.callBatch.update({ where: { id: batch.id }, data: { assigneeId: to } });
  await db.callTarget.updateMany({ where: { batchId: batch.id, status: { in: ["new", "retry", "callback"] } }, data: { assigneeId: to } });
  revalidatePath(`/calls/campaigns/${batch.campaignId}`);
}

/** The agent's result for the number on screen (optionally sending an interested caller to the CRM). */
export async function logCall(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can(user, "calls", "edit")) return { error: "You can't log calls." };
  const target = await db.callTarget.findUnique({ where: { id: str(fd, "targetId") } });
  if (!target || (target.assigneeId !== user.id && !manager(user))) return { error: "This number isn't assigned to you." };
  const o = str(fd, "outcome") as Outcome;
  if (!OUTCOMES.some((x) => x.value === o)) return { error: "Choose what happened." };
  const callbackAt = str(fd, "callbackAt") ? new Date(str(fd, "callbackAt")) : null;
  // Softphone calls send the real talk time and the SIP Call-ID; phone-link calls are timed from the click.
  const started = Number(str(fd, "startedAt"));
  const talk = str(fd, "talkSec") === "" ? NaN : Number(str(fd, "talkSec"));
  const durationSec = Number.isFinite(talk) ? Math.max(0, Math.min(14_400, Math.round(talk))) : started > 0 ? Math.max(0, Math.min(7200, Math.round((Date.now() - started) / 1000))) : null;
  const pbxCallId = str(fd, "callId").slice(0, 200) || null;
  const res = await recordOutcome({ targetId: target.id, agentId: user.id, outcome: o, notes: str(fd, "notes").slice(0, 2000) || null, callbackAt, durationSec, pbxCallId });
  if ("error" in res) return { error: res.error };
  if (pbxCallId) await linkRecording(pbxCallId, user.id);
  let extra = "";
  if (o === "interested" && fd.get("toCrm") === "on") {
    const lead = await convertToLead(target.id, user.name);
    extra = "error" in lead ? ` (${lead.error})` : lead.merged ? " · added to the existing lead in the CRM" : " · sent to the CRM as a new lead";
  }
  refresh();
  return { ok: true, message: `Saved${extra}. Next number loaded.` };
}

export async function sendTargetToCrm(fd: FormData) {
  const user = await requireUser();
  const t = await db.callTarget.findUnique({ where: { id: str(fd, "targetId") } });
  if (!t || !can(user, "calls", "edit") || (t.assigneeId !== user.id && !manager(user))) return;
  await convertToLead(t.id, user.name);
  revalidatePath(`/calls/campaigns/${t.campaignId}`);
  refresh();
}

export async function addDnc(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can edit the do-not-call list." };
  const keys = str(fd, "numbers").split(/[\n,]/).map((x) => phoneKey(x.trim())).filter(Boolean) as string[];
  if (!keys.length) return { error: "Enter at least one number." };
  for (const k of keys) await db.dncNumber.upsert({ where: { phoneKey: k }, update: {}, create: { phoneKey: k, reason: str(fd, "reason") || "Added by supervisor" } });
  await db.callTarget.updateMany({ where: { phoneKey: { in: keys }, status: { in: ["new", "retry", "callback"] } }, data: { status: "dnc" } });
  revalidatePath("/calls/dnc");
  return { ok: true, message: `Added ${keys.length} number(s).` };
}

export async function removeDnc(fd: FormData) {
  const user = await requireUser();
  if (!manager(user)) return;
  await db.dncNumber.deleteMany({ where: { id: str(fd, "id") } });
  revalidatePath("/calls/dnc");
}
