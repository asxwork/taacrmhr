// Lead automation: rules that run by themselves (when a lead arrives, changes stage, isn't contacted in time, or
// goes quiet) and outgoing webhooks that tell other systems (Zapier, Make, Google Sheets…) what happened.
import { createHmac, randomBytes } from "node:crypto";
import { db } from "./db";
import { logSystem } from "./crm";
import { notify, APP_URL } from "./notify";

export type RuleTrigger = "created" | "stage" | "uncontacted" | "idle";
export const TRIGGERS: [RuleTrigger, string, string][] = [
  ["created", "A new lead arrives", "From the website, Facebook, Zameen, an API connection or added by hand"],
  ["stage", "A lead moves to a stage", "e.g. Site Visit or Negotiation"],
  ["uncontacted", "Nobody contacts a new lead in time", "No call, WhatsApp, note or meeting within the minutes you set"],
  ["idle", "A lead goes quiet", "No activity for the hours you set"],
];
export type RuleConditions = { sourceIds: string[]; stageIds: string[]; words: string; interests: string[]; minutes: number; hours: number };
export type RuleActions = {
  assign: "none" | "user" | "roundrobin" | "leastloaded"; userIds: string[]; stageId: string; task: string; taskMinutes: number;
  notifyOwner: boolean; notifyUserIds: string[]; note: string; emailSubject: string; emailBody: string;
};
export const EMPTY_CONDITIONS: RuleConditions = { sourceIds: [], stageIds: [], words: "", interests: [], minutes: 15, hours: 48 };
export const EMPTY_ACTIONS: RuleActions = { assign: "none", userIds: [], stageId: "", task: "", taskMinutes: 0, notifyOwner: true, notifyUserIds: [], note: "", emailSubject: "", emailBody: "" };

const parse = <T,>(raw: string, base: T): T => { try { return { ...base, ...JSON.parse(raw) }; } catch { return base; } };
export const ruleConditions = (raw: string) => parse(raw, EMPTY_CONDITIONS);
export const ruleActions = (raw: string) => parse(raw, EMPTY_ACTIONS);

type LeadLite = { id: string; name: string; email: string | null; phone: string | null; ownerId: string | null; sourceId: string | null; statusId: string; interest: string | null; campaign: string | null; location: string | null; notes: string | null; propertyType: string | null; number: number | null };
const LEAD_SELECT = { id: true, name: true, email: true, phone: true, ownerId: true, sourceId: true, statusId: true, interest: true, campaign: true, location: true, notes: true, propertyType: true, number: true } as const;

function matches(c: RuleConditions, l: LeadLite) {
  if (c.sourceIds.length && !c.sourceIds.includes(l.sourceId ?? "")) return false;
  if (c.stageIds.length && !c.stageIds.includes(l.statusId)) return false;
  if (c.interests.length && !c.interests.includes(l.interest ?? "")) return false;
  const words = c.words.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (words.length) {
    const text = [l.campaign, l.location, l.notes, l.propertyType].filter(Boolean).join(" ").toLowerCase();
    if (!words.some((w) => text.includes(w))) return false;
  }
  return true;
}

const fill = (tpl: string, l: LeadLite, ownerName: string) =>
  tpl.replace(/\{name\}/gi, l.name).replace(/\{first_name\}/gi, l.name.split(" ")[0] ?? l.name).replace(/\{agent\}/gi, ownerName).replace(/\{phone\}/gi, l.phone ?? "");

