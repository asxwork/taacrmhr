"use server";

// Actions for the in-place lead list (components/crm/leads-workspace.tsx). They return data instead of
// revalidating, so filters, stage changes and bulk actions update the list without re-rendering the page.
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { loadLeadList, nextActivity, type LeadListData, type LeadRow } from "@/lib/lead-list";
import { applyLeadStatus, runBulkLeads } from "@/lib/lead-ops";
import { createActivity } from "@/lib/activity-ops";
import type { LeadFilters } from "@/lib/lead-filters";
import type { FormState } from "@/lib/utils";

export async function fetchLeadList(query: string, view: "list" | "board", page: number): Promise<LeadListData> {
  const user = await requirePermission("crm.leads");
  const filters = Object.fromEntries(new URLSearchParams(query)) as LeadFilters;
  return loadLeadList(user, filters, view === "board" ? "board" : "list", Math.max(1, Math.floor(page) || 1));
}

export async function changeLeadStage(id: string, statusId: string): Promise<{ error?: string }> {
  const user = await requirePermission("crm.leads", "edit");
  return applyLeadStatus(user, id, statusId);
}

/** Bottom bar actions (stage, responsible person, task, automation, delete) on selected leads or "for all". */
export async function bulkLeadAction(fd: FormData): Promise<FormState> {
  const op = String(fd.get("op") ?? "");
  const user = await requirePermission("crm.leads", op === "delete" ? "delete" : "edit");
  return runBulkLeads(user, fd);
}

/** "+ Add activity" on a row. Returns the lead's next planned activity for the Activity column. */
export async function quickLeadActivity(fd: FormData): Promise<{ error?: string; next?: LeadRow["next"] }> {
  const user = await requirePermission("crm.activities", "create");
  const res = await createActivity(user, fd);
  if (res?.error) return { error: res.error };
  const leadId = String(fd.get("leadId") ?? "");
  const a = await db.activity.findFirst({
    where: { leadId, doneAt: null, dueAt: { not: null } },
    select: { subject: true, dueAt: true, owner: { select: { name: true } } },
    orderBy: { dueAt: "asc" },
  });
  return { next: a ? nextActivity(a) : null };
}
