"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/files";
import { balances, checkBudget, cleanTags, payeeKey, financeApproverIds, financeConfig, isClosed, pkr, saveFinanceConfig } from "@/lib/finance";
import { notify } from "@/lib/notify";
import { str, type FormState } from "@/lib/utils";

const refresh = () => ["/finance", "/finance/entries", "/finance/holders", "/finance/categories"].forEach((p) => revalidatePath(p));

/** Add or edit one entry: an expense, money received, or a transfer between holders. */
export async function saveEntry(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const wasPersonal = id ? (await db.finEntry.findUnique({ where: { id }, select: { personal: true } }))?.personal : false;
  const user = await requirePermission(fd.get("personal") === "on" || wasPersonal ? "finance.personal" : "finance", id ? "edit" : "create");
  const kind = ["expense", "in", "transfer"].includes(str(fd, "kind")) ? str(fd, "kind") : "expense";
  const amount = parseFloat(str(fd, "amount").replace(/,/g, ""));
  const date = new Date(`${str(fd, "date")}T12:00:00`);
  const accountId = str(fd, "accountId");
  const toAccountId = kind === "transfer" ? str(fd, "toAccountId") : "";
  const categoryId = kind === "expense" ? str(fd, "categoryId") : "";
  let description = str(fd, "description").slice(0, 300);
  // Quick add: no description typed → use the category name.
  if (!description && fd.get("quick") && categoryId) description = (await db.finCategory.findUnique({ where: { id: categoryId } }))?.name ?? "";
  if (!(amount > 0)) return { error: "Enter the amount." };
  if (Number.isNaN(date.getTime())) return { error: "Enter the date." };
  if (!accountId) return { error: kind === "in" ? "Who received the money?" : "Who paid?" };
  if (kind === "transfer" && (!toAccountId || toAccountId === accountId)) return { error: "Choose who the money went to (someone else)." };
  if (kind === "expense" && !categoryId) return { error: "Choose the category." };
  if (!description) return { error: "Write what it was for." };
  const cat = categoryId ? await db.finCategory.findUnique({ where: { id: categoryId }, include: { parent: true } }) : null;
  const personal = !!(cat?.personal || cat?.parent?.personal || fd.get("personal") === "on");
  if (personal && !can(user, "finance.personal", id ? "edit" : "create")) return { error: "You don't have access to Sir personal expenses." };
  const cfg = await financeConfig();
  const before = id ? await db.finEntry.findUnique({ where: { id } }) : null;
  if (isClosed(date, cfg) || (before && isClosed(before.date, cfg))) return { error: `${cfg.closedThrough} and earlier months are closed. Ask a Super Admin to reopen the month in Finance → Settings.` };
  // Big expenses wait for the boss (unless the person saving can approve).
  const needsApproval = kind === "expense" && cfg.approvalAbove > 0 && amount >= cfg.approvalAbove && !can(user, "finance", "approve");
  const status = needsApproval && (!before || before.status !== "approved" || amount > before.amount) ? "pending" : before?.status ?? "approved";
  // Proof: any number of bills / receipts / transfer screenshots, from files or the phone camera.
  const files = [...fd.getAll("proofs"), ...fd.getAll("photo")].filter((f): f is File => f instanceof File && f.size > 0);
  const hadProof = id ? (await db.finProof.count({ where: { entryId: id } })) + ((await db.finEntry.findUnique({ where: { id }, select: { receipt: true } }))?.receipt ? 1 : 0) : 0;
  if (cfg.proofAbove > 0 && amount >= cfg.proofAbove && !files.length && !hadProof) return { error: `Attach the bill, receipt or transfer screenshot: proof is required for ${pkr(cfg.proofAbove)} and above.` };
  const saved: { path: string; name: string; size: number }[] = [];
  for (const f of files.slice(0, 10)) {
    const res = await saveUpload(f, "finance", { maxBytes: 10_000_000, allowPdf: true });
    if ("error" in res) return { error: `Proof: ${res.error}` };
    saved.push({ path: res.path, name: f.name.slice(0, 120), size: res.size });
  }
  const data = {
    kind, amount, date, accountId, toAccountId: toAccountId || null, categoryId: categoryId || null, description,
    party: await samePayee(str(fd, "party").slice(0, 120)), tags: cleanTags(str(fd, "tags")), personal, notes: str(fd, "notes").slice(0, 1000) || null,
    status, ...(status === "pending" && { approvedAt: null, approvedById: null, rejectReason: null }),
    ...(str(fd, "recurringId") && { recurringId: str(fd, "recurringId") }),
  };
  const e = id ? await db.finEntry.update({ where: { id }, data }) : await db.finEntry.create({ data: { ...data, createdById: user.id } });
  if (data.recurringId) await db.finRecurring.update({ where: { id: data.recurringId }, data: { lastPaid: date.toISOString().slice(0, 7) } }).catch(() => {});
  if (saved.length) await db.finProof.createMany({ data: saved.map((p) => ({ ...p, entryId: e.id, createdById: user.id })) });
  if (!before && kind === "expense" && !personal) await (await import("@/lib/finance-weekly")).alertBigExpense(e, user.name, cfg.alertAbove).catch(() => {});
  if (status === "approved" && kind !== "in") await checkLowCash(accountId, amount).catch(() => {});
  if (status === "approved" && kind === "expense" && !personal) await checkBudget(e.categoryId, e.date).catch(() => {});
  if (status === "pending" && before?.status !== "pending") {
    for (const uid of await financeApproverIds()) await notify(uid, `Approve expense: ${pkr(amount)}`, { body: `${description} — entered by ${user.name}`, link: `/finance/entries/${e.id}` });
  }
  await audit(user.id, id ? "update" : "create", "finEntry", e.id, `${id ? "Edited" : "Added"} ${kind === "in" ? "money in" : kind} ${pkr(amount)}: ${description}`);
  refresh();
  redirect(str(fd, "back") || "/finance/entries");
}