/** Applies one rule's actions to one lead. Returns a short description for the log. */
async function apply(rule: { id: string; name: string; actions: string }, l: LeadLite) {
  const a = ruleActions(rule.actions);
  const done: string[] = [];
  let ownerId = l.ownerId;
  if (a.assign !== "none" && a.userIds.length) {
    const pool = await db.user.findMany({ where: { id: { in: a.userIds }, active: true }, select: { id: true, name: true, branchId: true }, orderBy: { name: "asc" } });
    let pick: (typeof pool)[number] | undefined;
    if (a.assign === "user") pick = pool[0];
    else if (a.assign === "leastloaded") {
      const counts = await Promise.all(pool.map((u) => db.lead.count({ where: { ownerId: u.id, status: { kind: "open" } } })));
      pick = pool[counts.indexOf(Math.min(...counts))];
    } else if (pool.length) {
      const key = `rule.rr.${rule.id}`;
      const i = Number((await db.setting.findUnique({ where: { key } }))?.value ?? 0) % pool.length;
      await db.setting.upsert({ where: { key }, update: { value: String(i + 1) }, create: { key, value: String(i + 1) } });
      // Don't give it back to the agent who already has it (re-assigning a lead nobody called).
      pick = pool.length > 1 && pool[i]!.id === l.ownerId ? pool[(i + 1) % pool.length] : pool[i];
    }
    if (pick && pick.id !== l.ownerId) {
      await db.lead.update({ where: { id: l.id }, data: { ownerId: pick.id, branchId: pick.branchId } });
      ownerId = pick.id;
      done.push(`assigned to ${pick.name}`);
      await notify(pick.id, `New lead for you: ${l.name}`, { body: `By automation “${rule.name}”${l.phone ? ` · ${l.phone}` : ""}`, link: `/crm/leads/${l.id}`, email: true });
      void fireHook("lead.assigned", { lead: { id: l.id, number: l.number, name: l.name, phone: l.phone, email: l.email }, ownerId: pick.id, ownerName: pick.name });
    }
  }
  if (a.stageId && a.stageId !== l.statusId) {
    const st = await db.leadStatus.findFirst({ where: { id: a.stageId, kind: "open", active: true } });
    if (st && st.systemKey !== "onhold") { await db.lead.update({ where: { id: l.id }, data: { statusId: st.id } }); done.push(`moved to ${st.name}`); }
  }
  if (a.task.trim() && ownerId) {
    const owner = await db.user.findUnique({ where: { id: ownerId }, select: { branchId: true } });
    await db.activity.create({ data: { leadId: l.id, type: "task", subject: a.task.trim().slice(0, 200), dueAt: new Date(Date.now() + Math.max(0, a.taskMinutes) * 60_000), ownerId, branchId: owner?.branchId ?? null } });
    done.push(`task “${a.task.trim()}”`);
  }
  if (a.note.trim()) {
    await db.activity.create({ data: { leadId: l.id, type: "note", subject: "Automation note", body: a.note.trim().slice(0, 2000), doneAt: new Date(), ownerId } });
    done.push("note added");
  }
  const ownerName = ownerId ? (await db.user.findUnique({ where: { id: ownerId }, select: { name: true } }))?.name ?? "" : "";
  if (a.emailSubject.trim() && a.emailBody.trim() && l.email) {
    const { sendMail } = await import("./mail");
    await sendMail(l.email, fill(a.emailSubject, l, ownerName), fill(a.emailBody, l, ownerName)).catch(() => {});
    done.push("email to client");
  }
  const tell = new Set([...(a.notifyOwner && ownerId ? [ownerId] : []), ...a.notifyUserIds]);
  for (const uid of tell) await notify(uid, `${rule.name}: ${l.name}`, { body: done.length ? `Automation ${done.join(", ")}.` : "Matched an automation rule.", link: `/crm/leads/${l.id}` });
  if (tell.size) done.push(`told ${tell.size} person${tell.size === 1 ? "" : "s"}`);
  await logSystem({ leadId: l.id }, `Automation “${rule.name}”${done.length ? `: ${done.join(", ")}` : ""}`, null);
  await db.leadRule.update({ where: { id: rule.id }, data: { runs: { increment: 1 }, lastRunAt: new Date() } });
  await db.webhookLog.create({ data: { source: `rule:${rule.name}`.slice(0, 190), status: "ran", summary: `${l.name}: ${done.join(", ") || "matched"}`, leadId: l.id } });
  return done;
}

