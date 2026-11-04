// Document expiry reminders to the employee themselves: 30, 7 and 1 day(s) before, and on the day (daily cron).
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { db } from "./db";
import { notify } from "./notify";
import { disabledFeatures } from "./features";

const WHEN = new Set([30, 7, 1, 0]);

export async function sendDocumentReminders() {
  if ((await disabledFeatures()).has("docreminders")) return 0;
  const today = startOfDay(new Date());
  const people = await db.employee.findMany({
    where: { status: { not: "left" }, userId: { not: null } },
    select: { userId: true, cnicExpiry: true, passportExpiry: true, licenseExpiry: true, documents: { where: { expiresAt: { gte: today } }, select: { title: true, expiresAt: true } } },
  });
  let sent = 0;
  for (const p of people) {
    const items: [string, Date | null][] = [["CNIC", p.cnicExpiry], ["Passport", p.passportExpiry], ["Driving licence", p.licenseExpiry], ...p.documents.map((d) => [d.title, d.expiresAt] as [string, Date | null])];
    for (const [what, at] of items) {
      if (!at) continue;
      const days = differenceInCalendarDays(at, today);
      if (!WHEN.has(days)) continue;
      await notify(p.userId, days === 0 ? `Your ${what} expires today` : `Your ${what} expires in ${days} day${days === 1 ? "" : "s"}`, {
        body: `Expiry date: ${format(at, "d MMM yyyy")}. Renew it and upload the new copy in My Space → My profile → Documents.`, link: "/profile?tab=documents", email: true,
      });
      sent++;
    }
  }
  return sent;
}
