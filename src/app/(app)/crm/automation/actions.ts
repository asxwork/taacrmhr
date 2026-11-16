"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { ingestLead } from "@/lib/lead-intake";
import { fireHook, HOOK_EVENTS, testRule, newHookSecret, type RuleActions, type RuleConditions } from "@/lib/lead-rules";
import { str, type FormState } from "@/lib/utils";

async function admin() {
  const user = await requireUser();
  if (!user.isSuperAdmin && !can(user, "settings.company", "edit")) throw new Error("Not allowed");
  return user;
}
const ids = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);
const n = (fd: FormData, k: string, d: number) => { const v = Number(str(fd, k)); return Number.isFinite(v) && v >= 0 ? v : d; };

export async function saveRule(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  const trigger = ["created", "stage", "uncontacted", "idle"].includes(str(fd, "trigger")) ? str(fd, "trigger") : "created";
  const name = str(fd, "name").slice(0, 80);
  if (!name) return { error: "Give the rule a name." };
  const conditions: RuleConditions = { sourceIds: ids(fd, "sourceIds"), stageIds: ids(fd, "stageIds"), words: str(fd, "words").slice(0, 300), interests: ids(fd, "interests"), minutes: Math.max(1, n(fd, "minutes", 15)), hours: Math.max(1, n(fd, "hours", 48)),
    projectIds: ids(fd, "projectIds"), developers: ids(fd, "developers"), areas: str(fd, "areas").slice(0, 300), script: user.isSuperAdmin ? String(fd.get("conditionScript") ?? "").slice(0, 5000) : "" };
  if (trigger === "stage" && !conditions.stageIds.length) return { error: "Choose the stage(s) that start this rule." };
  const assign = ["none", "user", "roundrobin", "leastloaded"].includes(str(fd, "assign")) ? str(fd, "assign") as RuleActions["assign"] : "none";
  const actions: RuleActions = {
    assign, userIds: ids(fd, "userIds"), stageId: str(fd, "stageId"), task: str(fd, "task").slice(0, 200), taskMinutes: n(fd, "taskMinutes", 0),
    notifyOwner: fd.get("notifyOwner") === "on", notifyUserIds: ids(fd, "notifyUserIds"), note: str(fd, "note").slice(0, 2000),
    emailSubject: str(fd, "emailSubject").slice(0, 200), emailBody: str(fd, "emailBody").slice(0, 4000),
    script: user.isSuperAdmin ? String(fd.get("actionScript") ?? "").slice(0, 5000) : "",
  };
  if (assign !== "none" && !actions.userIds.length) return { error: "Choose who the leads go to." };
  const nothing = assign === "none" && !actions.script.trim() && !actions.stageId && !actions.task && !actions.notifyOwner && !actions.notifyUserIds.length && !actions.note && !(actions.emailSubject && actions.emailBody);
  if (nothing) return { error: "Choose at least one thing for the rule to do." };
  const id = str(fd, "id");
  const data = { name, trigger, conditions: JSON.stringify(conditions), actions: JSON.stringify(actions), active: fd.get("active") !== "off" };
  if (id) await db.leadRule.update({ where: { id }, data });
  else await db.leadRule.create({ data: { ...data, sortOrder: await db.leadRule.count() } });
  await audit(user.id, id ? "update" : "create", "automation", id || name, `Lead automation rule “${name}”`);
  revalidatePath("/crm/automation");
  redirect("/crm/automation?tab=rules");
}

export async function toggleRule(fd: FormData) {
  await admin();
  const r = await db.leadRule.findUnique({ where: { id: str(fd, "id") } });
  if (r) await db.leadRule.update({ where: { id: r.id }, data: { active: !r.active } });
  revalidatePath("/crm/automation");
}

export async function deleteRule(fd: FormData) {
  const user = await admin();
  const r = await db.leadRule.delete({ where: { id: str(fd, "id") } }).catch(() => null);
  if (r) { await db.leadRuleHit.deleteMany({ where: { ruleId: r.id } }); await audit(user.id, "delete", "automation", r.id, `Deleted lead rule “${r.name}”`); }
  revalidatePath("/crm/automation");
}

