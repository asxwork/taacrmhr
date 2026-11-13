// Activity Log categories (Settings → Activity Log): which audit "entity" belongs where. Attendance also pulls in
// the attendance change log (check-ins, machine imports, punch edits).
export const ACTIVITY_CATEGORIES = [
  { key: "hr", label: "HR & people", entities: ["employee", "onboarding", "employeeLetter", "employeeDocument", "policy", "probationReview", "appraisal", "appraisalCycle", "candidate", "interview", "engagementSurvey", "customField", "asset", "leaveRequest", "leaveBalance", "approvalFlow", "department", "designation"] },
  { key: "attendance", label: "Attendance", entities: ["attendance", "attendancePunch", "attendanceLog", "attendanceMachine", "shift", "roster", "holiday", "checkinDevice", "shiftswap"] },
  { key: "payroll", label: "Payroll", entities: ["payroll", "payrollRun", "payslip", "salary", "loan", "installment", "payItem", "taxSlab", "finalSettlement"] },
  { key: "crm", label: "CRM", entities: ["lead", "leads", "deal", "contact", "company", "unit", "activity", "stage", "salesTarget", "automation", "template"] },
  { key: "finance", label: "Finance", entities: ["finEntry", "finAccount", "finCategory", "finImport"] },
  { key: "calls", label: "Calls", entities: ["callBatch", "callRecording", "callTarget", "sipAccount"] },
  { key: "users", label: "Users & sign-ins", entities: ["user", "role"] },
  { key: "system", label: "System & settings", entities: ["setting", "settings", "backup", "apiConnection"] },
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number]["key"];

const KNOWN = new Set<string>(ACTIVITY_CATEGORIES.flatMap((c) => [...c.entities]));
export const categoryOf = (entity: string): ActivityCategory => (ACTIVITY_CATEGORIES.find((c) => (c.entities as readonly string[]).includes(entity))?.key ?? "system");
/** Entities for a category's database filter; "system" also catches anything not listed. */
export function entityFilter(cat: ActivityCategory) {
  const c = ACTIVITY_CATEGORIES.find((x) => x.key === cat)!;
  return cat === "system" ? { OR: [{ entity: { in: [...c.entities] } }, { entity: { notIn: [...KNOWN] } }] } : { entity: { in: [...c.entities] } };
}