export async function deleteEntry(fd: FormData) {
  const e = await db.finEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!e) return;
  const user = await requirePermission(e.personal ? "finance.personal" : "finance", "delete");
  if (isClosed(e.date, await financeConfig())) return;
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
  const data = { name, kind: str(fd, "kind") || "person", opening: parseFloat(str(fd, "opening").replace(/,/g, "")) || 0, notes: str(fd, "notes") || null, branch: str(fd, "branch").slice(0, 40) || null, lowAlert: parseFloat(str(fd, "lowAlert").replace(/,/g, "")) || null, active: id ? fd.get("active") === "on" : true };
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
  const user = await requirePermission("finance.settings", "edit");
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

/** Add more proof to an entry (bill, receipt, screenshot). */
export async function addProof(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const e = await db.finEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!e) return { error: "Entry not found." };
  const files = [...fd.getAll("proofs"), ...fd.getAll("photo")].filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose a file or take a photo." };
  for (const f of files.slice(0, 10)) {
    const res = await saveUpload(f, "finance", { maxBytes: 10_000_000, allowPdf: true });
    if ("error" in res) return { error: res.error };
    await db.finProof.create({ data: { entryId: e.id, path: res.path, name: f.name.slice(0, 120), size: res.size, createdById: user.id } });
  }
  // New proof needs checking again.
  if (e.verifiedAt) await db.finEntry.update({ where: { id: e.id }, data: { verifiedAt: null, verifiedById: null } });
  await audit(user.id, "update", "finEntry", e.id, `Added ${files.length} proof file(s) to ${e.description} (${pkr(e.amount)})`);
  revalidatePath(`/finance/entries/${e.id}`);
  refresh();
  return { ok: true, message: "Proof added." };
}

