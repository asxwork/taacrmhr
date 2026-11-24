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
    dialPrefix: str(fd, "dialPrefix").replace(/[^0-9*#+]/g, "").slice(0, 10) || null,
    kind: str(fd, "kind") === "sales" ? "sales" : "csr",
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
  await (await import("@/lib/call-files")).keepImportFile(campaignId, file instanceof File && file.size ? file.name : "pasted numbers.txt", text);
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
    const lead = await convertToLead(target.id, user.name, user.id);
    extra = "error" in lead ? ` (${lead.error})` : lead.merged ? " · added to the existing lead in the CRM" : " · sent to the CRM as a new lead";
  }
  refresh();
  return { ok: true, message: `Saved${extra}. Next number loaded.` };
}

export async function sendTargetToCrm(fd: FormData) {
  const user = await requireUser();
  const t = await db.callTarget.findUnique({ where: { id: str(fd, "targetId") } });
  if (!t || !can(user, "calls", "edit") || (t.assigneeId !== user.id && !manager(user))) return;
  await convertToLead(t.id, user.name, user.id);
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
  // The exact file is kept on the server for Super Admins (Campaign → Imported files).
  await (await import("@/lib/call-files")).keepImportFile(str(fd, "campaignId"), file.name, await file.arrayBuffer());
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
    if (/^first ?name|^given name|^fname$/.test(h)) return "first";
    if (/^last ?name|^surname|^family name|^lname$/.test(h)) return "last";
    if (/(^|\b)(full )?name$|^name\b|client|customer|buyer|owner name|contact name/.test(h) && !/project|unit|building|company|agent|developer|tower|file|deal(?! ?owner)/.test(h)) return "name";
    return "detail";
  });
  // One column per role: keep the first guess for name / first / last.
  for (const r of ["name", "first", "last"]) { let seen = false; guess.forEach((g, i) => { if (g === r) { if (seen) guess[i] = "detail"; seen = true; } }); }
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
  const p2 = role.indexOf("phone2"), ni = role.indexOf("name"), fi = role.indexOf("first"), li = role.indexOf("last");
  const rows = hold.rows.map((r) => {
    const v = (i: number) => (i >= 0 ? (r[hold.headers[i]!] ?? "").trim() : "");
    const extra: Record<string, string> = {};
    role.forEach((x, i) => { if ((x === "detail" || x === "keep") && v(i)) extra[label[i]!] = v(i).slice(0, 500); });
    if (v(p2)) extra["Other phone"] = v(p2);
    // Full name: the Name column, else First + Last name joined.
    const name = v(ni) || [v(fi), v(li)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return { phone: v(pi), name: name || null, extra: Object.keys(extra).length ? extra : null };
  }).filter((r) => (phoneKey(r.phone) ?? "").length >= 7); // a real number, not a name or a unit code
  if (!rows.length) return { error: "No phone numbers found in that column (a phone needs at least 7 digits). Check which column you chose as Phone number." };
  const res = await importNumbers(hold.campaignId, rows);
  // "Keep, hide from agents" columns: saved with the number, left off the agent's screen.
  const keep = role.flatMap((x, i) => (x === "keep" ? [label[i]!] : []));
  if (keep.length) {
    const c = await db.callCampaign.findUnique({ where: { id: hold.campaignId }, select: { hiddenFields: true } });
    const before: string[] = (() => { try { return JSON.parse(c?.hiddenFields ?? "[]"); } catch { return []; } })();
    await db.callCampaign.update({ where: { id: hold.campaignId }, data: { hiddenFields: JSON.stringify([...new Set([...before, ...keep])]) } });
  }
  sheets.delete(str(fd, "id"));
  await audit(user.id, "create", "callTarget", hold.campaignId, `Imported ${res.added} number(s) from a sheet`);
  revalidatePath(`/calls/campaigns/${hold.campaignId}`);
  return { ok: true, message: `Added ${res.added} number${res.added === 1 ? "" : "s"}${res.duplicates > 0 ? `, skipped ${res.duplicates} duplicate(s)` : ""}${res.dnc ? `, ${res.dnc} on the do-not-call list` : ""}. Agents see the columns you chose on each call.` };
}

/** Campaigns list → bulk: activate, pause, mark done or delete (numbers and batches go too; calls made stay in History). */
export async function bulkCampaigns(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can manage campaigns." };
  const ids = [...new Set(fd.getAll("ids").map(String).filter(Boolean))];
  const op = str(fd, "op");
  if (!ids.length) return { error: "Tick at least one campaign." };
  if (op === "delete") {
    const n = (await db.callCampaign.deleteMany({ where: { id: { in: ids } } })).count;
    await audit(user.id, "delete", "callCampaign", null, `Deleted ${n} campaign(s)`);
    refresh();
    return { ok: true, message: `${n} campaign(s) deleted.` };
  }
  if (!["active", "paused", "done"].includes(op)) return { error: "Choose what to do." };
  const n = (await db.callCampaign.updateMany({ where: { id: { in: ids } }, data: { status: op } })).count;
  refresh();
  return { ok: true, message: `${n} campaign(s) set to ${op}.` };
}

