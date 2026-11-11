// New-device sign-in alerts: the first sign-in from a browser/device a user hasn't used before sends them a
// notification and email ("Was this you?"). Super Admin sign-ins from a new device also alert the other Super Admins.
import { createHash } from "node:crypto";
import { db } from "./db";
import { notify } from "./notify";
import { disabledFeatures } from "./features";

/** "Chrome on Windows", "Safari on iPhone"… from the user agent. */
export function deviceLabel(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "a browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "an unknown device";
  return `${browser} on ${os}`;
}

export async function recordSignIn(user: { id: string; name: string; isSuperAdmin: boolean }, ua: string, ip: string) {
  const label = deviceLabel(ua);
  // Browser + OS (not the exact version, which changes with every update).
  const key = createHash("sha256").update(label + "|" + (ua.match(/\(([^)]*)\)/)?.[1] ?? "")).digest("hex").slice(0, 32);
  const seenBefore = await db.loginDevice.count({ where: { userId: user.id } });
  const existing = await db.loginDevice.findUnique({ where: { userId_key: { userId: user.id, key } } });
  if (existing) {
    await db.loginDevice.update({ where: { id: existing.id }, data: { lastAt: new Date(), lastIp: ip.slice(0, 60) } });
    return;
  }
  await db.loginDevice.create({ data: { userId: user.id, key, label, lastIp: ip.slice(0, 60) } });
  // The very first sign-in ever isn't "new": only alert once they have a known device.
  if (!seenBefore || (await disabledFeatures()).has("loginalerts")) return;
  const when = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  await notify(user.id, `New sign-in from ${label}`, {
    body: `${when} · IP ${ip}. If this wasn't you, change your password now (My profile → Security) and tell your admin.`, link: "/profile/security", email: true,
  });
  if (user.isSuperAdmin) {
    const others = await db.user.findMany({ where: { isSuperAdmin: true, active: true, NOT: { id: user.id } }, select: { id: true } });
    for (const o of others) await notify(o.id, `${user.name} (Super Admin) signed in from a new device`, { body: `${label} · ${when} · IP ${ip}`, link: "/settings/audit", email: true });
  }
}
