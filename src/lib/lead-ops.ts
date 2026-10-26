// Lead changes shared by the page actions (leads/actions.ts) and the in-place list (leads/list-actions.ts).
// Callers check the module permission; these check the record scope.
import { db } from "./db";
import { scopeWhere } from "./permissions";
import { assignableUsers, logSystem } from "./crm";
import { leadWhere, type LeadFilters } from "./lead-filters";
import { manualHoldError } from "./lead-hold";
import { audit } from "./audit";
import { notify } from "./notify";
import { str, type FormState } from "./utils";
import type { SessionUser } from "./auth";

export async function editableLead(user: SessionUser, id: string) {
  const scope = await scopeWhere(user, "crm.leads", "edit");
  return scope ? db.lead.findFirst({ where: { id, ...scope }, include: { status: true } }) : null;
}

export async function applyLeadStatus(user: SessionUser, id: string, statusId: string) {
  const lead = await editableLead(user, id);
  if (!lead) return { error: "You can't change this lead." };
  const status = await db.leadStatus.findUnique({ where: { id: statusId } });
  if (!status) return { error: "Unknown status." };
  if (status.kind === "converted") return { error: "Use “Convert” on the lead to create a deal." };
  if (lead.statusId === statusId) return {};
  const holdError = await manualHoldError(statusId);
  if (holdError) return { error: holdError };
  await db.lead.update({ where: { id }, data: { statusId } });
  await logSystem({ leadId: id }, `Status: ${lead.status.name} → ${status.name}`, user.id);
  return {};
}

/** Selected ids, or with "For all" ticked every lead matching the posted filter (up to 5,000). */
async function bulkIds(user: SessionUser, fd: FormData) {
  if (fd.get("forAll") !== "on") return fd.getAll("ids").map(String);
  const filters = Object.fromEntries(new URLSearchParams(str(fd, "query"))) as LeadFilters;
  const statuses = await db.leadStatus.findMany({ where: { active: true }, select: { id: true, kind: true } });
  const rows = await db.lead.findMany({ where: await leadWhere(user, filters, statuses), select: { id: true }, take: 5000 });
  return rows.map((r) => r.id);
}

export async function runBulkLeads(user: SessionUser, fd: FormData): Promise<FormState> {
  const ids = await bulkIds(user, fd);
  const op = str(fd, "op");
  if (!ids.length) return { error: "Select at least one lead." };

  if (op === "delete") {
    const scope = await scopeWhere(user, "crm.leads", "delete");
    if (!scope) return { error: "You can't delete leads." };
    const { count } = await db.lead.deleteMany({ where: { id: { in: ids }, ...scope } });
    await audit(user.id, "delete", "lead", null, `Deleted ${count} lead(s)`);
    return { ok: true, message: `Deleted ${count} lead(s).` };
  }

  const scope = await scopeWhere(user, "crm.leads", "edit");
  const leads = scope ? await db.lead.findMany({ where: { id: { in: ids }, ...scope }, select: { id: true, ownerId: true, branchId: true } }) : [];

  if (op === "assign") {
    const target = (await assignableUsers(user, "crm.leads")).find((u) => u.id === str(fd, "ownerId"));
    if (!target) return { error: "Choose someone you can assign to." };
    for (const l of leads) {
      await db.lead.update({ where: { id: l.id }, data: { ownerId: target.id, branchId: target.branchId } });
      await logSystem({ leadId: l.id }, `Assigned to ${target.name}`, user.id);
    }
    if (target.id !== user.id && leads.length) await notify(target.id, `${leads.length} lead(s) assigned to you`, { body: `By ${user.name}`, link: "/crm/leads", email: true });
    return { ok: true, message: `Assigned ${leads.length} lead(s) to ${target.name}.` };
  }

  if (op === "automation") {
    const { runAutomation } = await import("@/lib/automations");
    if (fd.get("confirmRun") !== "on") return { error: "Tick the box to confirm what this automation will do." };
    const res = await runAutomation(user, str(fd, "automationId"), ids, fd.getAll("agentIds").map(String));
    if ("error" in res) return { error: res.error };
    return { ok: true, message: `Done on ${res.count} lead(s)${res.agents.length ? ` — ${res.agents.join(", ")}` : ""}.` };
  }

  if (op === "task") {
    const subject = str(fd, "subject") || "Call the client";
    const dueAt = new Date(str(fd, "dueAt"));
    if (Number.isNaN(dueAt.getTime())) return { error: "Choose when the task is due." };
    for (const l of leads) {
      await db.activity.create({ data: { leadId: l.id, type: "task", subject, dueAt, ownerId: l.ownerId ?? user.id, createdById: user.id, branchId: l.branchId } });
      await db.lead.update({ where: { id: l.id }, data: { lastActivityAt: new Date() } });
    }
    await audit(user.id, "create", "activity", null, `Added task “${subject}” to ${leads.length} lead(s)`);
    return { ok: true, message: `Added “${subject}” to ${leads.length} lead(s).` };
  }

  if (op === "status") {
    let changed = 0;
    for (const l of leads) if (!(await applyLeadStatus(user, l.id, str(fd, "statusId"))).error) changed++;
    return { ok: true, message: `Updated ${changed} lead(s).` };
  }
  return { error: "Choose an action." };
}