/** Runs the rules for an event on a lead (arrived, or moved to a stage). Never throws: automation must not break saving. */
export async function runLeadRules(trigger: "created" | "stage", leadId: string) {
  try {
    const rules = await db.leadRule.findMany({ where: { active: true, trigger }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    for (const r of rules) {
      const l = await db.lead.findUnique({ where: { id: leadId }, select: LEAD_SELECT });
      if (l && matches(ruleConditions(r.conditions), l)) await apply(r, l);
    }
  } catch (e) { console.error("[lead-rules]", (e as Error).message); }
}

/**
 * Timed rules, every few minutes (with the machine sync cron): new leads nobody has contacted within N minutes, and
 * open leads with no activity for N hours. Each fires once per lead (idle: once per quiet spell).
 */
export async function runTimedLeadRules(now = new Date()) {
  let hits = 0;
  const rules = await db.leadRule.findMany({ where: { active: true, trigger: { in: ["uncontacted", "idle"] } } });
  for (const r of rules) {
    const c = ruleConditions(r.conditions);
    const leads = r.trigger === "uncontacted"
      ? await db.lead.findMany({ where: { status: { kind: "open" }, createdAt: { lte: new Date(+now - Math.max(1, c.minutes) * 60_000), gte: new Date(+now - 3 * 86_400_000) }, activities: { none: { doneAt: { not: null }, createdById: { not: null }, type: { not: "system" } } } }, select: { ...LEAD_SELECT, lastActivityAt: true }, take: 200 })
      : await db.lead.findMany({ where: { status: { kind: "open" }, OR: [{ lastActivityAt: { lte: new Date(+now - Math.max(1, c.hours) * 3_600_000) } }, { lastActivityAt: null, createdAt: { lte: new Date(+now - Math.max(1, c.hours) * 3_600_000) } }] }, select: { ...LEAD_SELECT, lastActivityAt: true }, take: 200 });
    for (const l of leads) {
      if (!matches(c, l)) continue;
      const hit = await db.leadRuleHit.findFirst({ where: { ruleId: r.id, leadId: l.id }, orderBy: { at: "desc" } });
      if (hit && (r.trigger === "uncontacted" || !l.lastActivityAt || hit.at > l.lastActivityAt)) continue;
      await db.leadRuleHit.create({ data: { ruleId: r.id, leadId: l.id } });
      await apply(r, l).catch((e) => console.error("[lead-rules]", (e as Error).message));
      hits++;
    }
  }
  return hits;
}

// ─── Outgoing webhooks ─────────────────────────────────────

export const HOOK_EVENTS: [string, string][] = [
  ["lead.created", "New lead"], ["lead.stage", "Lead changed stage"], ["lead.assigned", "Lead assigned by automation"], ["lead.converted", "Lead converted to a deal"], ["invoice.paid", "Invoice paid"],
];
export const newHookSecret = () => randomBytes(18).toString("base64url");

/**
 * POSTs the event to every active webhook that wants it (JSON body, header X-AMS-Signature = HMAC-SHA256 of the body
 * with the webhook's secret). 8-second timeout; never throws. Ten failures in a row switch a webhook off.
 */
export async function fireHook(event: string, data: Record<string, unknown>) {
  try {
    const hooks = await db.outgoingHook.findMany({ where: { active: true } });
    const wanted = hooks.filter((h) => h.events.split(",").includes(event));
    await Promise.all(wanted.map(async (h) => {
      const body = JSON.stringify({ event, at: new Date().toISOString(), app: APP_URL(), data });
      let status = "";
      try {
        const res = await fetch(h.url, { method: "POST", headers: { "Content-Type": "application/json", "X-AMS-Event": event, "X-AMS-Signature": createHmac("sha256", h.secret).update(body).digest("hex") }, body, signal: AbortSignal.timeout(8000) });
        status = `${res.status}`;
        await db.outgoingHook.update({ where: { id: h.id }, data: { lastStatus: `${event}: ${res.status}`, lastAt: new Date(), fails: res.ok ? 0 : { increment: 1 } } });
      } catch (e) {
        status = (e as Error).name === "TimeoutError" ? "timeout" : "unreachable";
        const u = await db.outgoingHook.update({ where: { id: h.id }, data: { lastStatus: `${event}: ${status}`, lastAt: new Date(), fails: { increment: 1 } } });
        if (u.fails >= 10) await db.outgoingHook.update({ where: { id: h.id }, data: { active: false } });
      }
      await db.webhookLog.create({ data: { source: `out:${h.name}`.slice(0, 190), status: /^2/.test(status) ? "sent" : "failed", summary: `${event} → ${status}` } });
    }));
  } catch (e) { console.error("[hooks]", (e as Error).message); }
}

/** Everything about a lead an outside system needs. */
export async function leadPayload(leadId: string) {
  const l = await db.lead.findUnique({ where: { id: leadId }, include: { status: { select: { name: true } }, source: { select: { name: true } }, owner: { select: { name: true, email: true } } } });
  if (!l) return null;
  return { id: l.id, number: l.number, name: l.name, phone: l.phone, email: l.email, source: l.source?.name ?? null, campaign: l.campaign, stage: l.status.name, owner: l.owner?.name ?? null, ownerEmail: l.owner?.email ?? null, interest: l.interest, propertyType: l.propertyType, location: l.location, budget: l.budgetMax, notes: l.notes, createdAt: l.createdAt, url: `${APP_URL()}/crm/leads/${l.id}` };
}

/** One call for "a lead was created / changed stage": rules first, then webhooks with the final state. */
export async function leadEvent(event: "created" | "stage", leadId: string) {
  await runLeadRules(event, leadId);
  const payload = await leadPayload(leadId);
  if (payload) void fireHook(event === "created" ? "lead.created" : "lead.stage", { lead: payload });
}
