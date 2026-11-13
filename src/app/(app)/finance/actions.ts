"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/files";
import { pkr } from "@/lib/finance";
import { str, type FormState } from "@/lib/utils";

const refresh = () => ["/finance", "/finance/entries", "/finance/holders", "/finance/categories"].forEach((p) => revalidatePath(p));

/** Add or edit one entry: an expense, money received, or a transfer between holders. */
export async function saveEntry(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("finance", id ? "edit" : "create");
  const kind = ["expense", "in", "transfer"].includes(str(fd, "kind")) ? str(fd, "kind") : "expense";
  const amount = parseFloat(str(fd, "amount").replace(/,/g, ""));
  const date = new Date(`${str(fd, "date")}T12:00:00`);
  const accountId = str(fd, "accountId");
  const toAccountId = kind === "transfer" ? str(fd, "toAccountId") : "";
  const categoryId = kind === "expense" ? str(fd, "categoryId") : "";
  const description = str(fd, "description").slice(0, 300);
  if (!(amount > 0)) return { error: "Enter the amount." };
  if (Number.isNaN(date.getTime())) return { error: "Enter the date." };
  if (!accountId) return { error: kind === "in" ? "Who received the money?" : "Who paid?" };
  if (kind === "transfer" && (!toAccountId || toAccountId === accountId)) return { error: "Choose who the money went to (someone else)." };
  if (kind === "expense" && !categoryId) return { error: "Choose the category." };
  if (!description) return { error: "Write what it was for." };
  const cat = categoryId ? await db.finCategory.findUnique({ where: { id: categoryId }, include: { parent: true } }) : null;
  const personal = !!(cat?.personal || cat?.parent?.personal || fd.get("personal") === "on");
  let receipt: string | undefined;
  const file = fd.get("receipt");
  if (file instanceof File && file.size) {
    const res = await saveUpload(file, "finance", { maxBytes: 10_000_000, allowPdf: true });
    if ("error" in res) return { error: `Receipt: ${res.error}` };
    receipt = res.path;
  }
  const data = {
    kind, amount, date, accountId, toAccountId: toAccountId || null, categoryId: categoryId || null, description,
    party: str(fd, "party").slice(0, 120) || null, personal, notes: str(fd, "notes").slice(0, 1000) || null, ...(receipt && { receipt }),
  };
  const e = id ? await db.finEntry.update({ where: { id }, data }) : await db.finEntry.create({ data: { ...data, createdById: user.id } });
  await audit(user.id, id ? "update" : "create", "finEntry", e.id, `${id ? "Edited" : "Added"} ${kind === "in" ? "money in" : kind} ${pkr(amount)}: ${description}`);
  refresh();
  redirect(str(fd, "back") || "/finance/entries");
}

export async function deleteEntry(fd: FormData) {
  const user = await requirePermission("finance", "delete");
  const e = await db.finEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!e) return;
  await db.finEntry.delete({ where: { id: e.id } });
  await audit(user.id, "delete", "finEntry", e.id, `Deleted ${e.kind} ${pkr(e.amount)}: ${e.description}`);
  refresh();
}

/** Add or edit a money holder (petty cash, person, owner, bank, card). */
export async function saveHolder(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const user = await requirePermission("finance", id ? "edit" : "create");
  const name = str(fd, "name").slice(0, 60);
  if (name.length < 2) return { error: "Enter a name." };
  const clash = await db.finAccount.findUnique({ where: { name } });
  if (clash && clash.id !== id) return { error: `“${name}” already exists.` };
  const data = { name, kind: str(fd, "kind") || "person", opening: parseFloat(str(fd, "opening").replace(/,/g, "")) || 0, notes: str(fd, "notes") || null, branch: str(fd, "branch").slice(0, 40) || null, active: id ? fd.get("active") === "on" : true };
  if (id) await db.finAccount.update({ where: { id }, data });
  else await db.finAccount.create({ data });
  await audit(user.id, id ? "update" : "create", "finAccount", id || null, `${id ? "Updated" : "Added"} money holder ${name}`);
  refresh();
  redirect("/finance/holders");
}

export async function deleteHolder(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "delete");
  const a = await db.finAccount.findUnique({ where: { id: str(fd, "id") }, include: { _count: { select: { entries: true, incoming: true } } } });
  if (!a) return { error: "Already deleted." };
  if (a._count.entries + a._count.incoming) return { error: `${a.name} has ${a._count.entries + a._count.incoming} entries. Untick Active to hide it instead.` };
  await db.finAccount.delete({ where: { id: a.id } });
  await audit(user.id, "delete", "finAccount", a.id, `Deleted money holder ${a.name}`);
  refresh();
  return { ok: true, message: "Deleted." };
}

/** Add, rename or remove a category / sub-category. */
export async function saveCategory(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "edit");
  const op = str(fd, "op");
  const id = str(fd, "id");
  if (op === "delete") {
    const c = await db.finCategory.findUnique({ where: { id }, include: { _count: { select: { entries: true } }, children: { include: { _count: { select: { entries: true } } } } } });
    if (!c) return { error: "Already deleted." };
    const used = c._count.entries + c.children.reduce((s, x) => s + x._count.entries, 0);
    if (used) return { error: `${c.name} is used by ${used} entries. Rename it instead.` };
    await db.finCategory.delete({ where: { id } });
    await audit(user.id, "delete", "finCategory", id, `Deleted category ${c.name}`);
  } else {
    const name = str(fd, "name").slice(0, 60);
    if (name.length < 2) return { error: "Enter a name." };
    if (id) await db.finCategory.update({ where: { id }, data: { name, personal: fd.get("personal") === "on" } });
    else await db.finCategory.create({ data: { name, parentId: str(fd, "parentId") || null, personal: fd.get("personal") === "on", sortOrder: 99 } });
    await audit(user.id, id ? "update" : "create", "finCategory", id || null, `${id ? "Renamed" : "Added"} category ${name}`);
  }
  refresh();
  return { ok: true, message: "Saved." };
}

/** Import the expense workbook. Rows already imported are skipped, so the same sheet can be uploaded again. */
export async function importWorkbook(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "import");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose your Excel file (.xlsx)." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "Only .xlsx files can be imported." };
  if (file.size > 20_000_000) return { error: "File is larger than 20 MB." };
  try {
    const { importExpenseWorkbook } = await import("@/lib/finance-import");
    const r = await importExpenseWorkbook(await file.arrayBuffer(), user.id, { replace: fd.get("replace") === "on" });
    await audit(user.id, "import", "finImport", null, `Imported ${r.added} finance entries from ${file.name} (${r.skipped} already there)`);
    revalidatePath("/finance");
    const per = Object.entries(r.perSheet).map(([k, v]) => `${k}: ${v}`).join(", ");
    return { ok: true, message: `${r.removed ? `Removed ${r.removed} entries from the earlier import. ` : ""}Added ${r.added} entries${per ? ` (${per})` : ""}. ${r.skipped} were already imported and skipped.${r.holders.length ? ` New money holders: ${r.holders.join(", ")}.` : ""}` };
  } catch (e) {
    return { error: `Could not read the file: ${e instanceof Error ? e.message : "unknown error"}` };
  }
}
