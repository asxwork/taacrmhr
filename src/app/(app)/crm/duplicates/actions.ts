"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { bestOf, duplicateMode, duplicateSets, mergeLeadGroup } from "@/lib/lead-merge";
import { str, type FormState } from "@/lib/utils";

/** Merges one group into the lead picked to keep. */
export async function mergeLeads(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.merge", "edit");
  const r = await mergeLeadGroup(user, str(fd, "keep"), [...new Set(fd.getAll("ids").map(String))]);
  if (r.error) return { error: r.error };
  revalidatePath("/crm/duplicates");
  revalidatePath(`/crm/leads/${r.keep!.id}`);
  return { ok: true, message: `Merged into ${r.keep!.name}.` };
}

/** "Merge all" for one grouping: every group merges into its most-worked lead. Groups that can't be merged are skipped. */
export async function mergeAllLeads(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("crm.merge", "edit");
  const by = duplicateMode(str(fd, "by"));
  const scope = (await scopeWhere(user, "crm.merge", "edit")) ?? { id: "none" };
  const groups = await duplicateSets(scope, by);
  let merged = 0, groupsDone = 0, skipped = 0;
  const t0 = Date.now();
  for (const g of groups) {
    if (Date.now() - t0 > 50_000) break; // stay inside the server's time limit; run again for the rest
    const rows = await db.lead.findMany({ where: { ...scope, id: { in: g.ids } }, include: { _count: { select: { activities: true, deals: true } } } });
    if (rows.length < 2) continue;
    const r = await mergeLeadGroup(user, bestOf(rows).id, rows.map((x) => x.id));
    if (r.error) { skipped++; continue; }
    merged += r.merged ?? 0; groupsDone++;
  }
  await audit(user.id, "update", "lead", null, `Merge all (${by}): ${groupsDone} groups, ${merged} duplicate leads merged${skipped ? `, ${skipped} groups skipped` : ""}`);
  revalidatePath("/crm/duplicates");
  revalidatePath("/crm/leads");
  const left = groups.length - groupsDone - skipped;
  // The button disappears when nothing is left, so the result goes on the page itself.
  redirect(`/crm/duplicates?${new URLSearchParams({ by, merged: String(merged), groups: String(groupsDone), skipped: String(skipped), left: String(Math.max(0, left)) })}`);
}

/** The one-group merge screen: the main lead, plus values picked per field from the others. Then on to the next group. */
export async function mergeReviewed(fd: FormData) {
  const user = await requirePermission("crm.merge", "edit");
  const ids = [...new Set(fd.getAll("ids").map(String))];
  const pick: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("f_") && typeof v === "string" && v) pick[k.slice(2)] = v;
  const r = await mergeLeadGroup(user, str(fd, "keep"), ids, pick);
  // Leads ticked in the Leads list: open the merged lead (or come back with the error).
  if (fd.get("picked")) {
    revalidatePath("/crm/leads");
    if (r.keep) redirect(`/crm/leads/${r.keep.id}`);
    redirect(`/crm/duplicates/review?${new URLSearchParams({ ids: ids.join(","), err: r.error ?? "" })}`);
  }
  const back = new URLSearchParams({ by: duplicateMode(str(fd, "by")), i: str(fd, "i") || "0", m: String((Number(str(fd, "m")) || 0) + (r.error ? 0 : 1)), ...(str(fd, "skip") && { skip: str(fd, "skip") }), ...(r.error && { err: r.error }) });
  revalidatePath("/crm/duplicates");
  if (r.keep) revalidatePath(`/crm/leads/${r.keep.id}`);
  redirect(`/crm/duplicates/review?${back}`);
}
