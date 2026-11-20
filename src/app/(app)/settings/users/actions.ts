"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { smtpConfigured } from "@/lib/mail";
import { sendLoginEmail } from "@/lib/invites";
import { randomBytes } from "node:crypto";
import { str, type FormState } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2, "Name is required."),
  email: z.email("Enter a valid email."),
  phone: z.string(),
  title: z.string(),
  branchId: z.string(),
  managerId: z.string(),
  password: z.string(),
});

export async function saveUser(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const actor = await requirePermission("settings.users", id ? "edit" : "create");

  const parsed = schema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    phone: str(fd, "phone"),
    title: str(fd, "title"),
    branchId: str(fd, "branchId"),
    managerId: str(fd, "managerId"),
    password: str(fd, "password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const v = parsed.data;

  const welcome = !id && fd.get("sendWelcome") === "on";
  if (!id && !v.password && !welcome) return { error: "Enter a password, or tick the welcome email so they can set their own." };
  if (!id && !v.password && !smtpConfigured()) return { error: "Email isn't set up yet (Settings → Integrations), so enter a password for now." };
  if (!id && v.password && v.password.length < 8) return { error: "Set an initial password of at least 8 characters." };
  if (id && v.password && v.password.length < 8) return { error: "New password must be at least 8 characters." };
  if (id && v.managerId === id) return { error: "A user can't report to themselves." };

  const clash = await db.user.findUnique({ where: { email: v.email } });
  if (clash && clash.id !== id) return { error: "Another user already has this email." };

  let mailResult = "";
  const roleIds = fd.getAll("roleIds").map(String);
  // Roles limited to N people (e.g. Boss = 1): refuse when someone else already fills them.
  for (const r of await db.role.findMany({ where: { id: { in: roleIds }, maxUsers: { not: null } }, include: { users: { select: { userId: true } } } })) {
    const others = r.users.filter((u) => u.userId !== id).length;
    if (others >= r.maxUsers!) return { error: `Only ${r.maxUsers === 1 ? "one person" : `${r.maxUsers} people`} can have the ${r.name} role, and it's already taken.` };
  }
  const active = id === actor.id ? true : fd.get("active") === "on"; // can't deactivate yourself
  // Only a Super Admin can grant or revoke Super Admin.
  const isSuperAdmin = actor.isSuperAdmin ? fd.get("isSuperAdmin") === "on" || id === actor.id : undefined;

  const data = {
    name: v.name,
    email: v.email,
    phone: v.phone || null,
    title: v.title || null,
    branchId: v.branchId || null,
    managerId: v.managerId || null,
    active,
    ...(isSuperAdmin !== undefined && { isSuperAdmin }),
    ...(v.password && { passwordHash: await hashPassword(v.password) }),
  };

  if (id) {
    await db.$transaction([
      db.user.update({ where: { id }, data }),
      db.userRole.deleteMany({ where: { userId: id } }),
      db.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) }),
      ...(active ? [] : [db.session.deleteMany({ where: { userId: id } })]),
    ]);
    await audit(actor.id, "update", "user", id, `Updated user ${v.name}${v.password ? " (password reset)" : ""}`);
  } else {
    const created = await db.user.create({
      // No password chosen: a random one nobody knows, until they set theirs from the email.
      data: { ...data, passwordHash: data.passwordHash ?? (await hashPassword(randomBytes(24).toString("base64url"))), roles: { create: roleIds.map((roleId) => ({ roleId })) } },
    });
    if (welcome) mailResult = (await sendLoginEmail(created, actor.id)).status;
    await audit(actor.id, "create", "user", created.id, `Created user ${v.name}`);
  }

  revalidatePath("/settings/users");
  redirect(mailResult ? `/settings/users?mail=${mailResult}` : "/settings/users");
}

/** Emails an existing user a fresh link to set their password. */
export async function resendLoginEmail(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.users", "edit");
  const user = await db.user.findUnique({ where: { id: str(fd, "id") } });
  if (!user) return { error: "User not found." };
  if (!user.active) return { error: "This user is inactive. Activate them first." };
  if (!smtpConfigured()) return { error: "Email isn't set up yet. See Settings → Integrations." };
  const res = await sendLoginEmail(user, actor.id);
  await audit(actor.id, "update", "user", user.id, `Sent login email to ${user.email} (${res.status})`);
  return res.status === "sent" ? { ok: true, message: `Email sent to ${user.email}.` } : { error: `Couldn't send it: ${res.error}` };
}

/**
 * Settings → Users bulk bar: one change for every ticked user. You can't deactivate yourself, and roles limited to
 * N people (e.g. Boss) are never over-filled.
 */
