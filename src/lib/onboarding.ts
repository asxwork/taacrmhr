// Onboarding form fields (public link → HR review). One list so the form, the review screen and "fix these fields"
// all agree. Every field is required.
import { BLOOD_GROUPS } from "./hr-shared";

export type OnbField = { key: string; label: string; section: string; kind: "text" | "date" | "tel" | "email" | "select" | "file"; options?: readonly (readonly [string, string])[]; ph?: string; pattern?: string };

const pairs = (xs: readonly string[]) => xs.map((x) => [x, x] as const);

export const ONB_FIELDS: OnbField[] = [
  { key: "firstName", label: "First name", section: "About you", kind: "text" },
  { key: "lastName", label: "Last name", section: "About you", kind: "text" },
  { key: "fatherName", label: "Father's / husband's name", section: "About you", kind: "text" },
  { key: "motherName", label: "Mother's name", section: "About you", kind: "text" },
  { key: "dob", label: "Date of birth", section: "About you", kind: "date" },
  { key: "gender", label: "Gender", section: "About you", kind: "select", options: [["male", "Male"], ["female", "Female"]] },
  { key: "maritalStatus", label: "Marital status", section: "About you", kind: "select", options: [["Single", "Single"], ["Married", "Married"], ["Divorced", "Divorced"], ["Widowed", "Widowed"]] },
  { key: "bloodGroup", label: "Blood group", section: "About you", kind: "select", options: pairs(BLOOD_GROUPS) },
  { key: "religion", label: "Religion", section: "About you", kind: "select", options: pairs(["Islam", "Christianity", "Hinduism", "Sikhism", "Other"]) },
  { key: "nationality", label: "Nationality", section: "About you", kind: "text" },
  { key: "phone", label: "Mobile number", section: "Contact", kind: "tel", ph: "0300 1234567", pattern: "\\+?[\\d\\s\\-]{10,15}" },
  { key: "personalEmail", label: "Personal email", section: "Contact", kind: "email" },
  { key: "address", label: "Current address", section: "Contact", kind: "text" },
  { key: "permanentAddress", label: "Permanent address", section: "Contact", kind: "text" },
  { key: "city", label: "City", section: "Contact", kind: "text" },
  { key: "cnic", label: "CNIC number", section: "CNIC & photo", kind: "text", ph: "42101-1234567-1", pattern: "\\d{5}-?\\d{7}-?\\d" },
  { key: "photo", label: "Your photo", section: "CNIC & photo", kind: "file" },
  { key: "cnicFront", label: "CNIC front", section: "CNIC & photo", kind: "file" },
  { key: "cnicBack", label: "CNIC back", section: "CNIC & photo", kind: "file" },
  { key: "emergencyName", label: "Emergency contact name", section: "Emergency contact", kind: "text" },
  { key: "emergencyRelation", label: "Relation", section: "Emergency contact", kind: "text" },
  { key: "emergencyPhone", label: "Emergency phone", section: "Emergency contact", kind: "tel", ph: "0300 1234567", pattern: "\\+?[\\d\\s\\-]{10,15}" },
  { key: "bankName", label: "Bank", section: "Salary account", kind: "text" },
  { key: "accountTitle", label: "Account title", section: "Salary account", kind: "text" },
  { key: "accountNumber", label: "Account / IBAN", section: "Salary account", kind: "text" },
];
export const ONB_SECTIONS = [...new Set(ONB_FIELDS.map((f) => f.section))];

export type OnbStatus = "open" | "submitted" | "approved" | "rejected";
/** Links submitted before HR review existed count as approved. */
export const onbStatus = (i: { status: string; submittedAt: Date | null }): OnbStatus =>
  (i.status === "open" && i.submittedAt ? "approved" : (i.status as OnbStatus));
