"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { SubmitButton } from "@/components/action-form";
import { Card, Field } from "@/components/ui";
import { checkHrFiles, confirmHrImport, emailEveryone, type HrImportState } from "./actions";

const FILES = [
  ["employee", "Employee detail report", "Required"],
  ["attendance", "Detail attendance report", "Optional"],
  ["salary", "Salary sheet", "Optional"],
  ["leave", "Leave data", "Optional"],
  ["probation", "Probation report", "Optional"],
] as const;

export function HrImporter({ smtp, keeping, waiting }: { smtp: boolean; keeping: string; waiting: number }) {
  const [state, setState] = useActionState(async (prev: HrImportState, fd: FormData): Promise<HrImportState> => {
    const step = String(fd.get("step"));
    if (step === "check") return checkHrFiles(prev, fd);
    if (step === "confirm") return confirmHrImport(prev, fd);
    if (step === "email") return emailEveryone(prev);
    return undefined; // start over
  }, undefined);
  const error = state?.error && <p role="alert" className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  const welcomeBlock = (
    <>
      <p className="mb-2 font-medium">Welcome emails</p>
      {state?.welcome ? (
        <p className="text-sm">{state.welcome.sent} sent.{state.welcome.failed.length ? ` Failed: ${state.welcome.failed.join(", ")}` : ""}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">Staff can&apos;t sign in until they set a password from this email. {smtp ? "Send it when you're ready." : "Set up email first (Settings → Integrations), then come back to this page."}</p>
          {smtp && (
            <form action={setState}>
              <input type="hidden" name="step" value="email" />
              <SubmitButton variant="secondary" pendingText="Sending…">Email everyone who hasn&apos;t signed in</SubmitButton>
            </form>
          )}
        </>
      )}
    </>
  );

  if (state?.done) {
    const d = state.done;
    return (
      <Card className="p-6">
        <p className="flex items-center gap-2 font-medium text-emerald-700"><CheckCircle2 className="size-5" /> Import finished</p>
        <ul className="mt-3 space-y-1 text-sm">
          <li>{d.employees} employees, {d.logins} logins</li>
          <li>{d.leadsDeleted} leads deleted, {d.leadsKept} kept</li>
          <li>{d.attendanceDays} attendance days, {d.punches} punches, {d.leaveDays} leave days</li>
          <li>{d.payslips} payslips across {d.payMonths} months</li>
        </ul>
        <div className="mt-5 border-t border-line pt-4">
          {error}
          {welcomeBlock}
        </div>
      </Card>
    );
  }

  if (state?.preview && state.id) {
    const p = state.preview;
    const rows: [string, string][] = [
      ["Employees", `${p.employees} (${p.salaries} with a salary, ${p.probation} on probation)`],
      ["Logins to create", `${p.logins}. No emails are sent yet`],
      ["Roles", Object.entries(p.roles).map(([k, v]) => `${k} ${v}`).join(" · ")],
      ["Attendance", `${p.attendanceDays} days, ${p.attendanceRange}`],
      ["Past payroll", `${p.payslips} payslips across ${p.payMonths} months`],
      ["Leave balances", String(p.balances)],
    ];
    return (
      <div className="space-y-4">
        <Card className="p-6">
          <h2 className="mb-3 font-medium">What will be added</h2>
          <dl className="divide-y divide-line text-sm">
            {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-6 py-2"><dt className="shrink-0 text-muted">{k}</dt><dd className="text-right">{v}</dd></div>)}
          </dl>
          {p.warnings.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-1 font-medium">Check these ({p.warnings.length})</p>
              <ul className="list-disc space-y-0.5 pl-5">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
        </Card>
        <Card className="border-red-200 p-6">
          <h2 className="mb-2 flex items-center gap-2 font-medium text-red-700"><AlertTriangle className="size-5" /> What will be permanently deleted</h2>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm">
            <li><b className="font-medium">Every user except you</b> ({keeping}).</li>
            <li>All employees and their attendance, leave, payslips, salaries, loans, expenses, documents and reviews.</li>
            <li>All payroll runs, recruitment, appraisal cycles and assets.</li>
            <li><b className="font-medium">All leads and their activities</b> ({state.leads?.total ?? 0}), except the 2 newest{state.leads?.keep.length ? `: ${state.leads.keep.map((l) => l.name).join(", ")}` : ""}.</li>
            <li>All sample CRM data. Real deals stay, but lose their lead link and become unassigned.</li>
          </ul>
          <p className="mb-4 text-sm text-muted">This can&apos;t be undone. Back up the database in phpMyAdmin first (Export → Quick → SQL).</p>
          {error}
          <form action={setState} className="space-y-3">
            <input type="hidden" name="step" value="confirm" />
            <input type="hidden" name="id" value={state.id} />
            <Field label="Type DELETE to confirm"><input name="confirm" required autoComplete="off" className="input" /></Field>
            <div className="flex gap-2">
              <SubmitButton variant="danger" pendingText="Replacing data. Don't close this page…">Delete and import</SubmitButton>
            </div>
          </form>
          <form action={setState} className="mt-2">
            <input type="hidden" name="step" value="restart" />
            <button className="text-sm text-muted hover:text-ink">Start over</button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        {error}
        <form action={setState} className="space-y-4">
          <input type="hidden" name="step" value="check" />
          {FILES.map(([name, label, hint]) => (
            <Field key={name} label={label} hint={hint}>
              <input name={name} type="file" accept=".xlsx" required={name === "employee"} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
            </Field>
          ))}
          <p className="text-sm text-muted">Nothing changes at this step. The files are checked and you see exactly what would happen first.</p>
          <SubmitButton pendingText="Checking the files…">Check files</SubmitButton>
        </form>
      </Card>
      {waiting > 0 && <Card className="p-6"><p className="mb-2 text-sm text-muted">{waiting} staff haven&apos;t signed in yet.</p>{welcomeBlock}</Card>}
    </div>
  );
}