export async function saveHook(_: FormState, fd: FormData): Promise<FormState> {
  const user = await admin();
  const name = str(fd, "name").slice(0, 80);
  const url = str(fd, "url").slice(0, 1000);
  const events = ids(fd, "events").filter((e) => HOOK_EVENTS.some(([k]) => k === e));
  if (!name) return { error: "Give it a name, e.g. Google Sheet." };
  if (!/^https:\/\/[^\s]+$/.test(url)) return { error: "Paste the https:// address Zapier, Make or your system gave you." };
  if (!events.length) return { error: "Choose at least one event." };
  const id = str(fd, "id");
  if (id) await db.outgoingHook.update({ where: { id }, data: { name, url, events: events.join(","), active: true, fails: 0 } });
  else await db.outgoingHook.create({ data: { name, url, events: events.join(","), secret: newHookSecret() } });
  await audit(user.id, id ? "update" : "create", "webhook", id || name, `Outgoing webhook “${name}”`);
  revalidatePath("/crm/automation");
  redirect("/crm/automation?tab=webhooks");
}

export async function deleteHook(fd: FormData) {
  const user = await admin();
  const h = await db.outgoingHook.delete({ where: { id: str(fd, "id") } }).catch(() => null);
  if (h) await audit(user.id, "delete", "webhook", h.id, `Deleted webhook “${h.name}”`);
  revalidatePath("/crm/automation");
}

export async function testHook(fd: FormData) {
  await admin();
  const h = await db.outgoingHook.findUnique({ where: { id: str(fd, "id") } });
  if (!h) return;
  // A sample payload only to this webhook: temporarily the only one listening to "test".
  const others = await db.outgoingHook.findMany({ where: { active: true, id: { not: h.id } }, select: { id: true } });
  await db.outgoingHook.update({ where: { id: h.id }, data: { events: `${h.events},test`, active: true } });
  await db.outgoingHook.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { active: false } });
  try { await fireHook("test", { message: "Test from AMS Automation hub", lead: { name: "Test Lead", phone: "+92 300 0000000", source: "Website" } }); }
  finally {
    await db.outgoingHook.update({ where: { id: h.id }, data: { events: h.events } });
    await db.outgoingHook.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { active: true } });
  }
  revalidatePath("/crm/automation");
}

/** Sends a sample lead through the same path real leads take (duplicate check, round-robin, rules, webhooks). */
export async function sendTestLead(_: FormState, fd: FormData): Promise<FormState> {
  await admin();
  const phone = `0300${String(Date.now()).slice(-7)}`;
  const res = await ingestLead({ name: str(fd, "name") || "Test Lead (automation)", phone, source: str(fd, "source") || "Website", campaign: "Automation test", message: "Sent from the Automation hub to test the setup." }, "api", { id: "hub-test", name: "Automation hub test" });
  revalidatePath("/crm/automation");
  if (res.status !== "created") return { error: `Not created (${res.status}).` };
  const lead = await db.lead.findUnique({ where: { id: res.leadId }, select: { number: true, owner: { select: { name: true } } } });
  return { ok: true, message: `Lead #${lead?.number} created and given to ${lead?.owner?.name ?? "nobody"}. Check the log below for what the rules did.` };
}

/** Try a saved rule on one lead (by number): shows whether it matches and what its script returns. Changes nothing. */
export async function testRuleOnLead(_: FormState, fd: FormData): Promise<FormState> {
  await admin();
  const res = await testRule(str(fd, "id"), Number(str(fd, "lead")));
  if ("error" in res) return { error: res.error };
  const parts = [`${res.lead}: ${res.matches ? "MATCHES this rule" : "does not match"}.`];
  if (res.conditionScript) parts.push(`Condition script → ${res.conditionScript.error ? `error: ${res.conditionScript.error}` : JSON.stringify(res.conditionScript.value)}`);
  if (res.actionScript) parts.push(`Action script → ${res.actionScript.error ? `error: ${res.actionScript.error}` : JSON.stringify(res.actionScript.value)}`);
  return { ok: true, message: parts.join("  ") };
}