export async function deleteCampaign(fd: FormData) {
  const user = await requireUser();
  if (!manager(user)) return;
  const c = await db.callCampaign.findUnique({ where: { id: str(fd, "id") } });
  if (!c) return;
  await db.callCampaign.delete({ where: { id: c.id } });
  await audit(user.id, "delete", "callCampaign", c.id, `Deleted campaign ${c.name}`);
  refresh();
  redirect("/calls/campaigns");
}

/** A campaign's numbers → bulk: give to an agent, back to unassigned, call again, do not call, or delete. */
export async function bulkTargets(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can change numbers." };
  const ids = [...new Set(fd.getAll("ids").map(String).filter(Boolean))];
  const op = str(fd, "op");
  if (!ids.length) return { error: "Tick at least one number." };
  const where = { id: { in: ids } };
  let n = 0, msg = "";
  if (op === "delete") { n = (await db.callTarget.deleteMany({ where })).count; msg = "deleted"; }
  else if (op === "unassign") { n = (await db.callTarget.updateMany({ where, data: { assigneeId: null, batchId: null } })).count; msg = "back to unassigned"; }
  else if (op === "assign") {
    const to = str(fd, "value");
    if (!(await db.user.findFirst({ where: { id: to, active: true } }))) return { error: "Choose an agent." };
    n = (await db.callTarget.updateMany({ where, data: { assigneeId: to } })).count; msg = "given to the agent";
  } else if (op === "reset") { n = (await db.callTarget.updateMany({ where, data: { status: "new", outcome: null, attempts: 0, callbackAt: null } })).count; msg = "set to call again"; }
  else if (op === "dnc") {
    const rows = await db.callTarget.findMany({ where, select: { phoneKey: true } });
    for (const k of new Set(rows.map((r) => r.phoneKey))) await db.dncNumber.upsert({ where: { phoneKey: k }, update: {}, create: { phoneKey: k, reason: `Bulk, by ${user.name}` } });
    n = (await db.callTarget.updateMany({ where, data: { status: "dnc" } })).count; msg = "put on the do-not-call list";
  } else return { error: "Choose what to do." };
  await audit(user.id, "update", "callTarget", null, `Bulk ${op} on ${n} number(s)`);
  refresh();
  revalidatePath("/calls/campaigns/[id]", "page");
  return { ok: true, message: `${n} number(s) ${msg}.` };
}

/** Campaign → "What agents see": tick the sheet columns agents see on the dialer; the rest stay hidden (still saved). */
export async function saveVisibleFields(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can change this." };
  const id = str(fd, "campaignId");
  const all = fd.getAll("field").map(String);
  const shown = new Set(fd.getAll("show").map(String));
  await db.callCampaign.update({ where: { id }, data: { hiddenFields: JSON.stringify(all.filter((f) => !shown.has(f))) } });
  revalidatePath(`/calls/campaigns/${id}`);
  revalidatePath("/calls");
  return { ok: true, message: "Saved. Agents see the ticked details on their next number." };
}

/** Campaign → Call order: top, bottom, random or by a column (A→Z / Z→A). Re-orders the numbers straight away. */
export async function saveCallOrder(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only calling supervisors can change this." };
  const id = str(fd, "campaignId");
  const order = ["top", "bottom", "random", "column"].includes(str(fd, "order")) ? str(fd, "order") : "top";
  const field = str(fd, "field");
  if (order === "column" && !field) return { error: "Choose the column to sort by." };
  await db.callCampaign.update({ where: { id }, data: { callOrder: order, orderField: order === "column" ? field.slice(0, 120) : null, orderDesc: order === "column" && str(fd, "desc") === "1" } });
  const { applyCallOrder } = await import("@/lib/calls");
  const n = await applyCallOrder(id);
  await audit(user.id, "update", "callCampaign", id, `Call order: ${order}${order === "column" ? ` by ${field}${str(fd, "desc") === "1" ? " (Z→A)" : ""}` : ""}`);
  revalidatePath(`/calls/campaigns/${id}`);
  return { ok: true, message: `Call order saved: ${n.toLocaleString()} number(s) put in order. New batches and agents' next numbers follow it.` };
}

/**
 * Agent: "Mark as completed" for their share of a campaign once none of their numbers is still uncalled. Their numbers
 * waiting for another try stop coming back (due callbacks stay), their batches show as completed, supervisors are told,
 * and a campaign with nothing left to call becomes done.
 */