export async function deleteProof(fd: FormData) {
  const user = await requirePermission("finance", "delete");
  const p = await db.finProof.findUnique({ where: { id: str(fd, "id") }, include: { entry: true } });
  if (!p) return;
  await db.finProof.delete({ where: { id: p.id } });
  await audit(user.id, "update", "finEntry", p.entryId, `Removed proof ${p.name} from ${p.entry.description}`);
  revalidatePath(`/finance/entries/${p.entryId}`);
}

/** Boss / accounts: mark the proof as checked (or undo). */
export async function verifyEntry(fd: FormData) {
  const user = await requirePermission("finance", "approve");
  const e = await db.finEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!e) return;
  const undo = str(fd, "undo") === "1";
  await db.finEntry.update({ where: { id: e.id }, data: undo ? { verifiedAt: null, verifiedById: null } : { verifiedAt: new Date(), verifiedById: user.id } });
  await audit(user.id, "update", "finEntry", e.id, `${undo ? "Un-verified" : "Verified"} proof of ${e.description} (${pkr(e.amount)})`);
  revalidatePath(`/finance/entries/${e.id}`);
  refresh();
}

/** Finance settings (Super Admin): proof limit, approval limit, month close. */
export async function saveFinanceSettings(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance.settings", "edit");
  const num = (k: string) => Math.max(0, parseFloat(str(fd, k).replace(/,/g, "")) || 0);
  const patch: Record<string, number | string> = {};
  if (fd.has("proofAbove")) patch.proofAbove = num("proofAbove");
  if (fd.has("approvalAbove")) patch.approvalAbove = num("approvalAbove");
  if (fd.has("alertAbove")) patch.alertAbove = num("alertAbove");
  if (fd.has("closedThrough")) patch.closedThrough = /^\d{4}-\d{2}$/.test(str(fd, "closedThrough")) ? str(fd, "closedThrough") : "";
  await saveFinanceConfig(patch);
  await audit(user.id, "update", "setting", "finance.config", `Finance settings: ${JSON.stringify(patch)}`);
  revalidatePath("/finance/settings");
  return { ok: true, message: "Saved." };
}

/** Boss: approve or reject an expense waiting for approval. */
export async function decideEntry(fd: FormData) {
  const user = await requirePermission("finance", "approve");
  const e = await db.finEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!e || e.status !== "pending") return;
  const approve = str(fd, "op") === "approve";
  const reason = str(fd, "reason").slice(0, 300) || null;
  await db.finEntry.update({ where: { id: e.id }, data: approve ? { status: "approved", approvedById: user.id, approvedAt: new Date(), rejectReason: null } : { status: "rejected", approvedById: user.id, approvedAt: new Date(), rejectReason: reason } });
  if (approve && !e.personal) await checkBudget(e.categoryId, e.date).catch(() => {});
  await audit(user.id, approve ? "approve" : "reject", "finEntry", e.id, `${approve ? "Approved" : "Rejected"} ${e.description} (${pkr(e.amount)})${reason ? `: ${reason}` : ""}`);
  if (e.createdById && e.createdById !== user.id) await notify(e.createdById, `${approve ? "Approved" : "Rejected"}: ${e.description} (${pkr(e.amount)})`, { body: reason ?? undefined, link: `/finance/entries/${e.id}` });
  revalidatePath("/finance/approvals");
  revalidatePath(`/finance/entries/${e.id}`);
  refresh();
}

/** Monthly budgets per main category (blank = no budget). */
export async function saveBudgets(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance.settings", "edit");
  const cats = await db.finCategory.findMany({ where: { parentId: null, personal: false } });
  for (const c of cats) {
    if (!fd.has(`b_${c.id}`)) continue;
    const amount = parseFloat(str(fd, `b_${c.id}`).replace(/,/g, "")) || 0;
    if (amount > 0) await db.finBudget.upsert({ where: { categoryId: c.id }, update: { amount }, create: { categoryId: c.id, amount } });
    else await db.finBudget.deleteMany({ where: { categoryId: c.id } });
  }
  await audit(user.id, "update", "finCategory", null, "Updated monthly budgets");
  revalidatePath("/finance/budgets");
  return { ok: true, message: "Budgets saved." };
}

