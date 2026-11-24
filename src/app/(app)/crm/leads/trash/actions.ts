"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { trashWhere } from "@/lib/lead-trash";
import { audit } from "@/lib/audit";

export async function restoreFromTrash(fd: FormData) {
  const user = await requirePermission("crm.leads", "delete");
  const ids = fd.getAll("id").map(String);
  const { restoreLead } = await import("@/lib/lead-trash");
  const mine = await db.leadTrash.findMany({ where: { id: { in: ids }, ...trashWhere(user) }, select: { id: true } });
  let done = 0, failed = 0;
  for (const t of mine) {
    const r = await restoreLead(t.id).catch((e) => { console.error("Restore failed:", e); return { error: "failed" }; });
    if ("ok" in r && r.ok) { done++; await audit(user.id, "update", "lead", r.leadId ?? null, `Restored lead ${r.name} from the Trash`); } else failed++;
  }
  revalidatePath("/crm/leads");
  redirect(`/crm/leads/trash?restored=${done}${failed ? `&failed=${failed}` : ""}`);
}

/** Super Admin only: delete for good before the 30 days are up. */
export async function deleteForever(fd: FormData) {
  const user = await requirePermission("crm.leads", "delete");
  if (!user.isSuperAdmin) redirect("/crm/leads/trash");
  const ids = fd.getAll("id").map(String);
  const { count } = await db.leadTrash.deleteMany({ where: fd.get("all") === "1" ? {} : { id: { in: ids } } });
  await audit(user.id, "delete", "lead", null, `Deleted ${count} lead(s) from the Trash for good`);
  redirect(`/crm/leads/trash?purged=${count}`);
}