export async function completeMyNumbers(fd: FormData) {
  const user = await requireUser();
  if (!can(user, "calls", "edit")) return;
  const campaignId = str(fd, "campaignId");
  const mine = { campaignId, assigneeId: user.id };
  if (await db.callTarget.count({ where: { ...mine, status: "new" } })) return; // still uncalled numbers
  const closed = (await db.callTarget.updateMany({ where: { ...mine, status: "retry" }, data: { status: "done" } })).count;
  await db.callBatch.updateMany({ where: { campaignId, assigneeId: user.id, completedAt: null }, data: { completedAt: new Date() } });
  const c = await db.callCampaign.findUnique({ where: { id: campaignId }, select: { name: true } });
  const total = await db.callTarget.count({ where: mine });
  await audit(user.id, "update", "callBatch", campaignId, `${user.name} completed their ${total} number(s) in ${c?.name}${closed ? ` (${closed} not reached closed)` : ""}`);
  // Nothing left to call anywhere in the campaign: it's done.
  const left = await db.callTarget.count({ where: { campaignId, status: { in: ["new", "retry", "callback"] } } });
  if (!left) await db.callCampaign.update({ where: { id: campaignId }, data: { status: "done" } });
  const { notify } = await import("@/lib/notify");
  const supervisors = await db.user.findMany({ where: { active: true, OR: [{ isSuperAdmin: true }, { roles: { some: { role: { permissions: { some: { module: "calls", action: "assign", scope: "all" } } } } } }] }, select: { id: true } });
  for (const s of supervisors) if (s.id !== user.id) await notify(s.id, `${user.name} completed their numbers: ${c?.name ?? "campaign"}`, { body: `${total} number(s)${left ? `, ${left} still open in the campaign` : ", campaign finished"}.`, link: `/calls/campaigns/${campaignId}` }).catch(() => {});
  refresh();
}

/** Agent: fix the remarks of one of their own 3 latest calls (older calls can't be changed). */
export async function editCallRemarks(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "logId");
  const latest = await db.callLog.findMany({ where: { agentId: user.id }, orderBy: { startedAt: "desc" }, take: 3, select: { id: true, notes: true, targetId: true } });
  const log = latest.find((l) => l.id === id);
  if (!log) return { error: "Only your last 3 calls can be changed." };
  const notes = str(fd, "notes").slice(0, 4000) || null;
  await db.callLog.update({ where: { id }, data: { notes } });
  // The number's running notes carry the same words: swap the old remark for the new one there too.
  if (log.targetId && log.notes !== notes) {
    const t = await db.callTarget.findUnique({ where: { id: log.targetId }, select: { notes: true } });
    if (t) {
      const old = log.notes ?? "";
      const next = old && t.notes?.includes(old) ? t.notes.replace(old, notes ?? "").replace(/\n{2,}/g, "\n").trim() : [t.notes, notes].filter(Boolean).join("\n");
      await db.callTarget.update({ where: { id: log.targetId }, data: { notes: next || null } });
    }
  }
  await audit(user.id, "update", "callLog", id, `Remarks changed by ${user.name}`);
  revalidatePath("/calls");
  revalidatePath("/calls/history");
  return { ok: true, message: "Remarks saved." };
}

/** Same agent, same number, same result within 10 minutes of the one before: a repeated entry. */
async function duplicateLogIds(from: Date, to: Date) {
  const logs = await db.callLog.findMany({ where: { startedAt: { gte: from, lt: to } }, orderBy: { startedAt: "asc" }, select: { id: true, agentId: true, phone: true, outcome: true, startedAt: true } });
  const last = new Map<string, Date>();
  const dupes: string[] = [];
  for (const l of logs) {
    const k = `${l.agentId}|${l.phone.replace(/\D/g, "")}|${l.outcome}`;
    const prev = last.get(k);
    if (prev && +l.startedAt - +prev < 10 * 60_000) dupes.push(l.id);
    else last.set(k, l.startedAt);
  }
  return dupes;
}
export async function countDuplicateLogs(from: Date, to: Date) { return (await duplicateLogIds(from, to)).length; }

/** Calls → History (Super Admin): delete the repeated entries of that day, keeping the first of each. */
export async function deleteDuplicateLogs(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const day = new Date(`${str(fd, "date")}T00:00:00`);
  if (Number.isNaN(+day)) return;
  const ids = await duplicateLogIds(day, new Date(+day + 86_400_000));
  if (ids.length) await db.callLog.deleteMany({ where: { id: { in: ids } } });
  await audit(user.id, "delete", "callLog", null, `Deleted ${ids.length} duplicate call entr${ids.length === 1 ? "y" : "ies"} on ${str(fd, "date")}`);
  revalidatePath("/calls/history");
}

/** Calls → History (Super Admin): delete ticked entries. */
export async function bulkCallLogs(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin) return { error: "Only a Super Admin can delete call history." };
  const ids = [...new Set(fd.getAll("ids").map(String).filter(Boolean))];
  if (!ids.length || str(fd, "op") !== "delete") return { error: "Tick entries and choose Delete." };
  const n = (await db.callLog.deleteMany({ where: { id: { in: ids } } })).count;
  await audit(user.id, "delete", "callLog", null, `Deleted ${n} call history entr${n === 1 ? "y" : "ies"}`);
  revalidatePath("/calls/history");
  return { ok: true, message: `${n} entr${n === 1 ? "y" : "ies"} deleted.` };
}
