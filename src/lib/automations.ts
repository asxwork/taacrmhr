// CRM automations: named bulk actions run on selected leads (e.g. "Reshuffle: new agent + New Request").
// Each one is a stored config; running it applies every step to each lead the user may edit.
import { db } from "./db";
import { scopeWhere } from "./permissions";
import { assignableUsers, logSystem } from "./crm";
import { notify } from "./notify";
import { audit } from "./audit";
import type { SessionUser } from "./auth";

export type AutomationConfig = {
  /** keep = leave the owner; one = everyone to one agent; roundrobin = spread across the chosen agents. */
  assign: "keep" | "one" | "roundrobin";
  /** Default agents (can be changed when running). */
  userIds: string[];
  /** Avoid giving a lead back to the agent who already had it (when another agent is available). */
  avoidSameAgent: boolean;
  stageId: string | null;
  deleteOpen: boolean;
  deleteHistory: boolean;
  markReshuffled: boolean;
  /** Plan a "Call the client" task for the new owner, due now. */
  planCall: boolean;
};

export const DEFAULT_CONFIG: AutomationConfig = {
  assign: "roundrobin", userIds: [], avoidSameAgent: true, stageId: null, deleteOpen: true, deleteHistory: true, markReshuffled: true, planCall: true,
};

export function parseConfig(raw: string): AutomationConfig {
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AutomationConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** Plain-language list of what an automation does, for the settings page and the run confirmation. */
export function describe(c: AutomationConfig, names: { stage?: string; users?: string[] }) {
  const steps: string[] = [];
  if (c.deleteHistory) steps.push("deletes all activity history (calls, notes, meetings)");
  if (c.deleteOpen) steps.push("deletes open tasks and planned follow-ups");
  if (c.stageId) steps.push(`moves the lead to “${names.stage ?? "?"}”`);
  if (c.assign === "one") steps.push(`assigns it to ${names.users?.[0] ?? "the chosen agent"}`);
  if (c.assign === "roundrobin") steps.push(`shares the leads round-robin across ${names.users?.length ? names.users.join(", ") : "the chosen agents"}${c.avoidSameAgent ? " (never back to the same agent)" : ""}`);
  if (c.planCall) steps.push("plans a “Call the client” task for the new owner");
  if (c.markReshuffled) steps.push("marks it as reshuffled");
  return steps;
}

/**
 * Runs an automation on leads. `userIds` overrides the configured agents for this run.
 * Steps that delete activities need a Super Admin (only they may delete activities).
 */
export async function runAutomation(user: SessionUser, automationId: string, leadIds: string[], userIds?: string[]) {
  const auto = await db.automation.findUnique({ where: { id: automationId } });
  if (!auto || !auto.active) return { error: "Automation not found or switched off." };
  const c = parseConfig(auto.config);
  if ((c.deleteHistory || c.deleteOpen) && !user.isSuperAdmin) return { error: "This automation deletes activities, so only a Super Admin can run it." };

  const scope = await scopeWhere(user, "crm.leads", "edit");
  const leads = scope ? await db.lead.findMany({ where: { id: { in: leadIds }, ...scope }, select: { id: true, name: true, ownerId: true } }) : [];
  if (!leads.length) return { error: "None of the selected leads can be changed by you." };

  let agents: { id: string; name: string; branchId: string | null }[] = [];
  if (c.assign !== "keep") {
    const allowed = await assignableUsers(user, "crm.leads");
    const wanted = userIds?.length ? userIds : c.userIds;
    agents = allowed.filter((u) => wanted.includes(u.id));
    if (!agents.length) return { error: "Choose the agent(s) to give these leads to." };
    if (c.assign === "one") agents = agents.slice(0, 1);
  }
  const stage = c.stageId ? await db.leadStatus.findUnique({ where: { id: c.stageId } }) : null;
  if (stage?.systemKey === "onhold") return { error: "On-hold is set automatically; edit this automation to use another stage." };

  let turn = 0;
  const given = new Map<string, number>();
  for (const l of leads) {
    if (c.deleteHistory) await db.activity.deleteMany({ where: { leadId: l.id, type: { not: "system" }, OR: [{ doneAt: { not: null } }, { dueAt: null }] } });
    if (c.deleteOpen) await db.activity.deleteMany({ where: { leadId: l.id, doneAt: null, dueAt: { not: null } } });

    let owner: (typeof agents)[number] | undefined;
    if (agents.length) {
      for (let tries = 0; tries < agents.length; tries++) {
        const candidate = agents[(turn + tries) % agents.length]!;
        if (!c.avoidSameAgent || candidate.id !== l.ownerId || agents.length === 1) { owner = candidate; turn += tries + 1; break; }
      }
      owner ??= agents[turn++ % agents.length];
    }

    await db.lead.update({
      where: { id: l.id },
      data: {
        ...(owner && { ownerId: owner.id, branchId: owner.branchId }),
        ...(stage && { statusId: stage.id }),
        ...(c.markReshuffled && { reshuffledAt: new Date(), reshuffleCount: { increment: 1 } }),
        lastActivityAt: new Date(),
      },
    });
    if (owner && c.planCall) {
      await db.activity.create({ data: { leadId: l.id, type: "task", subject: "Call the client", dueAt: new Date(), ownerId: owner.id, createdById: user.id, branchId: owner.branchId } });
    }
    const parts = [owner && `to ${owner.name}`, stage && `stage ${stage.name}`, c.deleteHistory && "history cleared", c.deleteOpen && "open tasks cleared"].filter(Boolean);
    await logSystem({ leadId: l.id }, `${auto.name}${parts.length ? `: ${parts.join(", ")}` : ""}`, user.id);
    if (owner) given.set(owner.id, (given.get(owner.id) ?? 0) + 1);
  }

  for (const [id, n] of given) {
    if (id !== user.id) await notify(id, `${n} lead(s) given to you (${auto.name})`, { body: `By ${user.name}`, link: "/crm/follow-ups", email: true });
  }
  await db.automation.update({ where: { id: auto.id }, data: { runs: { increment: 1 }, lastRunAt: new Date() } });
  await audit(user.id, "update", "automation", auto.id, `Ran “${auto.name}” on ${leads.length} lead(s)`);
  return { count: leads.length, agents: [...given.entries()].map(([id, n]) => `${agents.find((a) => a.id === id)?.name} ${n}`) };
}
