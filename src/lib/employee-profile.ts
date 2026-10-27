// Everything the employee profile (HR → People → employee, and My Space) shows: the record with its lists, form
// values per field, completion %, age and total experience, and the salary division.
import { differenceInMonths, format, intervalToDuration } from "date-fns";
import { db } from "./db";
import { balancesFor } from "./leave";
import { policiesFor } from "./policies";
import { defaultShift } from "./attendance";
import { COMPLETION_KEYS, customSection, type OptionSource } from "./profile-fields";

export async function loadProfile(id: string) {
  const emp = await db.employee.findUnique({
    where: { id },
    include: {
      department: true, designation: true, branch: true, manager: true, shift: true, salary: true,
      user: { select: { id: true, email: true, active: true, lastLoginAt: true, roles: { select: { role: { select: { name: true } } } } } },
      reports: { where: { status: { not: "left" } }, select: { id: true, fullName: true } },
      documents: { orderBy: { createdAt: "desc" } },
      events: { orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
      checklist: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
      assets: { select: { id: true, tag: true, name: true, category: true, serial: true, assignedAt: true }, orderBy: { assignedAt: "desc" } },
      relatives: { orderBy: { createdAt: "asc" } },
      qualifications: { orderBy: [{ from: "desc" }, { createdAt: "desc" }] },
      banks: { orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] },
      letters: { orderBy: { issuedAt: "desc" }, select: { id: true, title: true, issuedAt: true } },
    },
  });
  if (!emp) return null;

  const [first, ...rest] = emp.fullName.trim().split(/\s+/);
  const parts = emp.firstName ? { firstName: emp.firstName, lastName: emp.lastName } : { firstName: first ?? "", lastName: rest.join(" ") || null };
  const customFields = await db.customField.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  let custom: Record<string, string> = {};
  try { custom = emp.customData ? JSON.parse(emp.customData) : {}; } catch {}
  const finalAuthority = emp.finalAuthorityId ? await db.employee.findUnique({ where: { id: emp.finalAuthorityId }, select: { id: true, fullName: true } }) : null;

  const d = (v: Date | null | undefined) => (v ? format(v, "yyyy-MM-dd") : "");
  const s = emp.salary;
  const values: Record<string, string> = {
    salutation: emp.salutation ?? "", firstName: parts.firstName, middleName: emp.middleName ?? "", lastName: parts.lastName ?? "",
    fatherName: emp.fatherName ?? "", motherName: emp.motherName ?? "", gender: emp.gender ?? "", dob: d(emp.dob),
    maritalStatus: emp.maritalStatus ?? "", religion: emp.religion ?? "", nationality: emp.nationality ?? "", bloodGroup: emp.bloodGroup ?? "",
    phone: emp.phone ?? "", landline: emp.landline ?? "", personalEmail: emp.personalEmail ?? "", officialEmail: emp.officialEmail ?? emp.user?.email ?? "",
    cnic: emp.cnic ?? "", cnicIssued: d(emp.cnicIssued), cnicExpiry: d(emp.cnicExpiry),
    passportNo: emp.passportNo ?? "", passportExpiry: d(emp.passportExpiry), licenseNo: emp.licenseNo ?? "", licenseExpiry: d(emp.licenseExpiry),
    code: emp.code, joiningDate: d(emp.joiningDate), probationEnd: d(emp.probationEnd), employmentType: emp.employmentType, grade: emp.grade ?? "",
    isHod: emp.isHod ? "on" : "", attendanceExempt: emp.attendanceExempt ? "on" : "",
    branchId: emp.branchId ?? "", departmentId: emp.departmentId ?? "", designationId: emp.designationId ?? "", jobTitle: emp.jobTitle ?? "",
    managerId: emp.managerId ?? "", finalAuthorityId: emp.finalAuthorityId ?? "", shiftId: emp.shiftId ?? "", deviceUserId: emp.deviceUserId ?? "",
    gross: s ? String(s.gross) : "", probationGross: s?.probationGross ? String(s.probationGross) : "", effectiveFrom: d(s?.effectiveFrom) || d(new Date()),
    paymentMethod: s?.paymentMethod ?? "bank", ntn: emp.ntn ?? "", incrementMonths: String(s?.incrementMonths ?? 12), nextIncrementAt: d(s?.nextIncrementAt),
    taxExempt: s?.taxExempt ? "on" : "", eobi: !s || s.eobi ? "on" : "", pfPct: s ? String(s.pfPct) : "0",
    address: emp.address ?? "", permanentAddress: emp.permanentAddress ?? "", city: emp.city ?? "",
    emergencyName: emp.emergencyName ?? "", emergencyRelation: emp.emergencyRelation ?? "", emergencyPhone: emp.emergencyPhone ?? "",
    ...Object.fromEntries(customFields.map((f) => [`cf_${f.id}`, custom[f.id] ?? ""])),
  };

  // Completion
  const has: Record<string, boolean> = {
    ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k, !!v])),
    photo: !!emp.photo, bankName: !!emp.bankName, accountNumber: !!emp.accountNumber,
    cnicDoc: emp.documents.some((x) => x.type.startsWith("CNIC")), relative: emp.relatives.length > 0, qualification: emp.qualifications.length > 0,
  };
  const completion = Math.round((COMPLETION_KEYS.filter((k) => has[k]).length / COMPLETION_KEYS.length) * 100);

  // Age and experience
  const now = new Date();
  const age = emp.dob ? intervalToDuration({ start: emp.dob, end: now }) : null;
  const ageText = age ? `${age.years ?? 0} years, ${age.months ?? 0} months, ${age.days ?? 0} days` : null;
  const priorMonths = emp.qualifications.filter((q) => q.kind === "experience" && q.from).reduce((sum, q) => sum + Math.max(0, differenceInMonths(q.to ?? now, q.from!)), 0);
  const months = priorMonths + Math.max(0, differenceInMonths(emp.leftAt ?? now, emp.joiningDate));
  const experienceText = `${Math.floor(months / 12)}Y ${months % 12}M`;

  // Salary division: what one hour / minute of this person's time costs, from their shift.
  const shift = emp.shift ?? (await defaultShift());
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  const dayMin = shift ? ((toMin(shift.end) - toMin(shift.start) + 1440) % 1440 || 480) : 480;
  const workDays = shift ? shift.workDays.split(",").filter(Boolean).length : 6;
  const weeklyHours = Math.round(((dayMin * workDays) / 60) * 10) / 10;
  const monthlyMinutes = (dayMin * workDays * 52) / 12;
  const division = s ? {
    gross: s.gross, weeklyHours, monthlyHours: Math.round((monthlyMinutes / 60) * 10) / 10,
    perDay: s.gross / ((workDays * 52) / 12), perHour: s.gross / (monthlyMinutes / 60), perMinute: s.gross / monthlyMinutes,
  } : null;
  const components = s ? await db.payComponent.findMany({ orderBy: { sortOrder: "asc" } }) : [];

  const [balances, policies] = await Promise.all([balancesFor(emp.id).catch(() => []), policiesFor(emp.id)]);
  return { emp, values, completion, ageText, experienceText, division, components, balances, policies, finalAuthority, shift, customDef: customSection(customFields) };
}

export type Profile = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;

/** id → name options for the profile selects that come from the database. */
export async function profileOptions(): Promise<Record<OptionSource, [string, string][]>> {
  const [departments, designations, branches, employees, shifts] = await Promise.all([
    db.department.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.designation.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.branch.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.shift.findMany({ select: { id: true, name: true, start: true, end: true }, orderBy: { name: "asc" } }),
  ]);
  const pair = (xs: { id: string; name: string }[]) => xs.map((x) => [x.id, x.name] as [string, string]);
  return {
    departments: pair(departments), designations: pair(designations), branches: pair(branches),
    employees: employees.map((e) => [e.id, e.fullName]), shifts: shifts.map((x) => [x.id, `${x.name} (${x.start}–${x.end})`]),
  };
}
