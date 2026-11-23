"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { phoneKey } from "@/lib/crm-shared";
import { OUTCOMES, convertToLead, importNumbers, isCallSupervisor, makeBatches, parseNumbers, recordOutcome, type Outcome } from "@/lib/calls";
import { linkRecording } from "@/lib/softphone";
import { str, type FormState } from "@/lib/utils";

/** Campaigns, numbers and batches: supervisors (calls with company-wide create rights) and Super Admins. */
const manager = (u: SessionUser) => isCallSupervisor(u);
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
  if (!agents.length) return { error: "Tick at least one agent." };
  // "Give batches": each ticked agent gets their own number of batches. "Split all": everything left, shared equally.
  const plan = str(fd, "mode") === "all" ? undefined : Object.fromEntries(agents.map((a) => [a, Math.max(0, Math.min(100, Math.floor(Number(str(fd, `count_${a}`)) || 0)))]));
  if (plan && !Object.values(plan).some((n) => n > 0)) return { error: "Enter how many batches each ticked agent gets (or use Split all equally)." };
  const res = await makeBatches(campaignId, agents, size, plan);
  if (!res.numbers) return { error: "There are no unassigned numbers left in this campaign." };
  await audit(user.id, "assign", "callBatch", campaignId, `${res.batches} batch(es), ${res.numbers} numbers`);
  revalidatePath(`/calls/campaigns/${campaignId}`);
  refresh();
  return { ok: true, message: `Made ${res.batches} batch${res.batches === 1 ? "" : "es"} (${res.numbers} numbers).${res.left ? ` ${res.left} number(s) still unassigned.` : ""}` };
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

/** A practice campaign with clearly fake numbers (0300-0000xxx), to try the dialer, batches and reports safely. */
export async function createDemoCampaign() {
  const user = await requireUser();
  if (!manager(user)) return;
  const names = ["Ahmed Raza", "Sana Iqbal", "Bilal Khan", "Ayesha Siddiqui", "Usman Ali", "Hira Javed", "Faisal Mehmood", "Mariam Tariq", "Hamza Sheikh", "Zainab Akhtar", "Omar Farooq", "Nida Hassan", "Kamran Butt", "Saba Qureshi", "Imran Malik", "Fatima Noor", "Adeel Aslam", "Rabia Yousuf", "Junaid Iqbal", "Mehwish Anwar", "Talha Rauf", "Iqra Saleem", "Shahid Latif", "Amna Rashid", "Waqas Ahmed", "Komal Shah", "Danish Raza", "Sadia Khalid", "Arslan Haider", "Maham Zafar"];
  const areas = ["DHA Phase 8", "Bahria Town Karachi", "Scheme 33", "Clifton", "DHA Phase 6", "Gulshan-e-Iqbal"];
  const budgets = ["50 Lac", "90 Lac", "1.5 Cr", "2.5 Cr", "4 Cr"];
  const n = (await db.callCampaign.count({ where: { name: { startsWith: "Demo practice campaign" } } })) + 1;
  const c = await db.callCampaign.create({ data: {
    name: `Demo practice campaign${n > 1 ? ` ${n}` : ""}`, description: "DEMO: fake numbers (0300-0000xxx) for practice. Safe to delete.", createdById: user.id, sourceName: "Demo",
    script: "Assalam-o-Alaikum {{name}}, this is {{agent}} from The Advisor Associates.\n\nYou enquired about property earlier. We have new options in your area with easy installments.\n\nWould you like the details on WhatsApp, or shall we book a site visit this week?",
    waMessage: "Assalam-o-Alaikum {{name}}, {{agent}} here from The Advisor Associates. Sharing the details we discussed. Reply to book a site visit.",
  } });
  const rows = names.map((name, i) => ({ name, phone: `0300${String(n * 1000 + i + 1).padStart(7, "0")}`, extra: { area: areas[i % areas.length]!, budget: budgets[i % budgets.length]!, source: i % 2 ? "Facebook" : "Zameen" } }));
  await importNumbers(c.id, rows as never);
  await audit(user.id, "create", "callCampaign", c.id, `Demo campaign (${rows.length} fake numbers)`);
  refresh();
  redirect(`/calls/campaigns/${c.id}`);
}

/** The agent's end-of-day feedback for their calls report (can be updated until the day ends). */
export async function saveCallFeedback(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const feedback = str(fd, "feedback").slice(0, 2000);
  if (!feedback) return { error: "Write a line about how the calls went." };
  const { pkDay } = await import("@/lib/call-daily");
  const date = pkDay().date;
  await db.callDayNote.upsert({ where: { agentId_date: { agentId: user.id, date } }, update: { feedback }, create: { agentId: user.id, date, feedback } });
  revalidatePath("/calls");
  return { ok: true, message: "Saved. It goes into today's calls report." };
}

