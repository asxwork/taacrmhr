// HR request types beyond leave/expense/loan/punch (Requests menu). Client-safe: forms, the request
// details view and the menus read these; lib/requests.ts validates, submits and applies them on approval.
import type { Step } from "./approvals";

export type ReqField = {
  name: string;
  label: string;
  kind: "date" | "time" | "text" | "textarea" | "number" | "select";
  required?: boolean;
  /** select: fixed options, or a list loaded from the database. */
  options?: readonly (readonly [string, string])[];
  source?: "branches" | "departments" | "designations" | "shifts";
  hint?: string;
};

export type ReqType = {
  slug: string;
  /** ApprovalRequest.type / ApprovalFlow.type */
  type: string;
  label: string;
  description: string;
  /** HR or a manager can raise it for someone else (promotion, transfer). */
  forOthers?: boolean;
  /** Default approval chain (editable in HR Settings → Approval chains). */
  steps: Step[];
  fields: ReqField[];
};

const reason: ReqField = { name: "reason", label: "Reason", kind: "textarea", required: true };
const MANAGER_HR: Step[] = [{ kind: "manager" }, { kind: "hr" }];

export const REQUEST_TYPES: ReqType[] = [
  {
    slug: "tickets", type: "ticket", label: "General ticket", description: "Ask HR or admin for anything: IT, stationery, facilities, documents.", steps: [{ kind: "hr" }],
    fields: [
      { name: "category", label: "Category", kind: "select", required: true, options: [["it", "IT"], ["admin", "Admin"], ["hr", "HR"], ["finance", "Finance"], ["facilities", "Facilities"], ["other", "Other"]] },
      { name: "subject", label: "Subject", kind: "text", required: true },
      { name: "details", label: "Details", kind: "textarea", required: true },
    ],
  },
  {
    slug: "wfh", type: "wfh", label: "Work from home", description: "Approved days count as present in attendance.", steps: MANAGER_HR,
    fields: [{ name: "from", label: "From", kind: "date", required: true }, { name: "to", label: "To", kind: "date", required: true }, reason],
  },
  {
    slug: "official-duty", type: "official_duty", label: "Official duty", description: "Out of office on company work; the day counts as present.", steps: [{ kind: "manager" }],
    fields: [
      { name: "date", label: "Date", kind: "date", required: true },
      { name: "start", label: "From", kind: "time" }, { name: "end", label: "To", kind: "time" },
      { name: "place", label: "Where", kind: "text", required: true }, { name: "reason", label: "Purpose", kind: "textarea", required: true },
    ],
  },
  {
    slug: "overtime", type: "overtime", label: "Overtime", description: "Extra hours worked, recorded on your history for payroll.", steps: MANAGER_HR,
    fields: [{ name: "date", label: "Date", kind: "date", required: true }, { name: "hours", label: "Hours", kind: "number", required: true }, reason],
  },
  {
    slug: "promotions", type: "promotion", label: "Promotion", description: "New designation (and salary); applied on approval.", forOthers: true, steps: [{ kind: "hr" }],
    fields: [
      { name: "designationId", label: "New designation", kind: "select", source: "designations", required: true },
      { name: "salary", label: "New monthly gross (PKR)", kind: "number", hint: "Leave empty to keep the salary." },
      { name: "effective", label: "Effective from", kind: "date", required: true }, reason,
    ],
  },
  {
    slug: "relaxation", type: "relaxation", label: "Relaxation", description: "Waive a late arrival or early exit for one day.", steps: [{ kind: "manager" }],
    fields: [
      { name: "date", label: "Date", kind: "date", required: true },
      { name: "kind", label: "For", kind: "select", required: true, options: [["late", "Late arrival"], ["early", "Early exit"], ["both", "Both"]] },
      { name: "minutes", label: "Minutes", kind: "number" }, reason,
    ],
  },
  {
    slug: "transfer", type: "transfer", label: "Transfer", description: "Move to another branch or department; applied on approval.", forOthers: true, steps: [{ kind: "hr" }],
    fields: [
      { name: "branchId", label: "New branch", kind: "select", source: "branches" },
      { name: "departmentId", label: "New department", kind: "select", source: "departments" },
      { name: "effective", label: "Effective from", kind: "date", required: true }, reason,
    ],
  },
  {
    slug: "travel", type: "travel", label: "Travel", description: "Business travel; the days count as present.", steps: MANAGER_HR,
    fields: [
      { name: "destination", label: "Destination", kind: "text", required: true },
      { name: "from", label: "From", kind: "date", required: true }, { name: "to", label: "To", kind: "date", required: true },
      { name: "cost", label: "Estimated cost (PKR)", kind: "number" }, { name: "reason", label: "Purpose", kind: "textarea", required: true },
    ],
  },
  {
    slug: "requisition", type: "requisition", label: "Requisition", description: "Ask to hire; approval opens the job in Recruitment.", steps: [{ kind: "hr" }],
    fields: [
      { name: "title", label: "Position", kind: "text", required: true },
      { name: "departmentId", label: "Department", kind: "select", source: "departments" },
      { name: "branchId", label: "Branch", kind: "select", source: "branches" },
      { name: "positions", label: "How many", kind: "number", required: true },
      { name: "salaryRange", label: "Salary range", kind: "text" }, reason,
    ],
  },
  {
    slug: "resignation", type: "resignation", label: "Resignation", description: "Approval starts your exit: notice period and exit checklist.", steps: MANAGER_HR,
    fields: [{ name: "lastDay", label: "Proposed last working day", kind: "date", required: true }, reason],
  },
  {
    slug: "shift-adjustment", type: "shift_adjustment", label: "Shift adjustment", description: "Different timing for a day.", steps: [{ kind: "manager" }],
    fields: [
      { name: "date", label: "Date", kind: "date", required: true },
      { name: "shiftId", label: "Shift", kind: "select", source: "shifts" },
      { name: "start", label: "Or start", kind: "time" }, { name: "end", label: "End", kind: "time" }, reason,
    ],
  },
  {
    slug: "cpl", type: "cpl", label: "CPL (compensatory leave)", description: "Worked on an off day or holiday: approval adds a day to your leave balance.", steps: MANAGER_HR,
    fields: [{ name: "date", label: "Day worked", kind: "date", required: true }, reason],
  },
];

export const requestTypeBySlug = (slug: string) => REQUEST_TYPES.find((t) => t.slug === slug);
export const requestTypeByType = (type: string) => REQUEST_TYPES.find((t) => t.type === type);
