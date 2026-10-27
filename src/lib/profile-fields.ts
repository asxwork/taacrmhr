// Employee profile sections (ResourceInn-style rows: label left, field right). Client-safe: the profile view renders
// these and hr/employees/profile-actions.ts validates and saves them, so a field is defined once.
import { BLOOD_GROUPS, EMPLOYMENT_TYPES } from "./hr-shared";

export type OptionSource = "departments" | "branches" | "designations" | "employees" | "shifts";
export type ProfileField = {
  key: string;
  label: string;
  kind: "text" | "email" | "tel" | "date" | "number" | "select" | "bool" | "textarea";
  required?: boolean;
  options?: readonly (readonly [string, string])[];
  source?: OptionSource;
  placeholder?: string;
  /** Shown but never saved from this form (employee code). */
  readOnly?: boolean;
};
export type ProfileSectionKey = "personal" | "quick" | "cnic" | "passport" | "license" | "employment" | "salary" | "contact";
export type ProfileSectionDef = { key: ProfileSectionKey; title: string; fields: ProfileField[] };

const pairs = (xs: readonly string[]) => xs.map((x) => [x, x] as const);

export const SALUTATIONS = pairs(["Mr", "Ms", "Mrs", "Miss", "Dr", "Engr"]);
export const MARITAL = pairs(["Single", "Married", "Divorced", "Widowed"]);
export const RELIGIONS = pairs(["Islam", "Christianity", "Hinduism", "Sikhism", "Other"]);
export const NATIONALITIES = pairs(["Pakistani", "Emirati", "Saudi", "British", "American", "Canadian", "Other"]);
export const GENDERS = [["male", "Male"], ["female", "Female"], ["other", "Other"]] as const;
export const GRADES = pairs(["G1", "G2", "G3", "G4", "G5", "Management"]);
export const PAYMENT_METHODS = [["bank", "Bank transfer"], ["cash", "Cash"], ["cheque", "Cheque"]] as const;
export const RELATIONS = pairs(["Father", "Mother", "Spouse", "Son", "Daughter", "Brother", "Sister", "Other"]);

