// Shift swaps: an employee asks a colleague to swap shifts for one day; the colleague accepts; a manager approves.
// On approval each person's plan for that day goes on the roster as the other's.
import { db } from "./db";
import { defaultShift } from "./attendance";

type Plan = { off: boolean; shiftId: string | null; start: string | null; end: string | null };

async function planFor(employeeId: string, date: Date): Promise<Plan> {
  const r = await db.rosterDay.findUnique({ where: { employeeId_date: { employeeId, date } } });
  if (r) return { off: r.off, shiftId: r.shiftId, start: r.start, end: r.end };
  const emp = await db.employee.findUnique({ where: { id: employeeId }, select: { shiftId: true } });
  const shiftId = emp?.shiftId ?? (await defaultShift())?.id ?? null;
  const shift = shiftId ? await db.shift.findUnique({ where: { id: shiftId }, select: { workDays: true } }) : null;
  const iso = ((date.getDay() + 6) % 7) + 1; // Mon=1 … Sun=7
  return { off: !!shift && !shift.workDays.split(",").includes(String(iso)), shiftId, start: null, end: null };
}

export async function applySwap(swapId: string, actorId: string) {
  const s = await db.shiftSwap.findUnique({ where: { id: swapId } });
  if (!s) return;
  const [a, b] = await Promise.all([planFor(s.requesterId, s.date), planFor(s.partnerId, s.date)]);
  const put = (employeeId: string, p: Plan) => db.rosterDay.upsert({
    where: { employeeId_date: { employeeId, date: s.date } },
    update: { ...p, note: "Shift swap", createdById: actorId },
    create: { employeeId, date: s.date, ...p, note: "Shift swap", createdById: actorId },
  });
  await db.$transaction([put(s.requesterId, b), put(s.partnerId, a)]);
}

/** Who can approve: the requester's line manager plus anyone with Shift swaps → Approve covering them. */
export async function swapApproverIds(requesterId: string) {
  const emp = await db.employee.findUnique({ where: { id: requesterId }, select: { manager: { select: { userId: true } } } });
  return [emp?.manager?.userId].filter(Boolean) as string[];
}

export const SWAP_STATUS: Record<string, [string, "amber" | "green" | "red" | "neutral"]> = {
  partner: ["Waiting for colleague", "amber"], manager: ["Waiting for manager", "amber"], approved: ["Approved", "green"], rejected: ["Declined", "red"], cancelled: ["Cancelled", "neutral"],
};
