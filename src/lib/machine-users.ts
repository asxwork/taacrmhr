// Attendance machines ↔ AMS employees (ResourceInn "Employee mappings to machine users"). Each machine has its own
// user list (machine user ID + name); a user is mapped to one employee. Every punch read from a machine is kept in
// MachineLog, so mapping someone later brings in their earlier punches too.
import { db } from "./db";

export type MachineUserRow = { deviceUserId: string; name?: string | null; cardNo?: string | null; role?: number | null };

/** deviceUserId → employeeId for one machine: its own mapping first, then the employee's global device user ID. */
export async function machineEmployeeMap(machineId: string | null | undefined, ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const global = await db.employee.findMany({ where: { deviceUserId: { in: ids } }, select: { id: true, deviceUserId: true } });
  for (const e of global) map.set(e.deviceUserId!, e.id);
  if (machineId) {
    const own = await db.machineUser.findMany({ where: { machineId, deviceUserId: { in: ids }, employeeId: { not: null } }, select: { deviceUserId: true, employeeId: true } });
    for (const u of own) map.set(u.deviceUserId, u.employeeId!);
  }
  return map;
}

/** Keeps every punch read from a machine (duplicates skipped). */
export async function storeMachineLogs(machineId: string, rows: { deviceUserId: string; at: Date }[]) {
  if (!rows.length) return 0;
  const min = new Date(Math.min(...rows.map((r) => +r.at))), max = new Date(Math.max(...rows.map((r) => +r.at)));
  const have = new Set((await db.machineLog.findMany({ where: { machineId, at: { gte: min, lte: max } }, select: { deviceUserId: true, at: true } })).map((r) => `${r.deviceUserId}|${+r.at}`));
  const fresh: { machineId: string; deviceUserId: string; at: Date }[] = [];
  for (const r of rows) {
    const k = `${r.deviceUserId}|${+r.at}`;
    if (have.has(k)) continue;
    have.add(k);
    fresh.push({ machineId, deviceUserId: r.deviceUserId, at: r.at });
  }
  for (let i = 0; i < fresh.length; i += 500) await db.machineLog.createMany({ data: fresh.slice(i, i + 500) });
  // Users seen in logs but not yet in the user list still show up for mapping.
  const known = new Set((await db.machineUser.findMany({ where: { machineId }, select: { deviceUserId: true } })).map((u) => u.deviceUserId));
  const missing = [...new Set(fresh.map((f) => f.deviceUserId))].filter((id) => !known.has(id));
  if (missing.length) await db.machineUser.createMany({ data: missing.map((deviceUserId) => ({ machineId, deviceUserId })) });
  return fresh.length;
}

/** Saves the user list read from the machine (names change on the machine, mappings stay). */
export async function saveMachineUsers(machineId: string, users: MachineUserRow[]) {
  const now = new Date();
  const existing = new Map((await db.machineUser.findMany({ where: { machineId } })).map((u) => [u.deviceUserId, u]));
  for (const u of users) {
    const id = String(u.deviceUserId).trim();
    if (!id) continue;
    const data = { name: u.name?.trim() || null, cardNo: u.cardNo && u.cardNo !== "0" ? String(u.cardNo) : null, role: u.role ?? null, syncedAt: now };
    const e = existing.get(id);
    if (e) await db.machineUser.update({ where: { id: e.id }, data });
    else await db.machineUser.create({ data: { machineId, deviceUserId: id, ...data } });
  }
  return users.length;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);

/**
 * Auto-map: for each unmapped machine user, the one employee that clearly matches — same device user ID, the employee
 * code's number (TAA-0013 ↔ 13), or the machine name matching the employee's name. Ambiguous names are left alone.
 */
export async function autoMapMachineUsers(machineId: string) {
  const [users, employees, taken] = await Promise.all([
    db.machineUser.findMany({ where: { machineId, employeeId: null } }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true, deviceUserId: true } }),
    db.machineUser.findMany({ where: { machineId, employeeId: { not: null } }, select: { employeeId: true } }),
  ]);
  const used = new Set(taken.map((t) => t.employeeId!));
  let mapped = 0;
  for (const u of users) {
    const free = employees.filter((e) => !used.has(e.id));
    const byId = free.filter((e) => e.deviceUserId === u.deviceUserId);
    const byCode = free.filter((e) => String(Number(e.code.replace(/\D/g, "")) || "") === u.deviceUserId.replace(/^0+/, ""));
    const nw = words(u.name ?? "");
    const byName = nw.length ? free.filter((e) => { const ew = words(e.fullName); return nw.every((w) => ew.includes(w)) || (nw.length === 1 && ew[0] === nw[0]); }) : [];
    const pick = byId.length === 1 ? byId[0] : byName.length === 1 ? byName[0] : !nw.length && byCode.length === 1 ? byCode[0] : null;
    if (!pick) continue;
    await db.machineUser.update({ where: { id: u.id }, data: { employeeId: pick.id } });
    used.add(pick.id);
    mapped++;
  }
  return mapped;
}

/** Turns stored machine logs of (some) users into attendance punches, e.g. right after they were mapped. */
export async function applyMachineLogs(machineId: string, deviceUserIds?: string[]) {
  const logs = await db.machineLog.findMany({ where: { machineId, ...(deviceUserIds ? { deviceUserId: { in: deviceUserIds } } : {}) }, select: { deviceUserId: true, at: true } });
  if (!logs.length) return 0;
  const { importDevicePunches } = await import("./attendance");
  const res = await importDevicePunches(logs, null, { log: false, machineId });
  return res.added;
}