export const PROFILE_SECTIONS: ProfileSectionDef[] = [
  {
    key: "personal", title: "Personal Information",
    fields: [
      { key: "salutation", label: "Salutation", kind: "select", options: SALUTATIONS },
      { key: "firstName", label: "First Name", kind: "text", required: true },
      { key: "middleName", label: "Middle Name", kind: "text", placeholder: "Middle Name" },
      { key: "lastName", label: "Last Name", kind: "text" },
      { key: "fatherName", label: "Father’s/Husband’s Name", kind: "text" },
      { key: "motherName", label: "Mother's Name", kind: "text" },
      { key: "gender", label: "Gender", kind: "select", options: GENDERS },
      { key: "dob", label: "D.O.B", kind: "date" },
      { key: "maritalStatus", label: "Marital Status", kind: "select", options: MARITAL },
      { key: "religion", label: "Religion", kind: "select", options: RELIGIONS },
      { key: "nationality", label: "Nationality", kind: "select", options: NATIONALITIES },
      { key: "bloodGroup", label: "Blood Group", kind: "select", options: pairs(BLOOD_GROUPS) },
    ],
  },
  {
    key: "quick", title: "Quick Contact",
    fields: [
      { key: "phone", label: "Mobile No", kind: "tel", placeholder: "923001234567" },
      { key: "landline", label: "Landline No.", kind: "tel" },
      { key: "personalEmail", label: "Email", kind: "email", placeholder: "abc@xyz.com" },
    ],
  },
  {
    key: "cnic", title: "CNIC",
    fields: [
      { key: "cnic", label: "CNIC No", kind: "text", placeholder: "42101-1234567-1" },
      { key: "cnicIssued", label: "CNIC Issuance Date", kind: "date" },
      { key: "cnicExpiry", label: "CNIC Expiry Date", kind: "date" },
    ],
  },
  {
    key: "passport", title: "Passport",
    fields: [
      { key: "passportNo", label: "Passport Number", kind: "text" },
      { key: "passportExpiry", label: "Passport Expiry Date", kind: "date" },
    ],
  },
  {
    key: "license", title: "Driving License",
    fields: [
      { key: "licenseNo", label: "Driving License No.", kind: "text" },
      { key: "licenseExpiry", label: "Driving License Expiry Date", kind: "date" },
    ],
  },
  {
    key: "employment", title: "Employment",
    fields: [
      { key: "code", label: "Employee Code", kind: "text", readOnly: true },
      { key: "joiningDate", label: "Joining Date", kind: "date", required: true },
      { key: "probationEnd", label: "Probation ends", kind: "date" },
      { key: "employmentType", label: "Employment Type", kind: "select", required: true, options: EMPLOYMENT_TYPES.map((t) => [t.value, t.label] as const) },
      { key: "grade", label: "Employee Grade", kind: "select", options: GRADES },
      { key: "isHod", label: "Is HOD?", kind: "bool" },
      { key: "attendanceExempt", label: "Is Attendance Exempt?", kind: "bool" },
      { key: "branchId", label: "Branch", kind: "select", source: "branches", required: true },
      { key: "departmentId", label: "Department", kind: "select", source: "departments", required: true },
      { key: "designationId", label: "Designation", kind: "select", source: "designations", required: true },
      { key: "jobTitle", label: "Job Title", kind: "text" },
      { key: "managerId", label: "Line Manager", kind: "select", source: "employees" },
      { key: "finalAuthorityId", label: "Final Authority", kind: "select", source: "employees" },
      { key: "officialEmail", label: "Official Email", kind: "email" },
      { key: "shiftId", label: "Shift (time slot)", kind: "select", source: "shifts" },
      { key: "deviceUserId", label: "Attendance machine ID", kind: "text" },
    ],
  },
  {
    key: "salary", title: "Salary",
    fields: [
      { key: "gross", label: "Gross Salary (PKR)", kind: "number", required: true },
      { key: "probationGross", label: "Probation Salary (PKR)", kind: "number" },
      { key: "effectiveFrom", label: "Effective from", kind: "date", required: true },
      { key: "paymentMethod", label: "Payment Method", kind: "select", options: PAYMENT_METHODS },
      { key: "ntn", label: "NTN #", kind: "text", placeholder: "NTN #" },
      { key: "incrementMonths", label: "Increment frequency", kind: "select", options: [["6", "6 Months"], ["12", "12 Months"], ["24", "24 Months"]] },
      { key: "nextIncrementAt", label: "Next Expected Increment Date", kind: "date" },
      { key: "taxExempt", label: "Tax Exempted?", kind: "bool" },
      { key: "eobi", label: "EOBI deduction", kind: "bool" },
      { key: "pfPct", label: "Provident fund %", kind: "number" },
    ],
  },
  {
    key: "contact", title: "Contact Info",
    fields: [
      { key: "phone", label: "Mobile No", kind: "tel" },
      { key: "landline", label: "Landline No.", kind: "tel" },
      { key: "personalEmail", label: "Personal Email", kind: "email" },
      { key: "officialEmail", label: "Official Email", kind: "email" },
      { key: "address", label: "Current Address", kind: "textarea" },
      { key: "permanentAddress", label: "Permanent Address", kind: "textarea" },
      { key: "city", label: "City", kind: "text" },
      { key: "emergencyName", label: "Emergency Contact Name", kind: "text" },
      { key: "emergencyRelation", label: "Emergency Contact Relation", kind: "select", options: RELATIONS },
      { key: "emergencyPhone", label: "Emergency Contact No", kind: "tel" },
    ],
  },
];

export const profileSection = (key: string) => PROFILE_SECTIONS.find((s) => s.key === key);

/** Fields that count towards "x% Completed" on the profile header. */
export const COMPLETION_KEYS = [
  "photo", "firstName", "lastName", "fatherName", "gender", "dob", "maritalStatus", "religion", "nationality", "bloodGroup",
  "phone", "personalEmail", "cnic", "cnicExpiry", "address", "city", "emergencyName", "emergencyPhone",
  "departmentId", "designationId", "branchId", "managerId", "bankName", "accountNumber", "cnicDoc", "relative", "qualification",
] as const;