export async function bulkUsers(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.users", "edit");
  const ids = [...new Set(fd.getAll("ids").map(String).filter(Boolean))];
  if (!ids.length) return { error: "Tick at least one user." };
  const op = str(fd, "op");
  const value = str(fd, "value");
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, active: true, isSuperAdmin: true, roles: { select: { roleId: true } } } });
  // Only a Super Admin changes other Super Admins.
  const targets = users.filter((u) => actor.isSuperAdmin || !u.isSuperAdmin);
  if (!targets.length) return { error: "Only a Super Admin can change Super Admin accounts." };
  const tIds = targets.map((u) => u.id);
  let message = "";

  if (op === "addRole" || op === "setRole") {
    const role = await db.role.findUnique({ where: { id: value }, include: { users: { select: { userId: true } } } });
    if (!role) return { error: "Choose a role." };
    const gaining = tIds.filter((id) => !role.users.some((r) => r.userId === id));
    if (role.maxUsers != null && role.users.length + gaining.length > role.maxUsers) return { error: `Only ${role.maxUsers === 1 ? "one person" : `${role.maxUsers} people`} can have the ${role.name} role.` };
    if (op === "setRole") await db.userRole.deleteMany({ where: { userId: { in: tIds }, roleId: { not: role.id } } });
    if (gaining.length) await db.userRole.createMany({ data: gaining.map((userId) => ({ userId, roleId: role.id })) });
    message = op === "setRole" ? `${targets.length} user(s) now have only the ${role.name} role.` : `${role.name} added to ${gaining.length} user(s)${gaining.length < targets.length ? ` (${targets.length - gaining.length} already had it)` : ""}.`;
  } else if (op === "removeRole") {
    const role = await db.role.findUnique({ where: { id: value } });
    if (!role) return { error: "Choose a role." };
    const n = (await db.userRole.deleteMany({ where: { userId: { in: tIds }, roleId: role.id } })).count;
    message = `${role.name} removed from ${n} user(s).`;
  } else if (op === "branch") {
    if (value && !(await db.branch.findUnique({ where: { id: value } }))) return { error: "Choose a branch." };
    await db.user.updateMany({ where: { id: { in: tIds } }, data: { branchId: value || null } });
    message = `Branch set for ${targets.length} user(s).`;
  } else if (op === "manager") {
    const pool = tIds.filter((id) => id !== value);
    if (value && !(await db.user.findFirst({ where: { id: value, active: true } }))) return { error: "Choose who they report to." };
    await db.user.updateMany({ where: { id: { in: pool } }, data: { managerId: value || null } });
    message = `"Reports to" set for ${pool.length} user(s)${pool.length < tIds.length ? " (nobody reports to themselves)" : ""}.`;
  } else if (op === "activate" || op === "deactivate") {
    const pool = op === "deactivate" ? tIds.filter((id) => id !== actor.id) : tIds;
    await db.user.updateMany({ where: { id: { in: pool } }, data: { active: op === "activate" } });
    if (op === "deactivate") await db.session.deleteMany({ where: { userId: { in: pool } } });
    message = `${pool.length} user(s) ${op === "activate" ? "activated" : "deactivated and signed out"}${pool.length < tIds.length ? " (not you)" : ""}.`;
  } else if (op === "loginEmail") {
    if (!smtpConfigured()) return { error: "Email isn't set up yet. See Settings → Integrations." };
    let sent = 0;
    for (const u of await db.user.findMany({ where: { id: { in: tIds }, active: true } })) if ((await sendLoginEmail(u, actor.id)).status === "sent") sent++;
    message = `Login email sent to ${sent} of ${targets.length} user(s)${sent < targets.length ? " (inactive users and failed sends were skipped)" : ""}.`;
  } else return { error: "Choose what to do." };

  await audit(actor.id, "update", "user", null, `Bulk ${op} on ${targets.length} user(s): ${targets.map((u) => u.name).slice(0, 20).join(", ")}`);
  revalidatePath("/settings/users");
  return { ok: true, message };
}

/**
 * Settings → Users → Import users: everyone in an employee list (Bitrix "Find employee" export, or any sheet with
 * name and email) who isn't in AMS yet gets a login. Matched by email, then by name. Old employees (inactive logins,
 * e.g. made by the Bitrix lead import) found on the list are activated and get their real email.
 */