/** Add / edit / stop a monthly bill. */
export async function saveBill(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const id = str(fd, "id");
  if (str(fd, "op") === "delete") {
    await db.finRecurring.delete({ where: { id } }).catch(() => {});
    await audit(user.id, "delete", "finCategory", id, "Removed a monthly bill");
    revalidatePath("/finance/bills");
    redirect("/finance/bills");
  }
  const name = str(fd, "name").slice(0, 80);
  const amount = parseFloat(str(fd, "amount").replace(/,/g, "")) || 0;
  const day = Math.min(31, Math.max(1, parseInt(str(fd, "dayOfMonth")) || 1));
  if (name.length < 2) return { error: "Name the bill, e.g. K-Electric (DHA office)." };
  if (!(amount > 0)) return { error: "Enter the usual amount." };
  const data = { name, amount, dayOfMonth: day, categoryId: str(fd, "categoryId") || null, accountId: str(fd, "accountId") || null, party: str(fd, "party").slice(0, 120) || null, notes: str(fd, "notes") || null, active: id ? fd.get("active") === "on" : true };
  if (id) await db.finRecurring.update({ where: { id }, data });
  else await db.finRecurring.create({ data });
  await audit(user.id, id ? "update" : "create", "finCategory", id || null, `${id ? "Updated" : "Added"} monthly bill ${name} (${pkr(amount)})`);
  revalidatePath("/finance/bills");
  redirect("/finance/bills");
}

/** Turn an existing entry into a monthly bill. */
export async function makeBill(fd: FormData) {
  const user = await requirePermission("finance", "create");
  const e = await db.finEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!e) return;
  const b = await db.finRecurring.create({ data: { name: e.party || e.description.slice(0, 80), amount: e.amount, dayOfMonth: e.date.getDate(), categoryId: e.categoryId, accountId: e.accountId, party: e.party, lastPaid: e.date.toISOString().slice(0, 7) } });
  await db.finEntry.update({ where: { id: e.id }, data: { recurringId: b.id } });
  await audit(user.id, "create", "finCategory", b.id, `Made ${b.name} a monthly bill`);
  redirect(`/finance/bills?edit=${b.id}`);
}

/** Warn approvers when this payment takes a holder below their low-cash level. */
async function checkLowCash(accountId: string, amount: number) {
  const h = (await balances()).find((a) => a.id === accountId);
  if (!h?.lowAlert || h.balance >= h.lowAlert || h.balance + amount < h.lowAlert) return;
  for (const uid of await financeApproverIds()) await notify(uid, `${h.name} is low on cash: ${pkr(h.balance)}`, { body: `Below the ${pkr(h.lowAlert)} level. Top it up from Money holders.`, link: "/finance/holders" });
}

/** Ask for more cash for a holder (e.g. Bushra's petty cash running low). */
export async function requestTopup(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const amount = parseFloat(str(fd, "amount").replace(/,/g, "")) || 0;
  const a = await db.finAccount.findUnique({ where: { id: str(fd, "accountId") } });
  if (!a) return { error: "Choose the holder." };
  if (!(amount > 0)) return { error: "Enter the amount needed." };
  const t = await db.finTopup.create({ data: { accountId: a.id, amount, note: str(fd, "note").slice(0, 300) || null, requestedById: user.id } });
  for (const uid of await financeApproverIds()) if (uid !== user.id) await notify(uid, `Top-up request: ${pkr(amount)} for ${a.name}`, { body: `${user.name}${t.note ? `: ${t.note}` : ""}`, link: "/finance/holders" });
  await audit(user.id, "create", "finAccount", a.id, `Requested a ${pkr(amount)} top-up for ${a.name}`);
  revalidatePath("/finance/holders");
  redirect("/finance/holders");
}

