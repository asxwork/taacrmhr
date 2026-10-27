// Letter Management: {{placeholders}} filled from the employee record at issue time. The issued text is stored, so a
// letter reads the same later even if the template or the employee's details change.
import { format } from "date-fns";
import { db } from "./db";

export const LETTER_CATEGORIES = [
  { value: "appointment", label: "Appointment" }, { value: "experience", label: "Experience" }, { value: "salary", label: "Salary certificate" },
  { value: "warning", label: "Warning" }, { value: "noc", label: "NOC" }, { value: "relieving", label: "Relieving" }, { value: "other", label: "Other" },
] as const;

export const PLACEHOLDERS = [
  ["today", "Today's date"], ["salutation", "Mr / Ms"], ["name", "Full name"], ["first_name", "First name"], ["father_name", "Father's / husband's name"],
  ["code", "Employee code"], ["cnic", "CNIC"], ["designation", "Designation"], ["department", "Department"], ["branch", "Branch"],
  ["manager", "Line manager"], ["joining_date", "Joining date"], ["confirmation_date", "Confirmation date"], ["last_working_day", "Last working day"],
  ["gross_salary", "Monthly gross (PKR)"], ["employment_type", "Employment type"], ["company", "Company name"], ["issuer", "Who issues the letter"],
] as const;

const d = (v: Date | null | undefined) => (v ? format(v, "d MMMM yyyy") : "—");

export async function letterValues(employeeId: string, issuerName: string) {
  const e = await db.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { designation: true, department: true, branch: true, manager: true, salary: true } });
  const company = (await db.setting.findUnique({ where: { key: "company.name" } }))?.value || "The Advisor Associates";
  const values: Record<string, string> = {
    today: d(new Date()), salutation: e.salutation ?? (e.gender === "female" ? "Ms" : "Mr"), name: e.fullName, first_name: e.firstName ?? e.fullName.split(" ")[0]!,
    father_name: e.fatherName ?? "—", code: e.code, cnic: e.cnic ?? "—", designation: e.jobTitle ?? e.designation?.name ?? "—", department: e.department?.name ?? "—",
    branch: e.branch?.name ?? "—", manager: e.manager?.fullName ?? "—", joining_date: d(e.joiningDate), confirmation_date: d(e.confirmedAt),
    last_working_day: d(e.lastWorkingDay ?? e.leftAt), gross_salary: e.salary ? `PKR ${Math.round(e.salary.gross).toLocaleString("en-PK")}` : "—",
    employment_type: e.employmentType[0]!.toUpperCase() + e.employmentType.slice(1), company, issuer: issuerName,
  };
  return values;
}

export const fillTemplate = (body: string, values: Record<string, string>) => body.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => values[k] ?? m);

export const DEFAULT_TEMPLATES: { name: string; category: string; body: string }[] = [
  {
    name: "Experience letter", category: "experience",
    body: `{{today}}

TO WHOM IT MAY CONCERN

This is to certify that {{salutation}}. {{name}} S/O / D/O {{father_name}}, holding CNIC {{cnic}}, worked with {{company}} as {{designation}} in the {{department}} department from {{joining_date}} to {{last_working_day}}.

During this period we found {{first_name}} hardworking, honest and dedicated. We wish {{first_name}} every success in the future.

{{issuer}}
Human Resources, {{company}}`,
  },
  {
    name: "Salary certificate", category: "salary",
    body: `{{today}}

TO WHOM IT MAY CONCERN

This is to certify that {{salutation}}. {{name}} (employee code {{code}}, CNIC {{cnic}}) has been working with {{company}} since {{joining_date}} as {{designation}}, {{branch}} branch.

{{first_name}}'s current monthly gross salary is {{gross_salary}}.

This certificate is issued on the employee's request without any liability on the company.

{{issuer}}
Human Resources, {{company}}`,
  },
  {
    name: "Appointment letter", category: "appointment",
    body: `{{today}}

Dear {{salutation}}. {{name}},

We are pleased to appoint you as {{designation}} in the {{department}} department at our {{branch}} branch, on a {{employment_type}} basis, with effect from {{joining_date}}.

Your monthly gross salary will be {{gross_salary}}. You will report to {{manager}}. Your appointment is subject to the company's policies, which you will acknowledge in the HR system.

We look forward to working with you.

{{issuer}}
Human Resources, {{company}}`,
  },
  {
    name: "Warning letter", category: "warning",
    body: `{{today}}

{{salutation}}. {{name}} ({{code}})
{{designation}}, {{department}}

Subject: Warning

It has been observed that [describe the issue]. This behaviour is against company policy.

You are advised to improve immediately. Any repetition may result in further disciplinary action.

{{issuer}}
Human Resources, {{company}}`,
  },
  {
    name: "No objection certificate (NOC)", category: "noc",
    body: `{{today}}

TO WHOM IT MAY CONCERN

{{company}} has no objection to {{salutation}}. {{name}}, {{designation}} (employee code {{code}}, CNIC {{cnic}}), [purpose, e.g. applying for a visa / travelling abroad from … to …].

{{issuer}}
Human Resources, {{company}}`,
  },
  {
    name: "Relieving letter", category: "relieving",
    body: `{{today}}

Dear {{salutation}}. {{name}},

This is to confirm that your resignation has been accepted and you are relieved from your duties as {{designation}} at the close of business on {{last_working_day}}.

Your final settlement will be processed as per company policy. We thank you for your contribution and wish you the best.

{{issuer}}
Human Resources, {{company}}`,
  },
];
