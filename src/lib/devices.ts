// Web check-in device lock (Attendance → Device Change Approvals). When on, each employee checks in from one
// approved browser; the first one is approved automatically and a new one needs HR approval (approval type
// "device_change"). The browser is recognised by a long-lived random cookie.
import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { submitRequest } from "./approvals";

export const DEVICE_COOKIE = "taa_device";

export async function deviceLockOn() {
  return (await db.setting.findUnique({ where: { key: "attendance.deviceLock" } }))?.value === "on";
}

/** A short "Chrome on Android" style label from the user agent. */
export function deviceLabel(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "device";
  return `${browser} on ${os}`;
}

/** Returns null when the punch may go ahead, or a message explaining why not (and files the request). */
export async function checkDevice(emp: { id: string; fullName: string }, userId: string): Promise<string | null> {
  if (!(await deviceLockOn())) return null;
  const jar = await cookies();
  let key = jar.get(DEVICE_COOKIE)?.value;
  if (!key) {
    key = randomBytes(18).toString("base64url");
    jar.set(DEVICE_COOKIE, key, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 * 5, path: "/" });
  }
  const label = deviceLabel((await headers()).get("user-agent") ?? "");
  const devices = await db.checkinDevice.findMany({ where: { employeeId: emp.id } });
  const mine = devices.find((d) => d.deviceKey === key);
  if (mine?.status === "approved") {
    await db.checkinDevice.update({ where: { id: mine.id }, data: { lastUsedAt: new Date() } });
    return null;
  }
  if (!devices.some((d) => d.status === "approved")) {
    await db.checkinDevice.create({ data: { employeeId: emp.id, deviceKey: key, label, status: "approved", lastUsedAt: new Date() } });
    return null;
  }
  if (mine?.status === "pending") return "This device is waiting for HR approval. Check in from your registered device for now.";
  const dev = await db.checkinDevice.create({ data: { employeeId: emp.id, deviceKey: key, label } });
  const req = await submitRequest({ type: "device_change", employeeId: emp.id, requesterId: userId, title: `New check-in device · ${emp.fullName}: ${label}`, summary: "Wants to check in from a new device", payload: { deviceId: dev.id } });
  await db.checkinDevice.update({ where: { id: dev.id }, data: { approvalId: req.id } });
  return "You're checking in from a new device, so it was sent to HR for approval. Use your registered device until then.";
}

/** Approval: the new device replaces the old ones. */
export async function approveDevice(deviceId: string) {
  const dev = await db.checkinDevice.findUnique({ where: { id: deviceId } });
  if (!dev) return;
  await db.checkinDevice.updateMany({ where: { employeeId: dev.employeeId, status: "approved" }, data: { status: "replaced" } });
  await db.checkinDevice.update({ where: { id: dev.id }, data: { status: "approved" } });
}

export async function rejectDevice(deviceId: string) {
  await db.checkinDevice.updateMany({ where: { id: deviceId, status: "pending" }, data: { status: "rejected" } });
}
