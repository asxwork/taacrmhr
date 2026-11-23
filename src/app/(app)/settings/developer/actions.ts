"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { DEV_EVENTS, DEV_SCOPES, hashToken, newToken } from "@/lib/dev-api";
import { sealSecret } from "@/lib/softphone";
import { randomBytes } from "node:crypto";

export type DevState = { ok?: boolean; error?: string; message?: string; token?: string; secret?: string; id?: string } | undefined;

async function who() {
  const user = await requireUser();
  if (user.viewAs || !(user.isSuperAdmin || can(user, "settings.company", "edit"))) throw new Error("Only admins can manage developer resources.");
  return user;
}
/** Super Admins manage every integration; other admins only their own. */
async function mine(user: SessionUser, id: string) {
  const h = await db.devHook.findUnique({ where: { id } });
  if (!h || (!user.isSuperAdmin && h.userId !== user.id)) throw new Error("Not found.");
  return h;
}
const pick = (fd: FormData, name: string, allowed: readonly { key: string }[]) => fd.getAll(name).map(String).filter((v) => allowed.some((a) => a.key === v));
function cleanUrl(raw: string) {
  try { const u = new URL(raw.trim()); if (u.protocol !== "https:" && !/^(localhost|127\.)/.test(u.hostname)) return null; return u.toString(); } catch { return null; }
}

export async function saveHook(_: DevState, fd: FormData): Promise<DevState> {
  try {
    const user = await who();
    const id = String(fd.get("id") ?? "");
    const kind = String(fd.get("kind")) === "outbound" ? "outbound" : "inbound";
    const name = String(fd.get("name") ?? "").trim().slice(0, 120) || (kind === "outbound" ? "Outbound webhook" : "Inbound webhook");
    const active = id ? fd.get("active") === "on" : true;
    if (kind === "inbound") {
      const scopes = pick(fd, "scopes", DEV_SCOPES);
      if (!scopes.length) return { error: "Tick at least one scope." };
      if (id) {
        await mine(user, id);
        await db.devHook.update({ where: { id }, data: { name, scopes: scopes.join(","), active } });
        await audit(user.id, "update", "setting", id, `Inbound webhook "${name}" changed: ${scopes.join(", ")}${active ? "" : " (off)"}`);
        revalidatePath("/settings/developer");
        return { ok: true, message: "Saved." };
      }
      const token = newToken();
      const h = await db.devHook.create({ data: { kind, name, userId: user.id, tokenHash: hashToken(token), tokenHint: token.slice(-4), scopes: scopes.join(",") } });
      await audit(user.id, "create", "setting", h.id, `Inbound webhook "${name}" made (${scopes.join(", ")})`);
      revalidatePath("/settings/developer");
      return { ok: true, token, id: h.id };
    }
    const url = cleanUrl(String(fd.get("url") ?? ""));
    if (!url) return { error: "Enter the https:// address that should receive the events." };
    const events = pick(fd, "events", DEV_EVENTS);
    if (!events.length) return { error: "Tick at least one event." };
    if (id) {
      await mine(user, id);
      await db.devHook.update({ where: { id }, data: { name, url, events: events.join(","), active } });
      revalidatePath("/settings/developer");
      return { ok: true, message: "Saved." };
    }
    const secret = randomBytes(24).toString("hex");
    const sealed = sealSecret(secret);
    if (!sealed) return { error: "The server has no secret key to store the signing secret (set SIP_SECRET_KEY or CRON_SECRET)." };
    const h = await db.devHook.create({ data: { kind, name, userId: user.id, url, events: events.join(","), secretSealed: sealed, scopes: "" } });
    await audit(user.id, "create", "setting", h.id, `Outbound webhook "${name}" → ${new URL(url).hostname}`);
    revalidatePath("/settings/developer");
    return { ok: true, secret, id: h.id };
  } catch (e) { return { error: e instanceof Error ? e.message : "Couldn't save." }; }
}

/** New key (inbound) or new signing secret (outbound); the old one stops working at once. */
export async function renewHook(_: DevState, fd: FormData): Promise<DevState> {
  try {
    const user = await who();
    const h = await mine(user, String(fd.get("id")));
    if (h.kind === "inbound") {
      const token = newToken();
      await db.devHook.update({ where: { id: h.id }, data: { tokenHash: hashToken(token), tokenHint: token.slice(-4) } });
      await audit(user.id, "update", "setting", h.id, `Inbound webhook "${h.name}": new key`);
      return { ok: true, token, id: h.id };
    }
    const secret = randomBytes(24).toString("hex");
    await db.devHook.update({ where: { id: h.id }, data: { secretSealed: sealSecret(secret) } });
    return { ok: true, secret, id: h.id };
  } catch (e) { return { error: e instanceof Error ? e.message : "Couldn't renew." }; }
}

export async function testHook(_: DevState, fd: FormData): Promise<DevState> {
  try {
    const user = await who();
    const h = await mine(user, String(fd.get("id")));
    const { sendToHook } = await import("@/lib/dev-events");
    const { openSecret } = await import("@/lib/softphone");
    const status = await sendToHook({ id: h.id, url: h.url ?? "", secret: openSecret(h.secretSealed) }, "test", { message: "Test from AMS", by: user.name });
    revalidatePath("/settings/developer");
    return /^2\d\d$/.test(status) ? { ok: true, message: `Delivered (HTTP ${status}).` } : { error: `Not delivered: ${status}` };
  } catch (e) { return { error: e instanceof Error ? e.message : "Couldn't send." }; }
}

export async function deleteHook(fd: FormData) {
  const user = await who();
  const h = await mine(user, String(fd.get("id")));
  await db.devHook.delete({ where: { id: h.id } });
  await audit(user.id, "delete", "setting", h.id, `${h.kind === "inbound" ? "Inbound" : "Outbound"} webhook "${h.name}" deleted`);
  revalidatePath("/settings/developer");
  redirect("/settings/developer");
}
