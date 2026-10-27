"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser, type SessionUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { deleteUpload, saveUpload } from "@/lib/files";
import { POLICY_CATEGORIES, publishPolicy, remindPending } from "@/lib/policies";
import { str, type FormState } from "@/lib/utils";

/** Policies are company-wide, so managing them needs company-wide HR edit rights. */
const manager = (u: SessionUser) => u.isSuperAdmin || scopeFor(u, "hr.employees", "edit") === "all";
const refresh = (id?: string) => {
  revalidatePath("/hr/policies");
  revalidatePath("/hr/policies/manage");
  revalidatePath("/me/policies");
  revalidatePath("/hr");
  if (id) revalidatePath(`/hr/policies/${id}`);
};

export async function savePolicy(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only HR admins can manage policies." };
  const id = str(fd, "id");
  const title = str(fd, "title").slice(0, 200);
  if (!title) return { error: "Give the policy a title." };
  const category = (POLICY_CATEGORIES as readonly string[]).includes(str(fd, "category")) ? str(fd, "category") : "General";
  const audience = ["all", "branches", "departments"].includes(str(fd, "audience")) ? str(fd, "audience") : "all";
  const audienceIds = audience === "branches" ? fd.getAll("branchIds").map(String).join(",") : audience === "departments" ? fd.getAll("departmentIds").map(String).join(",") : null;
  if (audience !== "all" && !audienceIds) return { error: `Choose at least one ${audience === "branches" ? "branch" : "department"}.` };
  const body = str(fd, "body").slice(0, 60_000) || null;
  const file = fd.get("file");
  let filePath: string | undefined;
  if (file instanceof File && file.size > 0) {
    const res = await saveUpload(file, "policies", { maxBytes: 15_000_000, allowPdf: true });
    if ("error" in res) return { error: res.error };
    filePath = res.path;
  }
  if (!body && !filePath && !id) return { error: "Write the policy or attach a PDF." };
  const data = { title, category, audience, audienceIds, body, requireAck: fd.get("requireAck") === "on", ...(filePath && { filePath }) };

  if (id) {
    const old = await db.policy.findUnique({ where: { id } });
    if (!old) return { error: "Policy not found." };
    if (filePath && old.filePath) await deleteUpload(old.filePath);
    await db.policy.update({ where: { id }, data });
    // A published policy that changed goes out again as a new version.
    const changed = old.status === "published" && (old.body !== body || !!filePath || old.title !== title);
    if (changed && fd.get("republish") === "on") await publishPolicy(id, true);
    await audit(user.id, "update", "policy", id, `Updated policy ${title}`);
    refresh(id);
    return { ok: true, message: changed && fd.get("republish") === "on" ? "Saved and sent out as a new version." : "Saved." };
  }
  const p = await db.policy.create({ data: { ...data, createdById: user.id } });
  if (fd.get("publish") === "on") await publishPolicy(p.id, false);
  await audit(user.id, "create", "policy", p.id, `Added policy ${title}`);
  refresh();
  redirect("/hr/policies/manage");
}

export async function setPolicyStatus(fd: FormData) {
  const user = await requireUser();
  if (!manager(user)) return;
  const id = str(fd, "id");
  const status = str(fd, "status");
  const p = await db.policy.findUnique({ where: { id } });
  if (!p) return;
  if (status === "published") await publishPolicy(id, false);
  else if (status === "archived" || status === "draft") await db.policy.update({ where: { id }, data: { status } });
  else if (status === "delete" && p.status !== "published") {
    if (p.filePath) await deleteUpload(p.filePath);
    await db.policy.delete({ where: { id } });
  }
  await audit(user.id, "update", "policy", id, `${p.title}: ${status}`);
  refresh(id);
}

export async function remindPolicy(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!manager(user)) return { error: "Only HR admins can send reminders." };
  const n = await remindPending(str(fd, "id"));
  return { ok: true, message: n ? `Reminded ${n} employee${n === 1 ? "" : "s"}.` : "Everyone has acknowledged it." };
}

/** The signed-in employee acknowledges the current version of a policy that applies to them. */
export async function acknowledgePolicy(fd: FormData) {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, branchId: true, departmentId: true } });
  const p = await db.policy.findUnique({ where: { id: str(fd, "id") } });
  if (!emp || !p || p.status !== "published") return;
  const { appliesTo } = await import("@/lib/policies");
  if (!appliesTo(p, emp)) return;
  await db.policyAck.upsert({
    where: { policyId_employeeId_version: { policyId: p.id, employeeId: emp.id, version: p.version } },
    update: {}, create: { policyId: p.id, employeeId: emp.id, version: p.version },
  });
  refresh(p.id);
}
