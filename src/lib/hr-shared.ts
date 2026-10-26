// Client-safe HR constants.
import { REQUEST_TYPES } from "./request-types";

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

export const DOC_TYPES = ["CNIC (front)", "CNIC (back)", "Passport", "CNIC", "Offer letter", "Contract", "Degree / certificate", "Experience letter", "Resume / CV", "Photo", "Other"] as const;

/** Fields an employee may ask HR to change through a profile-update request. */
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

/** ID pictures an employee keeps on file themselves (Me → Photo & ID). */
export const ID_DOCS = [
  { type: "CNIC (front)", label: "CNIC front" },
  { type: "CNIC (back)", label: "CNIC back" },
  { type: "Passport", label: "Passport" },
] as const;

export const SELF_EDITABLE = [
  { key: "bloodGroup", label: "Blood group" },
  { key: "cnic", label: "CNIC number" },
  { key: "passportNo", label: "Passport number" },
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
  ...Object.fromEntries(REQUEST_TYPES.map((t) => [t.type, t.label])),
};

export const EXPENSE_CATEGORIES = ["Fuel", "Travel", "Client meeting", "Mobile / internet", "Office supplies", "Marketing", "Site visit", "Other"];

export const CANDIDATE_STAGES = [
  { value: "applied", label: "Applied", color: "blue" },
  { value: "screening", label: "Screening", color: "violet" },
  { value: "interview", label: "Interview", color: "amber" },
  { value: "offer", label: "Offer", color: "teal" },
  { value: "hired", label: "Hired", color: "green" },
  { value: "rejected", label: "Rejected", color: "red" },
] as const;

export const ASSET_CATEGORIES = ["Laptop", "Desktop", "Mobile phone", "SIM", "Tablet", "Vehicle", "Keys / access card", "Furniture", "Other"];

export const RATINGS = [
  { value: 1, label: "Needs improvement" },
  { value: 2, label: "Below expectations" },
  { value: 3, label: "Meets expectations" },
  { value: 4, label: "Exceeds expectations" },
  { value: 5, label: "Outstanding" },
] as const;

export const APPRAISAL_STATUS = { self: "Self review", manager: "Manager review", done: "Completed" } as const;
