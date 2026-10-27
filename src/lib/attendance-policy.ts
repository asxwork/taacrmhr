// Attendance policy (People → Compliance → Policy Planner): how missing check-outs, very short days and overtime
// count. Read by loadAttendance, so the dashboard, reports and payroll all apply the same rules.
import { db } from "./db";
import { memo } from "./memo";

export type AttendancePolicy = {
  /** A day with a check-in but no check-out counts as: */
  missingAs: "present" | "half" | "absent";
  /** Worked less than this on a work day = absent (0 = off; the shift's half-day rule still applies). */
  absentUnderMin: number;
  /** Minutes past the shift end before overtime starts counting. */
  overtimeAfterMin: number;
};

export const POLICY_KEYS = { missingAs: "attendance.missingAs", absentUnderMin: "attendance.absentUnderMin", overtimeAfterMin: "attendance.overtimeAfterMin" } as const;

export function attendancePolicy(): Promise<AttendancePolicy> {
  return memo("setting:attendancePolicy", 60_000, async () => {
    const rows = await db.setting.findMany({ where: { key: { in: Object.values(POLICY_KEYS) } } });
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    const missing = get(POLICY_KEYS.missingAs);
    return {
      missingAs: missing === "half" || missing === "absent" ? missing : "present",
      absentUnderMin: Math.max(0, Number(get(POLICY_KEYS.absentUnderMin)) || 0),
      overtimeAfterMin: Math.max(0, Number(get(POLICY_KEYS.overtimeAfterMin) ?? 30) || 0),
    };
  });
}