/** Approve (money goes from the chosen holder, or comes in from outside) or reject a top-up request. */
export async function decideTopup(fd: FormData) {
  const user = await requirePermission("finance", "approve");
  const t = await db.finTopup.findUnique({ where: { id: str(fd, "id") }, include: { account: true } });
  if (!t || t.status !== "pending") return;
  if (str(fd, "op") === "reject") {
    await db.finTopup.update({ where: { id: t.id }, data: { status: "rejected", decidedById: user.id, decidedAt: new Date() } });
    if (t.requestedById) await notify(t.requestedById, `Top-up of ${pkr(t.amount)} for ${t.account.name} was not approved`, { link: "/finance/holders" });
  } else {
    const amount = parseFloat(str(fd, "amount").replace(/,/g, "")) || t.amount;
    const from = str(fd, "fromId");
    const e = await db.finEntry.create({ data: from
      ? { kind: "transfer", amount, date: new Date(), accountId: from, toAccountId: t.accountId, description: `Top-up for ${t.account.name}`, createdById: user.id, approvedById: user.id, approvedAt: new Date() }
      : { kind: "in", amount, date: new Date(), accountId: t.accountId, description: "Top-up approved", party: str(fd, "party") || null, createdById: user.id, approvedById: user.id, approvedAt: new Date() } });
    await db.finTopup.update({ where: { id: t.id }, data: { status: "approved", decidedById: user.id, decidedAt: new Date(), entryId: e.id, amount } });
    if (t.requestedById) await notify(t.requestedById, `Top-up approved: ${pkr(amount)} for ${t.account.name}`, { body: "Attach the transfer screenshot on the entry.", link: `/finance/entries/${e.id}` });
  }
  await audit(user.id, "update", "finAccount", t.accountId, `${str(fd, "op") === "reject" ? "Rejected" : "Approved"} top-up of ${pkr(t.amount)} for ${t.account.name}`);
  refresh();
}

/** Pay back someone the company owes (negative balance): a transfer from the chosen holder. */
export async function settleHolder(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const to = await db.finAccount.findUnique({ where: { id: str(fd, "id") } });
  const from = str(fd, "fromId");
  const amount = parseFloat(str(fd, "amount").replace(/,/g, "")) || 0;
  if (!to || !from || from === to.id) return { error: "Choose who pays them back." };
  if (!(amount > 0)) return { error: "Enter the amount." };
  const e = await db.finEntry.create({ data: { kind: "transfer", amount, date: new Date(), accountId: from, toAccountId: to.id, description: `Paid back to ${to.name}`, notes: str(fd, "note") || null, createdById: user.id } });
  await audit(user.id, "create", "finEntry", e.id, `Paid back ${pkr(amount)} to ${to.name}`);
  refresh();
  redirect(`/finance/entries/${e.id}`);
}

/** Use the payee's existing spelling when the same name is typed differently. */
async function samePayee(name: string) {
  if (!name) return null;
  const key = payeeKey(name);
  const known = await db.finEntry.findMany({ where: { party: { not: null } }, select: { party: true }, distinct: ["party"], take: 5000 });
  return known.find((k) => k.party && payeeKey(k.party) === key)?.party ?? name;
}

/** Payees: rename one or merge several spellings into one name. */
export async function mergePayees(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "edit");
  const names = fd.getAll("names").map(String).filter(Boolean);
  const to = str(fd, "to").slice(0, 120);
  if (!names.length) return { error: "Tick the names to merge." };
  if (to.length < 2) return { error: "Write the correct name." };
  const r = await db.finEntry.updateMany({ where: { party: { in: names } }, data: { party: to } });
  await db.finRecurring.updateMany({ where: { party: { in: names } }, data: { party: to } });
  await audit(user.id, "update", "finEntry", null, `Payees ${names.join(", ")} → ${to} (${r.count} entries)`);
  refresh();
  revalidatePath("/finance/payees");
  return { ok: true, message: `${r.count} entries now say “${to}”.` };
}

