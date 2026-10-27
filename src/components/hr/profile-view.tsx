// Employee profile (ResourceInn layout): header band with photo, completion, age, contacts and experience, then
// tabs — Employee Info, Employment Info, Salary & Benefits, User Information, Contact Info, Assets, Relatives,
// Qualifications & Experiences, Documents, Policies, Banks — plus any extra tabs the page adds (history, checklists).
// HR editors get inline forms; everyone else (including the employee in My Space) sees values.
import Link from "next/link";
import { format } from "date-fns";
import { Briefcase, CreditCard, Download, FileText, Hourglass, IdCard, Landmark, Mail, Phone, Plus, ShieldCheck, Trash2, User, Users } from "lucide-react";
import { fileUrl } from "@/lib/files";
import { fmtDate } from "@/lib/utils";
import { PAYMENT_METHODS, RELATIONS, profileSection, type OptionSource } from "@/lib/profile-fields";
import type { Profile } from "@/lib/employee-profile";
import { empStatus } from "@/lib/hr-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field } from "@/components/ui";
import { StatusPill } from "@/components/crm/bits";
import { PersonAvatar } from "@/components/person-avatar";
import { MiniTable, ProfileTabs, Row, SectionForm, SectionTitle, type ProfileTab } from "./profile-parts";
import { addBank, addQualification, addRelative, deleteProfileRow, saveProfileSection } from "@/app/(app)/hr/employees/profile-actions";
import { uploadDocument, uploadPhoto } from "@/app/(app)/hr/employees/actions";

const money = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;
const def = (k: string) => profileSection(k)!;