/** How this agent calls: "system" (click to call through AMS) or "landline" (dial the number by hand). */
export async function setCallMode(fd: FormData) {
  const user = await requireUser();
  const mode = str(fd, "mode") === "landline" ? "landline" : "system";
  const key = `calls.mode.${user.id}`;
  await db.setting.upsert({ where: { key }, update: { value: mode }, create: { key, value: mode } });
  revalidatePath("/calls");
}

// ── Sheet import with column picking: step 1 reads the file and guesses, step 2 imports with the chosen columns.
type SheetHold = { campaignId: string; userId: string; at: number; headers: string[]; rows: Record<string, string>[] };
const sheets: Map<string, SheetHold> = ((globalThis as unknown as { __callSheets?: Map<string, SheetHold> }).__callSheets ??= new Map());
export type SheetState = { error?: string; ok?: boolean; message?: string; id?: string; headers?: string[]; sample?: string[][]; total?: number; guess?: string[] } | undefined;

export async function previewSheet(_: SheetState, fd: FormData): Promise<SheetState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can add numbers." };
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a CSV or Excel (.xlsx) file." };
  if (file.size > 10_000_000) return { error: "The file is larger than 10 MB." };
  const { readSheetFile } = await import("@/lib/sheet-read");
  let sheet: Awaited<ReturnType<typeof readSheetFile>>;
  try { sheet = await readSheetFile(file); } catch { return { error: "Couldn't read that file. Save it as .xlsx or .csv and try again." }; }
  const headers = sheet.headers.filter(Boolean);
  if (!headers.length || !sheet.rows.length) return { error: "The file has no rows (the first row should be the column names)." };
  for (const [k, v] of sheets) if (Date.now() - v.at > 30 * 60_000) sheets.delete(k);
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sheets.set(id, { campaignId: str(fd, "campaignId"), userId: user.id, at: Date.now(), headers, rows: sheet.rows.slice(0, 20_000) });
  // Best guesses: the first phone-like column is Phone, the next one Second phone, a name column is Name; the rest
  // are shown to the agent.
  let phones = 0;
  const guess = headers.map((h) => {
    const looksPhone = /phone|mobile|cell|contact|whatsapp|number|tel/.test(h) && !/unit|plot|flat|cnic|passport|file|id$/.test(h);
    if (looksPhone && phones < 2) return phones++ === 0 ? "phone" : "phone2";
    if (/^(full )?name$|client name|customer name|^name /.test(h)) return "name";
    return "detail";
  });
  if (!guess.includes("phone")) { const i = headers.findIndex((_, i) => sheet.rows.slice(0, 20).some((r) => (r[headers[i]!] ?? "").replace(/\D/g, "").length >= 9)); if (i >= 0) guess[i] = "phone"; }
  return { id, headers, sample: sheet.rows.slice(0, 4).map((r) => headers.map((h) => r[h] ?? "")), total: sheet.rows.length, guess };
}

export async function importSheet(_: SheetState, fd: FormData): Promise<SheetState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can add numbers." };
  const hold = sheets.get(str(fd, "id"));
  if (!hold || hold.userId !== user.id) return { error: "Please choose the file again (it was read too long ago)." };
  const role = hold.headers.map((_, i) => str(fd, `col_${i}`) || "skip");
  const label = hold.headers.map((h, i) => (str(fd, `label_${i}`) || h).slice(0, 60));
  const pi = role.indexOf("phone");
  if (pi < 0) return { error: "Choose which column has the phone number." };
  const p2 = role.indexOf("phone2"), ni = role.indexOf("name");
  const rows = hold.rows.map((r) => {
    const v = (i: number) => (i >= 0 ? (r[hold.headers[i]!] ?? "").trim() : "");
    const extra: Record<string, string> = {};
    role.forEach((x, i) => { if (x === "detail" && v(i)) extra[label[i]!] = v(i).slice(0, 500); });
    if (v(p2)) extra["Other phone"] = v(p2);
    return { phone: v(pi), name: v(ni) || null, extra: Object.keys(extra).length ? extra : null };
  }).filter((r) => (phoneKey(r.phone) ?? "").length >= 7); // a real number, not a name or a unit code
  if (!rows.length) return { error: "No phone numbers found in that column (a phone needs at least 7 digits). Check which column you chose as Phone number." };
  const res = await importNumbers(hold.campaignId, rows);
  sheets.delete(str(fd, "id"));
  await audit(user.id, "create", "callTarget", hold.campaignId, `Imported ${res.added} number(s) from a sheet`);
  revalidatePath(`/calls/campaigns/${hold.campaignId}`);
  return { ok: true, message: `Added ${res.added} number${res.added === 1 ? "" : "s"}${res.duplicates > 0 ? `, skipped ${res.duplicates} duplicate(s)` : ""}${res.dnc ? `, ${res.dnc} on the do-not-call list` : ""}. Agents see the columns you chose on each call.` };
}