/** Pay an approved HR expense claim in cash from a holder: records the expense (with the claim's receipt) and marks the claim paid so payroll skips it. */
export async function payClaim(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const c = await db.expense.findUnique({ where: { id: str(fd, "id") }, include: { employee: true } });
  const accountId = str(fd, "accountId");
  if (!c || c.status !== "approved" || c.runId) return { error: "This claim is no longer waiting for payment." };
  if (!accountId) return { error: "Choose who pays it." };
  const { categoryForClaim } = await import("@/lib/finance");
  const e = await db.finEntry.create({ data: {
    kind: "expense", amount: c.amount, date: new Date(), accountId, categoryId: await categoryForClaim(c.category), description: `Claim: ${c.category}${c.description ? ` — ${c.description}` : ""} (${c.employee.fullName})`,
    party: c.employee.fullName, sourceType: "expense", sourceId: c.id, createdById: user.id,
  } });
  if (c.receipt) await db.finProof.create({ data: { entryId: e.id, path: c.receipt, name: "Claim receipt", createdById: user.id } });
  await db.expense.update({ where: { id: c.id }, data: { status: "paid" } });
  if (c.employee.userId) await notify(c.employee.userId, `Your ${c.category} claim of ${pkr(c.amount)} was paid`, { link: "/me/expenses" });
  await audit(user.id, "create", "finEntry", e.id, `Paid claim of ${c.employee.fullName}: ${pkr(c.amount)}`);
  refresh();
  revalidatePath("/finance/claims");
  return { ok: true, message: `Paid ${pkr(c.amount)} to ${c.employee.fullName}.` };
}

/** Record a paid HR payroll month in Finance as one salary expense (only the part not already entered by hand). */
export async function recordPayroll(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const run = await db.payrollRun.findUnique({ where: { id: str(fd, "id") } });
  const accountId = str(fd, "accountId");
  const amount = parseFloat(str(fd, "amount").replace(/,/g, "")) || 0;
  if (!run) return { error: "Payroll month not found." };
  if (!accountId) return { error: "Choose the account the salaries were paid from." };
  if (!(amount > 0)) return { error: "Nothing to record." };
  if (await db.finEntry.findFirst({ where: { sourceType: "payroll", sourceId: run.id } })) return { error: "This month is already recorded." };
  const main = await db.finCategory.findFirst({ where: { parentId: null, name: "Employee & HR" } });
  const sal = main && (await db.finCategory.findFirst({ where: { parentId: main.id, name: "Salaries" } }));
  const [y, m] = run.month.split("-").map(Number);
  const e = await db.finEntry.create({ data: {
    kind: "expense", amount, date: run.paidAt ?? new Date(y!, m!, 0, 12), accountId, categoryId: sal?.id ?? main?.id ?? null,
    description: `Salaries ${run.month} (HR payroll)`, party: "Staff salaries", sourceType: "payroll", sourceId: run.id, createdById: user.id,
  } });
  await audit(user.id, "create", "finEntry", e.id, `Recorded payroll ${run.month} in Finance: ${pkr(amount)}`);
  refresh();
  revalidatePath("/finance/payroll");
  return { ok: true, message: `Recorded ${pkr(amount)}. Attach the bank transfer sheet on the entry.` };
}

