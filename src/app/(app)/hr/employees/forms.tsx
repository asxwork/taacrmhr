import { format } from "date-fns";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, LinkButton } from "@/components/ui";
import { DOC_TYPES, EMPLOYMENT_TYPES } from "@/lib/hr-shared";
import { changeAssignment, recordResignation, saveEmployee, uploadDocument } from "./actions";

type Opt = { id: string; name: string };
const d = (v: Date | null | undefined) => (v ? format(v, "yyyy-MM-dd") : "");

type EmployeeValues = {
  id: string; fullName: string; fatherName: string | null; gender: string | null; dob: Date | null; cnic: string | null; cnicExpiry: Date | null;
  maritalStatus: string | null; bloodGroup: string | null; phone: string | null; personalEmail: string | null; address: string | null; city: string | null;
  emergencyName: string | null; emergencyRelation: string | null; emergencyPhone: string | null; bankName: string | null; accountTitle: string | null;
  accountNumber: string | null; joiningDate: Date; employmentType: string;
};

/** Create (with job assignment + optional login) or edit personal details. Job changes go through AssignmentForm. */
export function EmployeeForm({
  employee, org, freeUsers, canCreateLogin, cancelHref,
}: {
  employee?: EmployeeValues | null;
  org?: { departments: Opt[]; designations: Opt[]; branches: Opt[]; managers: Opt[]; shifts: Opt[] };
  freeUsers?: { id: string; name: string; email: string }[];
  canCreateLogin?: boolean;
  cancelHref: string;
}) {
  const e = employee;
  return (
    <ActionForm action={saveEmployee} className="space-y-5">
      {e && <input type="hidden" name="id" value={e.id} />}
      <Group title="Personal">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name"><input name="fullName" required defaultValue={e?.fullName} className="input" autoFocus /></Field>
          <Field label="Father / husband name"><input name="fatherName" defaultValue={e?.fatherName ?? ""} className="input" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Gender">
            <select name="gender" defaultValue={e?.gender ?? ""} className="input">
              <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Date of birth"><input name="dob" type="date" defaultValue={d(e?.dob)} className="input" /></Field>
          <Field label="Marital status">
            <select name="maritalStatus" defaultValue={e?.maritalStatus ?? ""} className="input">
              <option value="">—</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="CNIC"><input name="cnic" defaultValue={e?.cnic ?? ""} className="input" placeholder="42101-1234567-1" /></Field>
          <Field label="CNIC expiry"><input name="cnicExpiry" type="date" defaultValue={d(e?.cnicExpiry)} className="input" /></Field>
          <Field label="Blood group"><input name="bloodGroup" defaultValue={e?.bloodGroup ?? ""} className="input" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input name="phone" defaultValue={e?.phone ?? ""} className="input" /></Field>
          <Field label="Personal email"><input name="personalEmail" type="email" defaultValue={e?.personalEmail ?? ""} className="input" /></Field>
        </div>
        <div className="grid grid-cols-[2fr_1fr] gap-3">
          <Field label="Address"><input name="address" defaultValue={e?.address ?? ""} className="input" /></Field>
          <Field label="City"><input name="city" defaultValue={e?.city ?? "Karachi"} className="input" /></Field>
        </div>
      </Group>

      <Group title="Emergency contact">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name"><input name="emergencyName" defaultValue={e?.emergencyName ?? ""} className="input" /></Field>
          <Field label="Relation"><input name="emergencyRelation" defaultValue={e?.emergencyRelation ?? ""} className="input" /></Field>
          <Field label="Phone"><input name="emergencyPhone" defaultValue={e?.emergencyPhone ?? ""} className="input" /></Field>
        </div>
      </Group>

      <Group title="Employment">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Joining date"><input name="joiningDate" type="date" required defaultValue={d(e?.joiningDate) || d(new Date())} className="input" /></Field>
          <Field label="Type">
            <select name="employmentType" defaultValue={e?.employmentType ?? "permanent"} className="input">
              {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        {org && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <OrgSelect name="designationId" label="Designation" options={org.designations} />
              <OrgSelect name="departmentId" label="Department" options={org.departments} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <OrgSelect name="branchId" label="Branch" options={org.branches} />
              <OrgSelect name="managerId" label="Reports to" options={org.managers} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <OrgSelect name="shiftId" label="Shift" options={org.shifts} />
              <Field label="Device ID (ZKTeco)"><input name="deviceUserId" inputMode="numeric" className="input" /></Field>
            </div>
          </>
        )}
      </Group>

      <Group title="Bank (salary transfer)">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Bank"><input name="bankName" defaultValue={e?.bankName ?? ""} className="input" /></Field>
          <Field label="Account title"><input name="accountTitle" defaultValue={e?.accountTitle ?? ""} className="input" /></Field>
          <Field label="Account / IBAN"><input name="accountNumber" defaultValue={e?.accountNumber ?? ""} className="input" /></Field>
        </div>
      </Group>

      {!e && (
        <Group title="System login (optional)">
          {freeUsers && freeUsers.length > 0 && (
            <Field label="Link an existing login">
              <select name="linkUserId" defaultValue="" className="input">
                <option value="">— none —</option>
                {freeUsers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
              </select>
            </Field>
          )}
          {canCreateLogin && (
            <details className="rounded-lg border border-line px-3 py-2">
              <summary className="cursor-pointer text-sm text-muted">…or create a new login (Employee role)</summary>
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="createLogin" className="accent-navy-900" /> Create login</label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field label="Login email"><input name="loginEmail" type="email" className="input" /></Field>
                <Field label="Temporary password" hint="At least 8 characters"><input name="loginPassword" type="password" autoComplete="new-password" className="input" /></Field>
              </div>
            </details>
          )}
        </Group>
      )}

      <div className="flex gap-2">
        <SubmitButton>{e ? "Save changes" : "Add employee"}</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost" scroll={false}>Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}

export function AssignmentForm({ employee, org, cancelHref }: {
  employee: { id: string; designationId: string | null; departmentId: string | null; branchId: string | null; managerId: string | null; shiftId: string | null };
  org: { departments: Opt[]; designations: Opt[]; branches: Opt[]; managers: Opt[]; shifts: Opt[] };
  cancelHref: string;
}) {
  return (
    <ActionForm action={changeAssignment} className="space-y-4">
      <input type="hidden" name="id" value={employee.id} />
      <p className="text-sm text-muted">Promotions, transfers and manager changes are recorded on the employee’s history.</p>
      <div className="grid grid-cols-2 gap-3">
        <OrgSelect name="designationId" label="Designation" options={org.designations} value={employee.designationId} />
        <OrgSelect name="departmentId" label="Department" options={org.departments} value={employee.departmentId} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <OrgSelect name="branchId" label="Branch" options={org.branches} value={employee.branchId} />
        <OrgSelect name="managerId" label="Reports to" options={org.managers.filter((m) => m.id !== employee.id)} value={employee.managerId} />
      </div>
      <OrgSelect name="shiftId" label="Shift" options={org.shifts} value={employee.shiftId} />
      <Field label="Effective date"><input name="effective" type="date" defaultValue={d(new Date())} className="input" /></Field>
      <Field label="Notes"><textarea name="notes" rows={2} className="input" /></Field>
      <div className="flex gap-2">
        <SubmitButton>Save change</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost" scroll={false}>Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}

export function ResignForm({ employeeId, cancelHref }: { employeeId: string; cancelHref: string }) {
  return (
    <ActionForm action={recordResignation} className="space-y-4">
      <input type="hidden" name="id" value={employeeId} />
      <Field label="Type">
        <select name="exitType" className="input">
          <option value="resigned">Resignation</option>
          <option value="terminated">Termination</option>
          <option value="other">Other (contract end, etc.)</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Notice date"><input name="noticeDate" type="date" defaultValue={d(new Date())} required className="input" /></Field>
        <Field label="Last working day"><input name="lastWorkingDay" type="date" required className="input" /></Field>
      </div>
      <Field label="Reason"><textarea name="reason" rows={3} className="input" /></Field>
      <p className="text-xs text-muted">The exit checklist is created now. The login stays active until you complete the exit.</p>
      <div className="flex gap-2">
        <SubmitButton variant="danger">Record notice</SubmitButton>
        <LinkButton href={cancelHref} variant="ghost" scroll={false}>Cancel</LinkButton>
      </div>
    </ActionForm>
  );
}

export function DocumentForm({ employeeId, note }: { employeeId: string; note?: string }) {
  return (
    <ActionForm action={uploadDocument} className="space-y-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type">
          <select name="type" className="input">{DOC_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Title (optional)"><input name="title" className="input" /></Field>
        <Field label="Expires (optional)"><input name="expiresAt" type="date" className="input" /></Field>
      </div>
      <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
      <p className="text-xs text-muted">PDF, JPG, PNG or WebP · up to 10 MB.{note ? ` ${note}` : ""}</p>
      <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
    </ActionForm>
  );
}

function OrgSelect({ name, label, options, value }: { name: string; label: string; options: Opt[]; value?: string | null }) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value ?? ""} className="input">
        <option value="">—</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </Field>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{title}</legend>
      {children}
    </fieldset>
  );
}
