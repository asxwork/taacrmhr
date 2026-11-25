"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { APPS } from "@/lib/nav";
import { str, type FormState } from "@/lib/utils";

const APP_KEYS = ["home", ...APPS.map((a) => a.key)];

/** Creates or updates a layout. Menu checkboxes post the items to SHOW; everything else of that app is hidden. */
export async function saveLayout(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin) return { error: "Only Super Admins can change layouts." };
  const appKey = str(fd, "appKey");
  if (!APP_KEYS.includes(appKey)) return { error: "Choose an app." };
  const audience = ["superadmin", "role", "everyone"].includes(str(fd, "audience")) ? str(fd, "audience") : "everyone";
  const roleId = audience === "role" ? str(fd, "roleId") : "";
  if (audience === "role" && !(await db.role.findUnique({ where: { id: roleId } }))) return { error: "Choose the role." };
  const id = str(fd, "id");
  const clash = await db.layoutProfile.findFirst({ where: { appKey, audience, roleId: roleId || null, ...(id && { NOT: { id } }) } });
  if (clash) return { error: `There's already a layout for this app and audience (“${clash.name}”). Edit that one.` };

  let hidden: string | null = null, order: string | null = null, apps: string | null = null;
  if (appKey === "home") {
    apps = fd.getAll("apps").map(String).filter((k) => APP_KEYS.includes(k)).join(",") || null;
  } else {
    const app = APPS.find((a) => a.key === appKey)!;
    const shown = new Set(fd.getAll("show").map(String));
    const all = app.groups.flatMap((g) => g.items.flatMap((i) => i.children ?? [i])).map((i) => i.href);
    hidden = all.filter((h) => !shown.has(h)).join(",") || null;
    order = app.groups.map((g, i) => ({ label: g.label ?? "", n: Number(str(fd, `order:${i}`)) || i + 1 })).sort((a, b) => a.n - b.n).map((g) => g.label).join(",") || null;
  }
  const data = {
    name: str(fd, "name").slice(0, 80) || "Layout", audience, roleId: roleId || null, appKey,
    style: ["modules", "list"].includes(str(fd, "style")) ? str(fd, "style") : null,
    hidden, order, apps, landing: str(fd, "landing") || null,
  };
  if (id) await db.layoutProfile.update({ where: { id }, data });
  else await db.layoutProfile.create({ data: { ...data, sortOrder: await db.layoutProfile.count() } });
  await audit(user.id, id ? "update" : "create", "layout", id || data.name, `Layout ${data.name}`);
  revalidatePath("/", "layout");
  const back = ["/settings/layouts", "/crm/settings/layouts", "/hr/settings/layouts", "/finance/layouts", "/boss/layouts"].includes(str(fd, "back")) ? str(fd, "back") : "/settings/layouts";
  redirect(`${back}?app=${appKey}`);
}

export async function deleteLayout(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  await db.layoutProfile.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/", "layout");
}

/** The menu items kept in the ready-made Minimal CRM layout (permissions still decide what each person sees). */
const MINIMAL_CRM = ["/dashboard", "/crm/my-day", "/crm/leads?owner=me", "/crm/leads", "/crm/follow-ups", "/crm/tasks", "/crm/deals", "/calls?dial=1", "/calls/callbacks", "/inventory"];

/** One click: a "Minimal" CRM layout for a role (or everyone): a simple list menu with only the everyday screens, opening on My day. */
export async function applyMinimalCrmLayout(fd: FormData) {
  const user = await requireUser();
  if (!user.isSuperAdmin) return;
  const target = str(fd, "target");
  const audience = target === "everyone" ? "everyone" : "role";
  const roleId = audience === "role" ? target : null;
  if (audience === "role" && !(await db.role.findUnique({ where: { id: target } }))) return;
  const app = APPS.find((a) => a.key === "crm")!;
  const all = app.groups.flatMap((g) => g.items.flatMap((i) => i.children ?? [i])).map((i) => i.href);
  const data = { name: "Minimal", audience, roleId, appKey: "crm", style: "list", hidden: all.filter((h) => !MINIMAL_CRM.includes(h)).join(","), order: null, apps: null, landing: "/crm/my-day" };
  const cur = await db.layoutProfile.findFirst({ where: { appKey: "crm", audience, roleId } });
  if (cur) await db.layoutProfile.update({ where: { id: cur.id }, data });
  else await db.layoutProfile.create({ data: { ...data, sortOrder: await db.layoutProfile.count() } });
  await audit(user.id, cur ? "update" : "create", "layout", cur?.id ?? "Minimal", `Minimal CRM layout for ${audience === "role" ? "a role" : "everyone"}`);
  revalidatePath("/", "layout");
  redirect("/crm/settings/layouts?app=crm");
}