/** Day-end cash count: what was physically counted vs what AMS calculated. A difference can be booked as cash short / extra. */
export async function saveCashCount(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const accountId = str(fd, "accountId");
  const counted = parseFloat(str(fd, "counted").replace(/,/g, ""));
  if (!accountId) return { error: "Choose whose cash you counted." };
  if (Number.isNaN(counted)) return { error: "Enter the cash you counted." };
  const h = (await balances()).find((a) => a.id === accountId);
  if (!h) return { error: "Holder not found." };
  const diff = Math.round((counted - h.balance) * 100) / 100;
  const note = str(fd, "note").slice(0, 300) || null;
  if (diff !== 0 && !note) return { error: `Counted cash is ${pkr(Math.abs(diff))} ${diff < 0 ? "less" : "more"} than AMS shows. Write the reason (e.g. forgot to enter a bill).` };
  await db.finCashCount.create({ data: { accountId, date: new Date(), counted, expected: h.balance, note, createdById: user.id } });
  if (diff !== 0 && fd.get("book") === "on") {
    const misc = await db.finCategory.findFirst({ where: { parentId: null, name: "Miscellaneous" } });
    await db.finEntry.create({ data: diff < 0
      ? { kind: "expense", amount: -diff, date: new Date(), accountId, categoryId: misc?.id ?? null, description: `Cash short at count: ${note}`, createdById: user.id }
      : { kind: "in", amount: diff, date: new Date(), accountId, description: `Extra cash at count: ${note}`, createdById: user.id } });
  }
  if (Math.abs(diff) >= 1000) for (const uid of await financeApproverIds()) if (uid !== user.id) await notify(uid, `Cash count difference: ${h.name} ${diff < 0 ? "short" : "extra"} ${pkr(Math.abs(diff))}`, { body: note ?? undefined, link: "/finance/cash-count" });
  await audit(user.id, "create", "finAccount", accountId, `Cash count ${h.name}: counted ${pkr(counted)}, AMS ${pkr(h.balance)}${diff ? ` (${diff < 0 ? "short" : "extra"} ${pkr(Math.abs(diff))})` : " — matches"}`);
  refresh();
  revalidatePath("/finance/cash-count");
  return { ok: true, message: diff === 0 ? "Matches exactly." : `Saved with a difference of ${pkr(Math.abs(diff))}.` };
}

/** Give an advance / loan to an employee: creates the HR loan (installments come off salary) and the Finance payout. */
export async function giveAdvance(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const loanId = str(fd, "loanId");
  const accountId = str(fd, "accountId");
  if (!accountId) return { error: "Choose who pays it out." };
  let loan;
  if (loanId) {
    loan = await db.loan.findUnique({ where: { id: loanId }, include: { employee: true } });
    if (!loan || loan.status !== "active") return { error: "This loan is not approved / active." };
  } else {
    const emp = await db.employee.findUnique({ where: { id: str(fd, "employeeId") } });
    const amount = parseFloat(str(fd, "amount").replace(/,/g, "")) || 0;
    const installment = parseFloat(str(fd, "installment").replace(/,/g, "")) || amount;
    const startMonth = /^\d{4}-\d{2}$/.test(str(fd, "startMonth")) ? str(fd, "startMonth") : "";
    if (!emp) return { error: "Choose the employee." };
    if (!(amount > 0)) return { error: "Enter the amount." };
    if (!startMonth) return { error: "Choose the first salary month to deduct from." };
    loan = await db.loan.create({ data: { employeeId: emp.id, kind: str(fd, "kind") === "loan" ? "loan" : "advance", amount, installment: Math.min(installment, amount), startMonth, reason: str(fd, "reason") || null, status: "active" }, include: { employee: true } });
  }
  if (await db.finEntry.findFirst({ where: { sourceType: "loan", sourceId: loan.id } })) return { error: "Already paid out." };
  const main = await db.finCategory.findFirst({ where: { parentId: null, name: "Employee & HR" } });
  const sub = main && (await db.finCategory.findFirst({ where: { parentId: main.id, name: "Advance/Loan" } }));
  const e = await db.finEntry.create({ data: { kind: "expense", amount: loan.amount, date: new Date(), accountId, categoryId: sub?.id ?? main?.id ?? null, description: `${loan.kind === "loan" ? "Loan" : "Advance"} to ${loan.employee.fullName}${loan.reason ? ` — ${loan.reason}` : ""}`, party: loan.employee.fullName, sourceType: "loan", sourceId: loan.id, createdById: user.id } });
  await audit(user.id, "create", "finEntry", e.id, `Paid ${loan.kind} of ${pkr(loan.amount)} to ${loan.employee.fullName}`);
  if (loan.employee.userId) await notify(loan.employee.userId, `Your ${loan.kind} of ${pkr(loan.amount)} was paid`, { body: `${pkr(loan.installment)} per month from your ${loan.startMonth} salary.`, link: "/me/expenses" });
  refresh();
  revalidatePath("/finance/advances");
  return { ok: true, message: `Paid ${pkr(loan.amount)} to ${loan.employee.fullName}.` };
}

