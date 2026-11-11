"use server";

import { revalidatePath } from "next/cache";
import { format, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { distanceMeters, geofenceMode, logAttendance } from "@/lib/attendance";
import { submitRequest } from "@/lib/approvals";
import { checkDevice } from "@/lib/devices";
import { str, type FormState } from "@/lib/utils";
import { disabledFeatures } from "@/lib/features";

/** Web check-in/out. Location is checked against the employee's branch geo-fence. */
export async function punchNow(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id }, include: { branch: true } });
  if (!emp || emp.status === "left") return { error: "Your login isn't linked to an active employee record." };

  const blocked = await checkDevice(emp, user.id);
  if (blocked) return { error: blocked };

  const now = new Date();
  const last = await db.attendancePunch.findFirst({ where: { employeeId: emp.id, at: { lte: now } }, orderBy: { at: "desc" } });
  if (last && now.getTime() - last.at.getTime() < 60_000) return { error: "You just punched — wait a minute before trying again." };

  const lat = parseFloat(str(fd, "lat"));
  const lng = parseFloat(str(fd, "lng"));
  const accuracy = parseFloat(str(fd, "accuracy"));
  const hasFix = Number.isFinite(lat) && Number.isFinite(lng);
  const mode = await geofenceMode();
  const fence = emp.branch?.lat != null && emp.branch?.lng != null ? { lat: emp.branch.lat, lng: emp.branch.lng, radius: emp.branch.radiusM } : null;
  const distance = hasFix && fence ? distanceMeters({ lat, lng }, fence) : null;
  // Allow for GPS error (capped) so people standing at the door aren't rejected.
  const slack = Number.isFinite(accuracy) ? Math.min(accuracy, 100) : 0;
  const outside = fence ? distance == null || distance > fence.radius + slack : false;

  if (mode === "enforce" && fence && outside) {
    return { error: hasFix ? `You're about ${distance} m from ${emp.branch!.name} office — check-in only works on site.` : "Allow location access to check in." };
  }

  const today = await db.attendancePunch.count({ where: { employeeId: emp.id, at: { gte: startOfDay(now), lte: now } } });
  await db.attendancePunch.create({
    data: { employeeId: emp.id, at: now, source: "web", lat: hasFix ? lat : null, lng: hasFix ? lng : null, accuracy: Number.isFinite(accuracy) ? accuracy : null, distanceM: distance, outside: mode !== "off" && outside, createdById: user.id },
  });
  const verb = today % 2 === 0 ? "Checked in" : "Checked out";
  // Checking out ends a break that's still open.
  if (verb === "Checked out") await db.attendanceBreak.updateMany({ where: { employeeId: emp.id, end: null }, data: { end: now } });
  await logAttendance({
    employeeId: emp.id, date: now, kind: "checkin", source: "web", byId: user.id,
    summary: `${verb} at ${format(now, "h:mm a")} from the web${distance != null ? ` · ~${distance} m from office` : hasFix ? "" : " · no location"}${mode !== "off" && outside ? " · OUTSIDE office" : ""}`,
  });
  revalidatePath("/me/attendance");
  revalidatePath("/dashboard");
  return { ok: true, message: `${verb} at ${format(now, "h:mm a")}${mode === "warn" && fence && outside ? " — noted as outside the office" : ""}.` };
}

export async function requestCorrection(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const emp = await db.employee.findUnique({ where: { userId: user.id } });
  if (!emp) return { error: "Your login isn't linked to an employee record." };
  const date = str(fd, "date");
  const day = startOfDay(new Date(date));
  const checkIn = str(fd, "checkIn");
  const checkOut = str(fd, "checkOut");
  const reason = str(fd, "reason");
  if (Number.isNaN(day.getTime()) || day > new Date()) return { error: "Choose a past date." };
  if (day < startOfDay(emp.joiningDate)) return { error: "That’s before your joining date." };
  if (!checkIn && !checkOut) return { error: "Enter the check-in and/or check-out time." };
  if (checkIn && checkOut && checkOut <= checkIn) return { error: "Check-out must be after check-in." };
  if (!reason) return { error: "Tell your manager why (e.g. forgot to punch, device down)." };

  const dup = await db.approvalRequest.findFirst({ where: { employeeId: emp.id, type: "attendance_correction", status: "pending", payload: { contains: `"date":"${date}"` } } });
  if (dup) return { error: "You already have a pending correction for that day." };

  await submitRequest({
    type: "attendance_correction", employeeId: emp.id, requesterId: user.id,
    title: `Attendance correction — ${emp.fullName}, ${format(day, "d MMM")}`,
    summary: `${checkIn ? `In ${checkIn}` : ""}${checkIn && checkOut ? " · " : ""}${checkOut ? `Out ${checkOut}` : ""} — ${reason}`,
    payload: { date, checkIn: checkIn || undefined, checkOut: checkOut || undefined, reason },
  });
  revalidatePath("/me/attendance");
  return { ok: true, message: "Sent for approval." };
}

/** Break Out / Back: opens a break while checked in, or ends the open one. Break minutes come off worked time. */
export async function toggleBreak(): Promise<FormState> {
  const user = await requireUser();
  if ((await disabledFeatures()).has("breaks")) return { error: "Breaks are switched off." };
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, status: true } });
  if (!emp || emp.status === "left") return { error: "Your login isn't linked to an active employee record." };
  const now = new Date();
  const open = await db.attendanceBreak.findFirst({ where: { employeeId: emp.id, end: null }, orderBy: { start: "desc" } });
  if (open) {
    await db.attendanceBreak.update({ where: { id: open.id }, data: { end: now } });
    const mins = Math.max(1, Math.round((+now - +open.start) / 60000));
    await logAttendance({ employeeId: emp.id, date: now, kind: "checkin", source: "web", byId: user.id, summary: `Back from break at ${format(now, "h:mm a")} (${mins} min)` });
    revalidatePath("/me/attendance"); revalidatePath("/hr");
    return { ok: true, message: `Welcome back — ${mins} min break.` };
  }
  // Only while checked in (an odd number of punches today).
  const punches = await db.attendancePunch.count({ where: { employeeId: emp.id, at: { gte: startOfDay(now), lte: now } } });
  if (punches % 2 === 0) return { error: "Check in first — a break starts from a checked-in day." };
  await db.attendanceBreak.create({ data: { employeeId: emp.id, start: now } });
  await logAttendance({ employeeId: emp.id, date: now, kind: "checkin", source: "web", byId: user.id, summary: `Break out at ${format(now, "h:mm a")}` });
  revalidatePath("/me/attendance"); revalidatePath("/hr");
  return { ok: true, message: `On break since ${format(now, "h:mm a")}.` };
}
