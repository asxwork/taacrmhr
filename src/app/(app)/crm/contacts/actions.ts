"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, scopeWhere } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { ownerBranch, phoneKey, resolveOwner } from "@/lib/crm";
import { str, type FormState } from "@/lib/utils";

export async function saveContact(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("crm.contacts", id ? "edit" : "create");
  const scope = await scopeWhere(user, "crm.contacts", id ? "edit" : "view");
  const existing = id && scope ? await db.contact.findFirst({ where: { id, ...scope } }) : null;
  if (id && !existing) return { error: "Contact not found or you can't edit it." };

  const name = str(fd, "name");
  const phone = str(fd, "phone");
  if (name.length < 2) return { error: "Name is required." };

  const key = phoneKey(phone);
  if (key && fd.get("confirm") !== "on") {
    const dup = await db.contact.findFirst({ where: { phoneKey: key, NOT: id ? { id } : undefined }, include: { owner: true } });
    if (dup) return { confirm: `Contact “${dup.name}” (owner ${dup.owner?.name ?? "unassigned"}) already has this phone. Tick to save anyway.` };
  }

  const ownerId = await resolveOwner(user, "crm.contacts", str(fd, "ownerId"), existing?.ownerId);
  const branchId = await ownerBranch(ownerId);

  let companyId: string | null = str(fd, "companyId") || null;
  if (companyId && scope && !(await db.company.findFirst({ where: { id: companyId, ...scope }, select: { id: true } }))) companyId = existing?.companyId ?? null;
  const newCompany = str(fd, "newCompany");
  if (!companyId && newCompany) companyId = (await db.company.create({ data: { name: newCompany, ownerId, branchId } })).id;

  const data = {
    name, phone: phone || null, phoneKey: key, phone2: str(fd, "phone2") || null, email: str(fd, "email").toLowerCase() || null,
    cnic: str(fd, "cnic") || null, address: str(fd, "address") || null, companyId, sourceId: str(fd, "sourceId") || null,
    notes: str(fd, "notes") || null, ownerId, branchId,
  };
  const contact = existing ? await db.contact.update({ where: { id }, data }) : await db.contact.create({ data });
  await audit(user.id, existing ? "update" : "create", "contact", contact.id, `${existing ? "Updated" : "Created"} contact ${name}`);
  revalidatePath("/crm/contacts");
  redirect(`/crm/contacts/${contact.id}`);
}

export async function deleteContact(fd: FormData) {
  const user = await requirePermission("crm.contacts", "delete");
  const scope = await scopeWhere(user, "crm.contacts", "delete");
  const id = str(fd, "id");
  const contact = scope ? await db.contact.findFirst({ where: { id, ...scope } }) : null;
  if (contact) {
    await db.contact.delete({ where: { id } });
    await audit(user.id, "delete", "contact", id, `Deleted contact ${contact.name}`);
  }
  redirect("/crm/contacts");
}

export async function saveCompany(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("crm.contacts", id ? "edit" : "create");
  const scope = await scopeWhere(user, "crm.contacts", "edit");
  const existing = id && scope ? await db.company.findFirst({ where: { id, ...scope } }) : null;
  if (id && !existing) return { error: "Company not found or you can't edit it." };

  const name = str(fd, "name");
  if (name.length < 2) return { error: "Company name is required." };
  const ownerId = await resolveOwner(user, "crm.contacts", str(fd, "ownerId"), existing?.ownerId);
  const data = {
    name, phone: str(fd, "phone") || null, email: str(fd, "email").toLowerCase() || null, industry: str(fd, "industry") || null,
    address: str(fd, "address") || null, notes: str(fd, "notes") || null, ownerId, branchId: await ownerBranch(ownerId),
  };
  const company = existing ? await db.company.update({ where: { id }, data }) : await db.company.create({ data });
  await audit(user.id, existing ? "update" : "create", "company", company.id, `${existing ? "Updated" : "Created"} company ${name}`);
  revalidatePath("/crm/contacts");
  redirect(`/crm/companies/${company.id}`);
}

export async function deleteCompany(fd: FormData) {
  const user = await requirePermission("crm.contacts", "delete");
  const scope = await scopeWhere(user, "crm.contacts", "delete");
  const id = str(fd, "id");
  const company = scope ? await db.company.findFirst({ where: { id, ...scope } }) : null;
  if (company) {
    await db.company.delete({ where: { id } });
    await audit(user.id, "delete", "company", id, `Deleted company ${company.name}`);
  }
  redirect("/crm/contacts?tab=companies");
}