/** A supplier bill not paid yet (what the company owes a vendor). */
export async function savePayable(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const party = await samePayee(str(fd, "party").slice(0, 120));
  const amount = parseFloat(str(fd, "amount").replace(/,/g, "")) || 0;
  const billDate = new Date(`${str(fd, "billDate")}T12:00:00`);
  const due = str(fd, "dueDate") ? new Date(`${str(fd, "dueDate")}T12:00:00`) : null;
  if (!party) return { error: "Who is the supplier?" };
  if (!(amount > 0)) return { error: "Enter the bill amount." };
  if (Number.isNaN(billDate.getTime())) return { error: "Enter the bill date." };
  let proof: string | null = null;
  const f = [...fd.getAll("proofs"), ...fd.getAll("photo")].find((x): x is File => x instanceof File && x.size > 0);
  if (f) { const r = await saveUpload(f, "finance", { maxBytes: 10_000_000, allowPdf: true }); if ("error" in r) return { error: r.error }; proof = r.path; }
  const p = await db.finPayable.create({ data: { party, description: str(fd, "description").slice(0, 200) || "Bill", amount, billDate, dueDate: due, categoryId: str(fd, "categoryId") || null, proof, createdById: user.id } });
  await audit(user.id, "create", "finEntry", p.id, `Supplier bill from ${party}: ${pkr(amount)}`);
  revalidatePath("/finance/vendors");
  return { ok: true, message: `Bill from ${party} saved.` };
}

/** Pay a supplier bill: records the expense (bill attached as proof) and closes the bill. */
export async function payPayable(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("finance", "create");
  const p = await db.finPayable.findUnique({ where: { id: str(fd, "id") } });
  const accountId = str(fd, "accountId");
  if (!p || p.status !== "open") return { error: "This bill is not open." };
  if (!accountId) return { error: "Choose who pays it." };
  const e = await db.finEntry.create({ data: { kind: "expense", amount: p.amount, date: new Date(), accountId, categoryId: p.categoryId, description: `${p.description} (${p.party})`, party: p.party, sourceType: "payable", sourceId: p.id, createdById: user.id } });
  if (p.proof) await db.finProof.create({ data: { entryId: e.id, path: p.proof, name: "Supplier bill", createdById: user.id } });
  await db.finPayable.update({ where: { id: p.id }, data: { status: "paid", entryId: e.id } });
  await audit(user.id, "create", "finEntry", e.id, `Paid ${p.party} bill ${pkr(p.amount)}`);
  refresh();
  revalidatePath("/finance/vendors");
  return { ok: true, message: `Paid ${pkr(p.amount)} to ${p.party}.` };
}

export async function cancelPayable(fd: FormData) {
  const user = await requirePermission("finance", "delete");
  const p = await db.finPayable.findUnique({ where: { id: str(fd, "id") } });
  if (!p || p.status !== "open") return;
  await db.finPayable.update({ where: { id: p.id }, data: { status: "cancelled" } });
  await audit(user.id, "delete", "finEntry", p.id, `Cancelled ${p.party} bill ${pkr(p.amount)}`);
  revalidatePath("/finance/vendors");
}