export function ProfileView({ p, options, canEdit, canSalary, showSalary, actions, banner, extraTabs = [], initialTab, docsTab, userTab }: {
  p: Profile; options: Record<OptionSource, [string, string][]>; canEdit: boolean;
  /** May edit salary (payroll admins). */
  canSalary: boolean;
  /** May see salary (payroll viewers, or the employee themselves). */
  showSalary: boolean;
  actions?: React.ReactNode; banner?: React.ReactNode; extraTabs?: ProfileTab[]; initialTab: string;
  /** Overrides for tabs whose content differs between HR and My Space. */
  docsTab?: React.ReactNode; userTab?: React.ReactNode;
}) {
  const { emp, values } = p;
  const id = emp.id;
  const st = empStatus(emp.status);
  const docs = (prefix: string) => emp.documents.filter((d) => d.type.toLowerCase().startsWith(prefix.toLowerCase()));

  const attachment = (label: string, type: string) => (
    <Row label={label}>
      <div className="flex flex-wrap items-center gap-2">
        {docs(type).map((d) => (
          <a key={d.id} href={fileUrl(d.path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs hover:bg-surface">
            <FileText className="size-3" /> {d.title}{!d.verified && <span className="text-amber-600"> · awaiting HR</span>}
          </a>
        ))}
        {!docs(type).length && <span className="text-muted">—</span>}
      </div>
    </Row>
  );
  const attachForm = (type: string, label: string) => canEdit && (
    <ActionForm action={uploadDocument} className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input type="hidden" name="employeeId" value={id} />
      <input type="hidden" name="type" value={type} />
      <span className="text-xs text-muted">Add {label}:</span>
      <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" aria-label={`${label} file`} className="flex-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-navy-900 file:px-2 file:py-1 file:text-white" />
      <SubmitButton variant="secondary" pendingText="Uploading…" className="h-8 px-3 text-xs">Upload</SubmitButton>
    </ActionForm>
  );

  // ── Tabs
  const employeeInfo = (
    <Card className="p-4">
      <SectionForm employeeId={id} def={def("personal")} values={values} options={options} canEdit={canEdit} action={saveProfileSection} icon={<User className="size-4" />}
        before={
          <Row label="Profile Pic">
            {canEdit ? (
              <ActionForm action={uploadPhoto} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={id} />
                <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required aria-label="Profile picture" className="flex-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-navy-900 file:px-2 file:py-1 file:text-white" />
                <SubmitButton variant="secondary" pendingText="Uploading…" className="h-8 px-3 text-xs">Upload</SubmitButton>
                <span className="w-full text-xs text-muted">{emp.photo ? emp.photo.split("/").pop() : "No picture yet"} · JPG, PNG or WebP up to 4 MB.</span>
              </ActionForm>
            ) : emp.photo ? emp.photo.split("/").pop() : <span className="text-muted">—</span>}
          </Row>
        } />
      <SectionForm employeeId={id} def={def("quick")} values={values} options={options} canEdit={canEdit} action={saveProfileSection} icon={<Phone className="size-4" />} />
      <SectionForm employeeId={id} def={def("cnic")} values={values} options={options} canEdit={canEdit} action={saveProfileSection} icon={<IdCard className="size-4" />}
        after={attachment("CNIC Attachment", "CNIC")} />
      {attachForm("CNIC (front)", "CNIC front")}
      {attachForm("CNIC (back)", "CNIC back")}
      <SectionForm employeeId={id} def={def("passport")} values={values} options={options} canEdit={canEdit} action={saveProfileSection} title="PASSPORT" icon={<IdCard className="size-4" />}
        after={attachment("Passport Attachment", "Passport")} />
      {attachForm("Passport", "passport")}
      <SectionForm employeeId={id} def={def("license")} values={values} options={options} canEdit={canEdit} action={saveProfileSection} title="DRIVING LICENSE" icon={<IdCard className="size-4" />}
        after={attachment("Driving License Attachment", "Driving license")} />
      {attachForm("Driving license", "driving license")}
    </Card>
  );

  const employment = (
    <Card className="p-4">
      <SectionForm employeeId={id} def={def("employment")} values={values} options={options} canEdit={canEdit} action={saveProfileSection} icon={<Briefcase className="size-4" />}
        before={<div>
          <Row label="Status"><StatusPill name={st.label} colorName={st.color} /></Row>
          <Row label="Is Line Manager?">{emp.reports.length ? `Yes · ${emp.reports.length} direct report${emp.reports.length === 1 ? "" : "s"}` : "No"}</Row>
          {emp.confirmedAt && <Row label="Confirmed on">{fmtDate(emp.confirmedAt)}</Row>}
        </div>} />
      {canEdit && <p className="px-3 pt-2 text-xs text-muted">Changing branch, department, designation or line manager is recorded on the employee’s history. Use “Role / transfer” at the top to add an effective date and notes.</p>}
      {emp.reports.length > 0 && (
        <>
          <SectionTitle icon={<Users className="size-4" />}>Team</SectionTitle>
          <div className="flex flex-wrap gap-2 px-3 py-2">
            {emp.reports.map((r) => <Link key={r.id} href={`/hr/employees/${r.id}`} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-surface">{r.fullName}</Link>)}
          </div>
        </>
      )}
    </Card>
  );

  const d = p.division;
  const salary = (
    <Card className="p-4">
      {showSalary ? (
        <>
          <SectionForm employeeId={id} def={def("salary")} values={values} options={options} canEdit={canSalary} action={saveProfileSection} icon={<CreditCard className="size-4" />}
            before={<Row label="Payroll Type">Monthly</Row>}
            after={<Row label="Bank">{emp.bankName ? `${emp.bankName}${emp.accountNumber ? ` · ${emp.accountNumber}` : ""}` : <span className="text-muted">Add one in the Banks tab</span>}</Row>} />
          <SectionTitle>Division</SectionTitle>
          {d ? (
            <>
              <Row label="Gross Salary">{money(d.gross)}</Row>
              <Row label="Per Day Salary">{money(d.perDay)}</Row>
              <Row label="Per Hour Salary">{money(d.perHour)}</Row>
              <Row label="Per Minute Salary">{d.perMinute.toFixed(2)}</Row>
              <Row label="Weekly Workable Hours">{d.weeklyHours}</Row>
              <Row label="Monthly Payable Hours">{d.monthlyHours}</Row>
            </>
          ) : <p className="px-3 py-6 text-center text-sm text-muted">No salary set yet.</p>}
          <SectionTitle>Benefits</SectionTitle>
          {d && p.components.length ? (
            <MiniTable head={["Component", "% of gross", "Monthly"]} rows={p.components.map((c) => [c.name, `${c.pctOfGross}%`, money((d.gross * c.pctOfGross) / 100)])} />
          ) : <p className="px-3 py-6 text-center text-sm text-muted">No Records Found!</p>}
        </>
      ) : <p className="py-10 text-center text-sm text-muted">Salary is visible to payroll staff only.</p>}
    </Card>
  );

  const user = userTab ?? (
    <Card className="p-4">
      <SectionTitle icon={<ShieldCheck className="size-4" />}>User Account Information</SectionTitle>
      {emp.user ? (
        <>
          <Row label="Email/Username">{emp.user.email}</Row>
          <Row label="Time Zone">{process.env.APP_TIMEZONE ?? "Asia/Karachi"}</Row>
          <Row label="Role">{emp.user.roles.map((r) => r.role.name).join(", ") || "—"}</Row>
          <Row label="Account">{emp.user.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</Row>
          <Row label="Last sign-in">{emp.user.lastLoginAt ? format(emp.user.lastLoginAt, "d MMM yyyy, h:mm a") : "Never"}</Row>
        </>
      ) : <p className="px-3 py-6 text-center text-sm text-muted">{emp.fullName} has no login yet.</p>}
    </Card>
  );

  const contact = (
    <Card className="p-4">
      <SectionForm employeeId={id} def={def("contact")} values={values} options={options} canEdit={canEdit} action={saveProfileSection} icon={<Phone className="size-4" />} />
    </Card>
  );

  const assets = (
    <Card className="p-4">
      <SectionTitle>Asset</SectionTitle>
      <MiniTable head={["Tag", "Asset", "Category", "Serial", "Since"]}
        rows={emp.assets.map((a) => [<span key="t" className="font-mono text-xs">{a.tag}</span>, <Link key="n" href={`/hr/assets?a=${a.id}`} className="hover:underline">{a.name}</Link>, a.category, a.serial ?? "—", a.assignedAt ? fmtDate(a.assignedAt) : "—"])} />
    </Card>
  );

  const del = (kind: string, rowId: string) => canEdit && (
    <form action={deleteProfileRow}>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="rowId" value={rowId} />
      <button title="Remove" aria-label="Remove" className="rounded p-1 text-muted hover:text-red-600"><Trash2 className="size-3.5" /></button>
    </form>
  );

  const relatives = (
    <Card className="p-4">
      <SectionTitle icon={<Users className="size-4" />}>Relatives</SectionTitle>
      <MiniTable head={["Name", "Relation", "D.O.B", "CNIC", "Phone", "", ""]}
        rows={emp.relatives.map((r) => [r.name, r.relation, r.dob ? fmtDate(r.dob) : "—", r.cnic ?? "—", r.phone ?? "—",
          <span key="f" className="flex gap-1">{r.emergency && <Badge tone="red">Emergency</Badge>}{r.dependent && <Badge tone="navy">Dependent</Badge>}</span>, del("relative", r.id)])} />
      {canEdit && (
        <ActionForm action={addRelative} className="mt-4 grid gap-3 rounded-lg border border-dashed border-line p-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={id} />
          <Field label="Name"><input name="name" required className="input h-9" /></Field>
          <Field label="Relation"><select name="relation" required className="input h-9"><option value="">Select</option>{RELATIONS.map(([v]) => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Phone"><input name="phone" className="input h-9" /></Field>
          <Field label="D.O.B"><input name="dob" type="date" className="input h-9" /></Field>
          <Field label="CNIC"><input name="cnic" className="input h-9" /></Field>
          <div className="flex flex-wrap items-end gap-3 pb-1 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" name="dependent" /> Dependent</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" name="emergency" /> Emergency contact</label>
          </div>
          <div className="sm:col-span-3"><SubmitButton variant="secondary"><Plus className="size-4" /> Add relative</SubmitButton></div>
        </ActionForm>
      )}
    </Card>
  );

  const q = (kind: string) => emp.qualifications.filter((x) => x.kind === kind);
  const period = (from: Date | null, to: Date | null) => (from ? `${format(from, "MMM yyyy")} – ${to ? format(to, "MMM yyyy") : "Present"}` : "—");
  const qualifications = (
    <Card className="p-4">
      <SectionTitle icon={<Briefcase className="size-4" />}>Experiences</SectionTitle>
      <MiniTable head={["Job title", "Company", "Period", "Notes", ""]} rows={q("experience").map((x) => [x.title, x.institution ?? "—", period(x.from, x.to), x.notes ?? "—", del("qualification", x.id)])} />
      <SectionTitle>Educations/Qualifications</SectionTitle>
      <MiniTable head={["Degree", "Institute", "Period", "Grade", ""]} rows={q("education").map((x) => [x.title, x.institution ?? "—", period(x.from, x.to), x.grade ?? "—", del("qualification", x.id)])} />
      <SectionTitle>Certifications</SectionTitle>
      <MiniTable head={["Certification", "Issued by", "Issued", "Expires", ""]} rows={q("certification").map((x) => [x.title, x.institution ?? "—", x.from ? fmtDate(x.from) : "—", x.to ? fmtDate(x.to) : "—", del("qualification", x.id)])} />
      {canEdit && (
        <ActionForm action={addQualification} className="mt-4 grid gap-3 rounded-lg border border-dashed border-line p-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={id} />
          <Field label="Type"><select name="kind" className="input h-9"><option value="experience">Experience</option><option value="education">Education</option><option value="certification">Certification</option></select></Field>
          <Field label="Title / degree / job title"><input name="title" required className="input h-9" /></Field>
          <Field label="Company / institute"><input name="institution" className="input h-9" /></Field>
          <Field label="From"><input name="from" type="date" className="input h-9" /></Field>
          <Field label="To (empty = present)"><input name="to" type="date" className="input h-9" /></Field>
          <Field label="Grade"><input name="grade" className="input h-9" /></Field>
          <Field label="Notes" className="sm:col-span-3"><input name="notes" className="input h-9" /></Field>
          <div className="sm:col-span-3"><SubmitButton variant="secondary"><Plus className="size-4" /> Add</SubmitButton></div>
        </ActionForm>
      )}
    </Card>
  );

  const policies = (
    <Card className="p-4">
      <SectionTitle>Default Time Slot</SectionTitle>
      <Row label="Time Slot">{p.shift ? `${p.shift.name} (${p.shift.start}–${p.shift.end})${emp.shift ? "" : " · company default"}` : "—"}</Row>
      <SectionTitle>Leave Types</SectionTitle>
      <MiniTable head={["Name", "Entitled", "Carry forward", "Additional quota", "Availed", "Pending", "Available"]}
        rows={p.balances.map((b) => [b.type.name, b.unlimited ? "Unlimited" : b.entitled, b.carried, b.adjusted, b.used, b.pending, b.unlimited ? "—" : <b key="a">{b.available}</b>])} />
      <SectionTitle>Attendance Policies</SectionTitle>
      <Row label="Late after">{p.shift ? `${p.shift.graceMin} minutes past ${p.shift.start}` : "—"}</Row>
      <Row label="Half day below">{p.shift ? `${Math.round(p.shift.halfDayMin / 6) / 10} hours worked` : "—"}</Row>
      <Row label="Working days">{p.shift ? p.shift.workDays.split(",").map((n) => ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Number(n)]).join(", ") : "—"}</Row>
      <Row label="Attendance exempt">{emp.attendanceExempt ? "Yes — never marked absent or late" : "No"}</Row>
    </Card>
  );

  const banks = (
    <Card className="p-4">
      <SectionTitle icon={<Landmark className="size-4" />}>Banks</SectionTitle>
      <MiniTable head={["Bank Name", "Branch Name", "Branch Code", "Account title", "Account / IBAN", "Effective Date", ""]}
        rows={emp.banks.length ? emp.banks.map((b, i) => [<span key="n">{b.bankName}{i === 0 && <Badge tone="green">Current</Badge>}</span>, b.branchName ?? "—", b.branchCode ?? "—", b.accountTitle ?? "—", b.accountNumber, fmtDate(b.effectiveFrom), del("bank", b.id)])
          : emp.bankName ? [[emp.bankName, "—", "—", emp.accountTitle ?? "—", emp.accountNumber ?? "—", "—", ""]] : []} />
      {canEdit && (
        <ActionForm action={addBank} className="mt-4 grid gap-3 rounded-lg border border-dashed border-line p-3 sm:grid-cols-3">
          <input type="hidden" name="id" value={id} />
          <Field label="Bank name"><input name="bankName" required className="input h-9" placeholder="e.g. Meezan Bank" /></Field>
          <Field label="Branch name"><input name="branchName" className="input h-9" /></Field>
          <Field label="Branch code"><input name="branchCode" className="input h-9" /></Field>
          <Field label="Account title"><input name="accountTitle" defaultValue={emp.fullName} className="input h-9" /></Field>
          <Field label="Account / IBAN"><input name="accountNumber" required className="input h-9" /></Field>
          <Field label="Effective date"><input name="effectiveFrom" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} className="input h-9" /></Field>
          <p className="text-xs text-muted sm:col-span-3">Salary is paid into the latest account whose effective date has arrived ({PAYMENT_METHODS[0][1].toLowerCase()}).</p>
          <div className="sm:col-span-3"><SubmitButton variant="secondary"><Plus className="size-4" /> Add bank</SubmitButton></div>
        </ActionForm>
      )}
    </Card>
  );

  const tabs: ProfileTab[] = [
    { key: "info", label: "Employee Info", content: employeeInfo },
    { key: "employment", label: "Employment Info", content: employment },
    { key: "salary", label: "Salary & Benefits Info", content: salary },
    { key: "user", label: "User Information", content: user },
    { key: "contact", label: "Contact Info", content: contact },
    { key: "assets", label: "Assets", count: emp.assets.length, content: assets },
    { key: "relatives", label: "Relatives", count: emp.relatives.length, content: relatives },
    { key: "qualifications", label: "Qualifications & Experiences", count: emp.qualifications.length, content: qualifications },
    { key: "documents", label: "My Documents", count: emp.documents.length, content: docsTab },
    { key: "policies", label: "Policies", content: policies },
    { key: "banks", label: "Banks", content: banks },
    ...extraTabs,
  ];

  return (
    <>
      <div className="mb-5 overflow-hidden rounded-xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-800 text-white shadow-sm">
        <div className="grid items-center gap-5 p-5 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
          <div className="relative mx-auto w-fit">
            <PersonAvatar name={emp.fullName} photo={emp.photo} className="size-24 border-4 border-white/15 bg-white/10 text-2xl text-white" />
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold-400 px-2.5 py-0.5 text-[11px] font-semibold text-navy-950">{p.completion}% Completed</span>
          </div>
          <div className="min-w-0 text-center md:text-left">
            <h1 className="truncate text-xl font-semibold">{emp.salutation ? `${emp.salutation}. ` : ""}{emp.fullName}</h1>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-white/60">{emp.jobTitle ?? emp.designation?.name ?? "No designation"}</p>
            <p className="text-[11px] tracking-wider text-white/50">{emp.code}{emp.department ? ` · ${emp.department.name}` : ""}{emp.branch ? ` · ${emp.branch.name}` : ""}</p>
            <div className="mt-2 flex justify-center md:justify-start"><StatusPill name={st.label} colorName={st.color} /></div>
          </div>
          <ul className="space-y-1.5 text-xs text-white/80">
            <HeaderLine icon={<Hourglass className="size-3" />}>{p.ageText ?? "Date of birth not set"}</HeaderLine>
            <HeaderLine icon={<Mail className="size-3" />}>{emp.officialEmail ?? emp.user?.email ?? emp.personalEmail ?? "No email"}</HeaderLine>
            <HeaderLine icon={<Phone className="size-3" />}>{emp.phone ? <>{emp.phone} <i className="text-white/50">(Mobile No)</i></> : "No mobile number"}</HeaderLine>
            <HeaderLine icon={<Briefcase className="size-3" />}>Total Experience {p.experienceText}</HeaderLine>
          </ul>
          <div className="flex flex-col items-center gap-2 md:items-end">
            <a href={`/print/employee/${id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-gold-400 px-3 py-1.5 text-xs font-medium text-gold-300 hover:bg-white/5">
              <Download className="size-3.5" /> Download profile card
            </a>
          </div>
        </div>
        {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 bg-black/10 px-5 py-2.5">{actions}</div>}
      </div>
      {banner}
      <ProfileTabs tabs={tabs} initial={initialTab} />
    </>
  );
}

function HeaderLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

