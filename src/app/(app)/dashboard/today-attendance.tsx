import Link from "next/link";
import { format, startOfDay } from "date-fns";
import { Clock } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui";

/** Small "today" strip on the dashboard for anyone with an employee record. */
export async function TodayAttendance({ userId }: { userId: string }) {
  const emp = await db.employee.findUnique({ where: { userId }, select: { id: true, status: true } });
  if (!emp || emp.status === "left") return null;
  const punches = await db.attendancePunch.findMany({ where: { employeeId: emp.id, at: { gte: startOfDay(new Date()) } }, orderBy: { at: "asc" } });
  const inNow = punches.length % 2 === 1;
  return (
    <Card className="mb-6 flex flex-wrap items-center gap-4 p-4">
      <span className={cn("flex size-10 items-center justify-center rounded-full", inNow ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-muted")} aria-hidden><Clock className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{punches.length === 0 ? "You haven’t checked in today" : inNow ? `Checked in at ${format(punches.at(-1)!.at, "h:mm a")}` : `Checked out at ${format(punches.at(-1)!.at, "h:mm a")}`}</p>
        <p className="text-xs text-muted">{punches.length ? `First in ${format(punches[0]!.at, "h:mm a")}` : "Tap to check in from the office."}</p>
      </div>
      <Link href="/me/attendance" className={cn("inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium", inNow ? "border border-line bg-surface hover:bg-canvas" : "bg-navy-900 text-white hover:bg-navy-800")}>
        {inNow ? "Check out" : punches.length ? "Open" : "Check in"}
      </Link>
    </Card>
  );
}
