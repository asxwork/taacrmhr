// Client-safe HR constants.

export const EMP_STATUSES = [
  { value: "probation", label: "Probation", color: "amber" },
  { value: "active", label: "Active", color: "green" },
  { value: "notice", label: "Notice period", color: "violet" },
  { value: "left", label: "Left", color: "slate" },
] as const;
export const empStatus = (v: string) => EMP_STATUSES.find((s) => s.value === v) ?? EMP_STATUSES[3];

export const EMPLOYMENT_TYPES = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
  { value: "consultant", label: "Consultant" },
] as const;

export const DOC_TYPES = ["CNIC", "Offer letter", "Contract", "Degree / certificate", "Experience letter", "Resume / CV", "Photo", "Other"] as const;

/** Fields an employee may ask HR to change through a profile-update request. */
export const SELF_EDITABLE = [
  { key: "phone", label: "Phone" },
  { key: "personalEmail", label: "Personal email" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "maritalStatus", label: "Marital status" },
  { key: "emergencyName", label: "Emergency contact" },
  { key: "emergencyRelation", label: "Emergency relation" },
  { key: "emergencyPhone", label: "Emergency phone" },
  { key: "bankName", label: "Bank" },
  { key: "accountTitle", label: "Account title" },
  { key: "accountNumber", label: "Account / IBAN" },
] as const;
export type SelfEditableKey = (typeof SELF_EDITABLE)[number]["key"];

export const APPROVAL_TYPES: Record<string, string> = {
  profile_update: "Profile update",
  document: "Document upload",
  leave: "Leave",
  attendance_correction: "Attendance correction",
  loan: "Loan / advance",
  expense: "Expense claim",
};
