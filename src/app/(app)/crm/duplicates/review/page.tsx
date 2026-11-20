import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { fieldAccess } from "@/lib/field-rules";
import { fmtPhone } from "@/lib/crm-shared";
import { maskEmail, maskPhone } from "@/lib/field-defs";
import { bestOf, duplicateGroups } from "@/lib/lead-merge";
import { createHash } from "node:crypto";
import { fmtPKR } from "@/lib/crm-shared";
import { MergeReview } from "./merge-review";

export const metadata = { title: "Merge leads" };

/** Leads → Duplicates → Review: one group at a time, side by side, like Bitrix's merge screen. */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ by?: string; i?: string; m?: string; skip?: string; err?: string }> }) {
  const user = await requirePermission("crm.merge");
  if (!can(user, "crm.merge", "edit")) notFound();
  const sp = await searchParams;
  const by = sp.by === "email" ? "email" : "phone";
  const scope = (await scopeWhere(user, "crm.merge"))!;
  const skipped = new Set((sp.skip ?? "").split(",").filter(Boolean));
  // "Later" skips a group by a short code of its phone/email (the raw number never goes to the browser).
  const code = (k: string) => createHash("sha1").update(k).digest("hex").slice(0, 10);
  const all = (await duplicateGroups(scope, by)).filter((g) => !skipped.has(code(g.key)));
  const i = Math.min(Math.max(0, Number(sp.i) || 0), Math.max(0, all.length - 1));
  const group = all[i];
  const fields = await fieldAccess(user);
  const pm = fields["lead.phone"], em = fields["lead.email"];
  const leads = group ? await db.lead.findMany({
    where: { ...scope, ...(by === "phone" ? { phoneKey: group.key } : { email: group.key }) },
    include: { status: true, owner: { select: { name: true, active: true } }, source: { select: { name: true } }, project: { select: { name: true } }, _count: { select: { activities: true, deals: true } } },
    orderBy: { createdAt: "desc" },
  }) : [];
  const phone = (v: string | null) => (!v ? null : pm === "full" ? fmtPhone(v) : pm === "mask" ? maskPhone(v) : "Hidden");
  const email = (v: string | null) => (!v ? null : em === "full" ? v : em === "mask" ? maskEmail(v) : "Hidden");
  const rows = leads.map((l) => ({
    id: l.id, number: l.number, createdAt: l.createdAt.toISOString(), activities: l._count.activities, deals: l._count.deals, bitrix: !!l.bitrixId,
    values: {
      name: l.name, phone: phone(l.phone), phone2: phone(l.phone2), email: email(l.email),
      project: l.project?.name ?? l.projectName, source: l.source?.name ?? null, stage: l.status.name,
      owner: l.owner ? `${l.owner.name}${l.owner.active ? "" : " (old employee)"}` : null,
      campaign: l.campaign, sourceInfo: l.sourceInfo, interest: l.interest, location: l.location,
      budget: l.budgetMin || l.budgetMax ? [l.budgetMin, l.budgetMax].filter(Boolean).map((n) => fmtPKR(n!)).join(" – ") : null,
    },
  }));
  return (
    <MergeReview key={`${by}-${group ? code(group.key) : "done"}`}
      by={by} index={i} total={all.length} merged={Number(sp.m) || 0} skip={[...skipped]} error={sp.err}
      groupLabel={group ? (by === "phone" ? phone(group.key) : email(group.key)) ?? "" : ""}
      leads={rows} bestId={leads.length ? bestOf(leads).id : ""} groupCode={group ? code(group.key) : ""}
    />
  );
}
