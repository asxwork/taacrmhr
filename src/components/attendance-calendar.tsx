import Link from "next/link";
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { DAY_STATUSES, type DayStatus } from "@/lib/attendance-shared";
import { color } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";

type Day = { date: Date; status: DayStatus; checkIn: Date | null; checkOut: Date | null; note: string | null };

/** Month grid of attendance; each day shows status and in/out times. `dayHref` makes days clickable. */
export function AttendanceCalendar({ month, days, dayHref }: { month: Date; days: Day[]; dayHref?: (d: Date) => string }) {
  const grid = eachDayOfInterval({ start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const today = new Date();
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-line text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((d) => {
          const rec = days.find((x) => isSameDay(x.date, d));
          const st = rec ? DAY_STATUSES[rec.status] : null;
          const inMonth = isSameMonth(d, month);
          const body = (
            <>
              <span className={cn("inline-flex size-6 items-center justify-center rounded-full text-xs", isSameDay(d, today) && "bg-navy-900 font-semibold text-white")}>{format(d, "d")}</span>
              {st && rec!.status !== "upcoming" && (
                <span className={cn("mt-1 block truncate rounded px-1 py-0.5 text-[11px] font-medium", color(st.color).pill)} title={rec!.note ?? st.label}>{st.label}</span>
              )}
              {rec?.checkIn && (
                <span className="mt-0.5 block truncate text-[11px] text-muted">{format(rec.checkIn, "HH:mm")}{rec.checkOut ? `–${format(rec.checkOut, "HH:mm")}` : ""}</span>
              )}
            </>
          );
          const cls = cn("min-h-20 border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-canvas/60 opacity-50");
          return dayHref && inMonth && d <= today ? (
            <Link key={d.toISOString()} href={dayHref(d)} scroll={false} className={cn(cls, "hover:bg-canvas/70")}>{body}</Link>
          ) : (
            <div key={d.toISOString()} className={cls}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