export async function importUsers(_: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("settings.users", "create");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the employee list (.xlsx or .csv)." };
  const { readSheetFile } = await import("@/lib/sheet-read");
  let sheet: Awaited<ReturnType<typeof readSheetFile>>;
  try { sheet = await readSheetFile(file); } catch { return { error: "Couldn't read that file. Use .xlsx or .csv." }; }
  const pick = (...names: string[]) => sheet.headers.find((h) => names.includes(h));
  const col = {
    name: pick("name", "full name", "employee", "employee name", "user"), first: pick("first name", "firstname"), last: pick("last name", "lastname", "surname"),
    email: pick("email", "e mail", "work email", "email address"), phone: pick("mobile", "mobile phone", "phone", "work phone", "phone number"),
    title: pick("position", "job title", "title", "designation"), dept: pick("department", "departments"), branch: pick("branch", "office", "location"),
  };
  if (!col.name && !col.first) return { error: `No name column found. Columns in the file: ${sheet.headers.slice(0, 12).join(", ")}.` };

  const roleId = str(fd, "roleId");
  const role = roleId ? await db.role.findUnique({ where: { id: roleId } }) : null;
  const welcome = fd.get("sendWelcome") === "on" && smtpConfigured();
  const [users, branches] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true, email: true, active: true } }),
    db.branch.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);
  const key = (s: string) => s.trim().toLowerCase().replace(/[.\s]+/g, " ").trim();
  // "BHD" finds "Bahadurabad" (letters in order), "DHA" finds "DHA".
  const subseq = (short: string, long: string) => { let i = 0; for (const ch of long) if (ch === short[i]) i++; return i === short.length; };
  const branchFor = (...cells: (string | undefined)[]) => {
    for (const tok of cells.flatMap((c) => (c ?? "").split(/[,/;|>]+|\s{2,}/)).map((t) => t.trim().toLowerCase()).filter(Boolean)) {
      const b = branches.find((x) => x.name.toLowerCase() === tok) ?? branches.find((x) => x.name.toLowerCase().includes(tok) && tok.length >= 3) ?? (tok.length <= 4 ? branches.find((x) => subseq(tok, x.name.toLowerCase())) : undefined);
      if (b) return b.id;
    }
    return null;
  };

  const created: string[] = [], activated: string[] = [], skipped: string[] = [], problems: string[] = [];
  for (const r of sheet.rows) {
    const get = (c?: string) => (c ? String(r[c] ?? "").trim() : "");
    // Bitrix exports "Name" (first name) and "Last name" separately: join them unless Name already holds both.
    const first = get(col.first) || get(col.name), last = get(col.last);
    const name = (last && !first.toLowerCase().endsWith(last.toLowerCase()) ? `${first} ${last}` : first || last).replace(/\s+/g, " ").trim().slice(0, 120);
    if (!name) continue;
    const email = get(col.email).toLowerCase().replace(/^mailto:/, "");
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const existing = (validEmail && users.find((u) => u.email.toLowerCase() === email)) || users.find((u) => key(u.name) === key(name));
    if (existing) {
      if (!existing.active && fd.get("activateOld") === "on") {
        const emailFree = validEmail && !users.some((u) => u.id !== existing.id && u.email.toLowerCase() === email);
        await db.user.update({ where: { id: existing.id }, data: { active: true, ...(emailFree && existing.email.endsWith(".local") && { email }) } });
        existing.active = true;
        activated.push(name);
      } else skipped.push(name);
      continue;
    }
    if (!validEmail) { problems.push(`${name}: no email`); continue; }
    const u = await db.user.create({
      data: {
        name, email, phone: get(col.phone) || null, title: get(col.title) || null, branchId: branchFor(get(col.branch), get(col.dept)), active: true,
        passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
        ...(role && { roles: { create: [{ roleId: role.id }] } }),
      },
    });
    users.push({ id: u.id, name, email, active: true });
    if (welcome) await sendLoginEmail(u, actor.id);
    created.push(name);
  }
  await audit(actor.id, "create", "user", null, `Imported users from ${file.name}: ${created.length} added, ${activated.length} activated, ${skipped.length} already there`);
  revalidatePath("/settings/users");
  const list = (a: string[]) => `${a.slice(0, 12).join(", ")}${a.length > 12 ? "…" : ""}`;
  return {
    ok: true,
    message: [
      `${created.length} added${created.length ? ` (${list(created)})` : ""}`,
      activated.length ? `${activated.length} old employee(s) activated (${list(activated)})` : "",
      `${skipped.length} already in AMS`,
      problems.length ? `not added: ${list(problems)}` : "",
    ].filter(Boolean).join(" · ") + (created.length && !welcome ? ". No emails were sent; use “Send login email” when you're ready." : "."),
  };
}
