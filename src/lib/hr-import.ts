// Move from the old HR system: reads its five Excel exports and adds them to AMS (nothing is deleted).
// Files are read in memory and never stored.
import JSZip from "jszip";
import { randomBytes } from "node:crypto";
import { format, getDaysInMonth } from "date-fns";
import { db } from "./db";
import { hashPassword } from "./auth";
import { audit } from "./audit";
import { balancesFor } from "./leave";
import { sendLoginEmail } from "./invites";

type Cell = string | number | undefined;
type Row = Record<string, Cell>;

const colIndex = (ref: string) => { let i = 0; for (const ch of ref.match(/[A-Z]+/)![0]) i = i * 26 + ch.charCodeAt(0) - 64; return i - 1; };
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

/** Minimal xlsx reader: exceljs refuses workbooks with a sheet called "History", which this export has. */
export async function readXlsx(data: ArrayBuffer): Promise<Record<string, Row[]>> {
  const zip = await JSZip.loadAsync(data);
  const text = (p: string) => zip.files[p]?.async("string") ?? Promise.resolve("");
  const strings = [...(await text("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1]!.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join("")));
  const rels = new Map([...(await text("xl/_rels/workbook.xml.rels")).matchAll(/<Relationship [^>]*>/g)].map((m) => [m[0].match(/Id="([^"]+)"/)?.[1], m[0].match(/Target="([^"]+)"/)?.[1]]));
  const out: Record<string, Row[]> = {};
  for (const s of (await text("xl/workbook.xml")).matchAll(/<sheet [^>]*>/g)) {
    const name = decode(s[0].match(/name="([^"]+)"/)?.[1] ?? "");
    const target = rels.get(s[0].match(/r:id="([^"]+)"/)?.[1]) ?? "";
    const rows: Cell[][] = [];
    for (const r of (await text(`xl/${target.replace(/^\/?xl\//, "")}`)).matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
      const row: Cell[] = [];
      for (const c of r[1]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const t = c[1]!.match(/t="(\w+)"/)?.[1];
        const v = c[2]?.match(/<v>([^<]*)<\/v>/)?.[1];
        row[colIndex(c[1]!.match(/r="([A-Z]+\d+)"/)![1]!)] = t === "s" ? strings[Number(v)] : t === "inlineStr" ? decode(c[2]?.match(/<t[^>]*>([^<]*)<\/t>/)?.[1] ?? "") : v === undefined ? undefined : t === "str" ? decode(v) : Number(v);
      }
      rows.push(row);
    }
    const head = (rows[0] ?? []).map((h) => String(h ?? "").trim());
    out[name] = rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, typeof r[i] === "string" ? (r[i] as string).trim() : r[i]])));
  }
  return out;
}

const str = (v: Cell) => (v === undefined || v === null ? "" : String(v).trim());
const num = (v: Cell) => { const n = typeof v === "number" ? v : parseFloat(str(v).replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "Jul 01, 2026", "2026-07-01" or "2026-07-01 00:00:00" as local midnight. */
function parseDate(v: Cell) {
  const s = str(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  m = s.match(/^([A-Za-z]{3})\w* (\d{1,2}), (\d{4})/);
  return m && MONTHS.includes(m[1]!.toLowerCase()) ? new Date(+m[3]!, MONTHS.indexOf(m[1]!.toLowerCase()), +m[2]!) : null;
}
/** "12:59 pm" as minutes after midnight. */
const clock = (v: Cell) => { const m = str(v).match(/^(\d{1,2}):(\d{2}) ?(am|pm)$/i); return m ? ((+m[1]! % 12) + (m[3]!.toLowerCase() === "pm" ? 12 : 0)) * 60 + +m[2]! : null; };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);

function statusOf(row: Row) {
  const inS = str(row["Check-in Status"]), outS = str(row["Check-out Status"]);
  if (inS === "On Time" || inS === "Late") return outS === "Missing" ? "missing" : inS === "Late" ? "late" : "present";
  if (inS === "Day Off") return "weekend";
  if (inS === "Absent") return "absent";
  if (inS === "Missing") return "missing";
  if (/leave/i.test(inS) || str(row["Leave Type"])) return "leave";
  return inS ? "holiday" : null;
}

export type HrFiles = { employee: ArrayBuffer; attendance?: ArrayBuffer; salary?: ArrayBuffer; leave?: ArrayBuffer; probation?: ArrayBuffer };
type Person = {
  code: string; name: string; first: string; middle: string; last: string; father: string; mother: string; gender: string | null; dob: Date | null; marital: string; religion: string; nationality: string; blood: string;
  phone: string; landline: string; contactEmail: string; address: string; permanent: string; city: string; cnic: string; cnicExpiry: Date | null; passport: string; passportExpiry: Date | null; license: string; licenseExpiry: Date | null;
  emergencyName: string; emergencyRelation: string; emergencyPhone: string;
  designation: string; grade: string; joining: Date | null; gross: number; ntn: string; bank: string; paymentMethod: string; department: string; branch: string; email: string; role: string;
  qualifications: { kind: string; title: string }[]; history: { title: string; details: string; date: Date }[];
  probation?: { start: Date | null; end: Date | null; score: string; salary: number };
  shift?: { start: string; end: string };
};
type Day = { code: string; date: Date; status: string; note: string | null; inMin: number | null; outMin: number | null; lateMin: number; earlyMin: number; workedMin: number; overtimeMin: number; leaveType: string | null; halfDay: boolean };
type Slip = { code: string; month: string; designation: string; department: string; gross: number; earnings: number; deductions: number; tax: number; net: number; days: number; lines: { kind: string; label: string; amount: number; source: string }[] };
type Bal = { code: string; type: string; opening: number; additional: number; available: number };
export type ParsedHr = { people: Person[]; days: Day[]; slips: Slip[]; balances: Bal[] };
export type HrPreview = { employees: number; logins: number; salaries: number; attendanceDays: number; attendanceRange: string; payslips: number; payMonths: number; balances: number; probation: number; roles: Record<string, number>; warnings: string[] };

const EARN: [string, string][] = [["Basic Salary", "component"], ["Conveyance Allowance", "component"], ["Commission", "commission"], ["Overtime", "overtime"], ["Late Sitting Allowance", "adjustment"], ["Cpl", "adjustment"]];
const DEDUCT: [string, string][] = [["Tax", "tax"], ["Missing Deduction", "absence"], ["Late Arrival", "late"], ["Absent Deduction", "absence"], ["Early Left", "late"], ["Short Duration", "late"], ["Quota", "unpaid"]];

function roleFor(designation: string, department: string) {
  if (/^ceo$|chief executive/i.test(designation)) return "Boss";
  if (/human resource|^hr$/i.test(department)) return "HR Manager";
  if (/sales executive/i.test(designation)) return "Agent";
  if (/manager/i.test(designation) && /sales/i.test(department)) return "Sales Manager";
  return "Employee";
}

/** Reads and cross-checks the files without touching the database. */
export async function parseHrFiles(files: HrFiles): Promise<{ parsed: ParsedHr; preview: HrPreview } | { error: string }> {
  const emp = await readXlsx(files.employee);
  const personal = emp["Personal Info"], contact = emp["Contact Info"], job = emp["Employment Info"];
  if (!personal?.length || !contact || !job) return { error: "The employee file needs the sheets Personal Info, Contact Info and Employment Info." };
  const warnings: string[] = [];
  const bySr = (rows: Row[], sr: Cell) => rows.find((r) => str(r["Sr No"]) === str(sr));

  const people = new Map<string, Person>();
  for (const p of personal) {
    const code = str(p["Code"]);
    if (!code) continue;
    const c = bySr(contact, p["Sr No"]) ?? {}, j = bySr(job, p["Sr No"]) ?? {};
    const first = str(p["First Name"]), middle = str(p["Middle Name"]), last = str(p["Last Name"]);
    if (people.has(code)) warnings.push(`Duplicate employee code ${code}: the first one is kept.`);
    const designation = str(j["Designation"]);
    if (!people.has(code)) people.set(code, {
      code, name: [first, middle, last].filter(Boolean).join(" "), first, middle, last, father: str(p["Father's/Husband's Name"]), mother: str(p["Mother's Name"]),
      gender: ["male", "female"].includes(str(p["Gender"]).toLowerCase()) ? str(p["Gender"]).toLowerCase() : null, dob: parseDate(p["D.O.B"]), marital: str(p["Marital Status"]), religion: str(p["Religion"]), nationality: str(p["Nationality"]), blood: str(p["Blood Group"]),
      phone: str(c["Mobile No."]), landline: str(c["Landline No."]), contactEmail: str(c["E-mail Address"]).toLowerCase(), address: str(c["Residential Address"]), permanent: str(c["Permanent Address"]), city: str(c["City"]),
      cnic: str(c["CNIC No."]), cnicExpiry: parseDate(c["CNIC Expiry"]), passport: str(c["Passport No."]), passportExpiry: parseDate(c["Passport Expiry"]), license: str(c["Driving License"]), licenseExpiry: parseDate(c["Driving License Expiry"]),
      emergencyName: str(c["Relative Contact Name"]), emergencyRelation: str(c["Relationship"]), emergencyPhone: str(c["Contact No."]),
      designation, grade: str(j["Grade"]), joining: parseDate(j["Date Of Joining"]), gross: 0, ntn: "", bank: "", paymentMethod: "", department: "", branch: "", email: "", role: "Employee", qualifications: [], history: [],
    });
  }
  for (const s of emp["Salary"] ?? []) {
    const p = people.get(str(s["Code"]));
    if (!p) continue;
    p.gross = num(s["Gross Salary"]); p.ntn = str(s["NTN"]); p.bank = str(s["Bank"]); p.paymentMethod = str(s["Payment Method"]).toLowerCase(); p.department ||= str(s["Department"]);
  }
  for (const q of emp["Qualification"] ?? []) {
    const p = people.get(str(q["Employee Code"]));
    if (!p) continue;
    if (str(q["Academic Qualification"])) p.qualifications.push({ kind: "academic", title: str(q["Academic Qualification"]) });
    if (str(q["Technical Qualification"])) p.qualifications.push({ kind: "technical", title: str(q["Technical Qualification"]) });
  }
  for (const h of emp["History"] ?? []) {
    const p = people.get(str(h["Code"]));
    if (p) p.history.push({ title: [str(h["From"]), str(h["To"])].filter(Boolean).join(" → ") || "History", details: str(h["Description"]), date: parseDate(h["From Date"]) ?? parseDate(h["To Date"]) ?? p.joining ?? new Date() });
  }

  // Attendance: each person's block starts on a row with their name; merged cells leave the rest blank.
  const days: Day[] = [];
  const shiftVotes = new Map<string, Map<string, number>>();
  if (files.attendance) {
    const rows = Object.values(await readXlsx(files.attendance))[0] ?? [];
    let cur: Person | undefined;
    const unknown = new Set<string>();
    for (const r of rows) {
      if (str(r["Employee"])) {
        const code = str(r["Employee"]).match(/\(([^)]+)\)\s*$/)?.[1]?.trim() ?? "";
        cur = people.get(code);
        if (!cur) { unknown.add(code); continue; }
        cur.email = str(r["Official Email"]).toLowerCase();
        cur.branch = str(r["Branch"]);
        cur.department = str(r["Department"]) || cur.department;
      }
      if (!cur) continue;
      const date = parseDate(r["Date"]);
      const status = statusOf(r);
      if (!date || !status) continue;
      const inS = str(r["Check-in Status"]);
      const leaveCol = str(r["Leave Type"]);
      const halfDay = /half/i.test(leaveCol);
      const leaveType = status === "leave" || leaveCol ? (/sick/i.test(inS + leaveCol) ? "Sick Leaves" : "Annual Paid Leaves") : null;
      days.push({
        code: cur.code, date, status: halfDay ? "half" : status, note: status === "holiday" ? inS : halfDay ? "Half day leave" : status === "leave" ? leaveType : null, inMin: clock(r["Check-in Punch Time"]), outMin: clock(r["Check-out Punch Time"]),
        lateMin: num(r["Late Minutes"]), earlyMin: num(r["Early Minutes"]), workedMin: num(r["Worked Minutes"]), overtimeMin: num(r["Overtime Minutes"]),
        leaveType, halfDay,
      });
      const a = clock(r["Check-in Expected Time"]), b = clock(r["Check-out Expected Time"]);
      if (a !== null && b !== null) {
        const key = `${hhmm(a)}|${hhmm(b)}`;
        const votes = shiftVotes.get(cur.code) ?? new Map<string, number>();
        votes.set(key, (votes.get(key) ?? 0) + 1);
        shiftVotes.set(cur.code, votes);
      }
    }
    if (unknown.size) warnings.push(`${unknown.size} name(s) in the attendance file aren't in the employee file, and were skipped: ${[...unknown].join(", ")}`);
    for (const [code, votes] of shiftVotes) {
      const [start, end] = [...votes].sort((x, y) => y[1] - x[1])[0]![0].split("|");
      people.get(code)!.shift = { start: start!, end: end! };
    }
  }

  // Salary sheet: same merged layout, one row per month. Months with no pay were before they joined.
  const slips: Slip[] = [];
  if (files.salary) {
    const rows = Object.values(await readXlsx(files.salary))[0] ?? [];
    let cur: Person | undefined, department = "";
    const unknown = new Set<string>();
    for (const r of rows) {
      if (str(r["Code"])) {
        cur = people.get(str(r["Code"]));
        department = str(r["Department"]);
        if (!cur) unknown.add(str(r["Code"]));
      }
      const m = str(r["Month"]).match(/^([A-Za-z]{3})[a-z]*[ ,]+(?:\d{1,2}, )?(\d{4})$/);
      if (!cur || !m || num(r["Net Pay"]) === 0 && num(r["Total Earnings"]) === 0) continue;
      const line = (kind: string) => ([label, source]: [string, string]) => ({ kind, label, amount: num(r[label]), source });
      slips.push({
        code: cur.code, month: `${m[2]}-${String(MONTHS.indexOf(m[1]!.toLowerCase()) + 1).padStart(2, "0")}`, designation: cur.designation, department,
        gross: num(r["Actual Salary"]) || num(r["Total Earnings"]), earnings: num(r["Total Earnings"]), deductions: num(r["Total Deductions"]), tax: num(r["Tax"]), net: num(r["Net Pay"]), days: num(r["Days"]),
        lines: [...EARN.map(line("earning")), ...DEDUCT.map(line("deduction"))].filter((l) => l.amount !== 0),
      });
    }
    if (unknown.size) warnings.push(`${unknown.size} code(s) in the salary sheet aren't in the employee file, and were skipped: ${[...unknown].join(", ")}`);
  }

  const balances: Bal[] = [];
  if (files.leave) {
    // Merged cells: the code is only on each person's first row.
    let code = "";
    for (const r of Object.values(await readXlsx(files.leave))[0] ?? []) {
      code = str(r["Employee Code"]) || code;
      if (people.has(code) && /leave/i.test(str(r["Leave Type"]))) balances.push({ code, type: str(r["Leave Type"]), opening: num(r["Opening Balances"]), additional: num(r["Additional Quota"]), available: num(r["Available"]) });
    }
  }

  let probation = 0;
  if (files.probation) {
    for (const r of Object.values(await readXlsx(files.probation))[0] ?? []) {
      const p = people.get(str(r["Employee Code"]));
      if (!p) continue;
      p.probation = { start: parseDate(r["Probation Start Date"]), end: parseDate(r["Probation End Date"]), score: str(r["Total Score"]), salary: num(r["Salary"]) };
      if (!p.gross) p.gross = p.probation.salary;
      probation++;
    }
  }

  // Logins: official email, falling back to the one on their contact details. Each address only once.
  const seen = new Set<string>();
  const roles: Record<string, number> = {};
  let logins = 0;
  for (const p of people.values()) {
    p.role = roleFor(p.designation, p.department);
    roles[p.role] = (roles[p.role] ?? 0) + 1;
    const email = validEmail(p.email) ? p.email : validEmail(p.contactEmail) ? p.contactEmail : "";
    if (!email) warnings.push(`${p.name} (${p.code}) has no usable email, so no login will be created. Add it on their profile later.`);
    else if (seen.has(email)) warnings.push(`${p.name} (${p.code}) shares the email ${email} with someone else, so no login will be created.`);
    else { seen.add(email); p.email = email; logins++; continue; }
    p.email = "";
  }
  for (const p of people.values()) {
    if (!p.joining) warnings.push(`${p.name} (${p.code}) has no joining date; today's date will be used.`);
    if (!p.gross) warnings.push(`${p.name} (${p.code}) has no salary in the files.`);
  }

  const list = [...people.values()];
  const times = days.map((d) => +d.date);
  return {
    parsed: { people: list, days, slips, balances },
    preview: {
      employees: list.length, logins, salaries: list.filter((p) => p.gross).length, attendanceDays: days.length,
      attendanceRange: times.length ? `${format(Math.min(...times), "d MMM yyyy")} – ${format(Math.max(...times), "d MMM yyyy")}` : "—",
      payslips: slips.length, payMonths: new Set(slips.map((s) => s.month)).size, balances: balances.length, probation, roles, warnings,
    },
  };
}

const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * Adds the parsed data to AMS. Nothing is deleted: employees already in AMS (same code, or same official email) keep
 * what's there and only get their empty fields filled; new people are created; attendance days, punches, leave days
 * and payslips that already exist are skipped, so running it twice adds nothing twice.
 */
export async function addHrData(p: ParsedHr, actor: { id: string; email: string }) {
  const [rolesRows, branches] = await Promise.all([db.role.findMany(), db.branch.findMany()]);
  const roleId = (name: string) => (name === "Boss" ? rolesRows.find((r) => r.key === "boss") : rolesRows.find((r) => r.name === name))?.id;
  const branchId = (name: string) => branches.find((b) => (/bahad/i.test(name) && b.code === "BHD") || (/dha/i.test(name) && b.code === "DHA") || b.name.toLowerCase() === name.toLowerCase())?.id ?? null;
  // Nobody knows this password: staff set their own from the welcome email.
  const passwordHash = await hashPassword(randomBytes(24).toString("base64url"));

  const ids = new Map<string, string>();
  let created = 0, updated = 0, logins = 0;
  for (const e of p.people) {
    const joiningDate = e.joining ?? new Date();
    const [department, designation, shift] = await Promise.all([
      e.department ? db.department.upsert({ where: { name: e.department }, update: {}, create: { name: e.department } }) : null,
      e.designation ? db.designation.upsert({ where: { name: e.designation }, update: {}, create: { name: e.designation } }) : null,
      e.shift ? db.shift.upsert({ where: { name: `${e.shift.start}–${e.shift.end}` }, update: {}, create: { name: `${e.shift.start}–${e.shift.end}`, start: e.shift.start, end: e.shift.end } }) : null,
    ]);
    // Login: reuse an existing account with this email, otherwise create one.
    let userId: string | null = null;
    if (e.email) {
      const existingUser = await db.user.findUnique({ where: { email: e.email }, select: { id: true } });
      if (existingUser) userId = existingUser.id;
      else {
        const role = roleId(e.role);
        userId = (await db.user.create({ data: { name: e.name, email: e.email, phone: e.phone || null, title: e.designation || null, branchId: branchId(e.branch), passwordHash, roles: role ? { create: { roleId: role } } : undefined } })).id;
        logins++;
      }
    }
    const fields: Record<string, unknown> = {
      fullName: e.name, firstName: e.first || null, middleName: e.middle || null, lastName: e.last || null, fatherName: e.father || null, motherName: e.mother || null,
      gender: e.gender, dob: e.dob, maritalStatus: e.marital || null, religion: e.religion || null, nationality: e.nationality || null, bloodGroup: e.blood || null,
      phone: e.phone || null, landline: e.landline || null, personalEmail: e.contactEmail || null, officialEmail: e.email || null, address: e.address || null, permanentAddress: e.permanent || null, city: e.city || null,
      cnic: e.cnic || null, cnicExpiry: e.cnicExpiry, passportNo: e.passport || null, passportExpiry: e.passportExpiry, licenseNo: e.license || null, licenseExpiry: e.licenseExpiry,
      emergencyName: e.emergencyName || null, emergencyRelation: e.emergencyRelation || null, emergencyPhone: e.emergencyPhone || null,
      ntn: e.ntn || null, bankName: e.bank || null, grade: e.grade || null, jobTitle: e.designation || null,
      departmentId: department?.id ?? null, designationId: designation?.id ?? null, branchId: branchId(e.branch), shiftId: shift?.id ?? null,
    };
    const existing = await db.employee.findFirst({ where: { OR: [{ code: e.code }, ...(e.email ? [{ officialEmail: e.email }, { userId: userId ?? "-" }] : [])] }, include: { salary: true } });
    if (existing) {
      // Fill blanks only: anything already typed into AMS wins.
      const cur = existing as unknown as Record<string, unknown>;
      const fill = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v != null && (cur[k] == null || cur[k] === "")));
      if (!existing.userId && userId && !(await db.employee.findUnique({ where: { userId } }))) fill.userId = userId;
      if (Object.keys(fill).length) await db.employee.update({ where: { id: existing.id }, data: fill as never });
      if (!existing.salary && e.gross > 0) await db.salaryProfile.create({ data: { employeeId: existing.id, gross: e.gross, effectiveFrom: existing.joiningDate, ...(e.paymentMethod && { paymentMethod: e.paymentMethod }) } });
      ids.set(e.code, existing.id);
      updated++;
      continue;
    }
    const linkUser = userId && !(await db.employee.findUnique({ where: { userId } })) ? userId : null;
    const emp = await db.employee.create({
      data: {
        ...(fields as object), code: e.code, userId: linkUser, joiningDate,
        status: e.probation ? "probation" : "active", probationEnd: e.probation?.end ?? null, confirmedAt: e.probation ? null : joiningDate,
        events: { create: [
          { type: "joined", date: joiningDate, title: `Joined${e.designation ? ` as ${e.designation}` : ""}`, byId: actor.id },
          ...e.history.map((h) => ({ type: "note", date: h.date, title: h.title, details: h.details || null, byId: actor.id })),
          ...(e.probation?.score ? [{ type: "note", date: e.probation.start ?? joiningDate, title: `Probation score ${e.probation.score}`, byId: actor.id }] : []),
        ] },
        ...(e.qualifications.length && { qualifications: { create: e.qualifications } }),
        ...(e.gross > 0 && { salary: { create: { gross: e.gross, effectiveFrom: joiningDate, ...(e.paymentMethod && { paymentMethod: e.paymentMethod }), ...(e.probation?.salary && { probationGross: e.probation.salary }) } } }),
      } as never,
    });
    ids.set(e.code, emp.id);
    created++;
  }

  // Attendance: the report's own status for each day, plus the punches behind it. Days already in AMS are skipped.
  const empIds = [...new Set(ids.values())];
  const [haveDays, havePunches] = await Promise.all([
    db.attendanceDay.findMany({ where: { employeeId: { in: empIds } }, select: { employeeId: true, date: true } }),
    db.attendancePunch.findMany({ where: { employeeId: { in: empIds } }, select: { employeeId: true, at: true } }),
  ]);
  const seenDay = new Set(haveDays.map((d) => `${d.employeeId}|${+d.date}`));
  const seenPunch = new Set(havePunches.map((x) => `${x.employeeId}|${+x.at}`));
  const at = (date: Date, min: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, min);
  const punches: { employeeId: string; at: Date; source: string }[] = [];
  const dayRows: { employeeId: string; date: Date; status: string; note: string | null; checkIn: Date | null; checkOut: Date | null; workedMin: number; lateMin: number; earlyMin: number; overtimeMin: number }[] = [];
  for (const d of p.days) {
    const employeeId = ids.get(d.code);
    if (!employeeId) continue;
    const dayKey = `${employeeId}|${+d.date}`;
    if (seenDay.has(dayKey)) continue;
    seenDay.add(dayKey);
    const checkIn = d.inMin !== null ? at(d.date, d.inMin) : null;
    const checkOut = d.outMin !== null ? at(d.date, d.outMin + (d.inMin !== null && d.outMin < d.inMin ? 1440 : 0)) : null;
    // A check-out past midnight stays on the day's own record: as a raw punch it would read as the next day's check-in.
    const sameDay = d.outMin !== null && d.inMin !== null && d.outMin >= d.inMin;
    for (const t of [checkIn, sameDay ? checkOut : null]) {
      if (t && !seenPunch.has(`${employeeId}|${+t}`)) { seenPunch.add(`${employeeId}|${+t}`); punches.push({ employeeId, at: t, source: "import" }); }
    }
    dayRows.push({ employeeId, date: d.date, status: d.status, note: d.note, checkIn, checkOut, workedMin: d.workedMin, lateMin: d.lateMin, earlyMin: d.earlyMin, overtimeMin: d.overtimeMin });
  }
  for (const c of chunks(punches, 500)) await db.attendancePunch.createMany({ data: c });
  for (const c of chunks(dayRows, 500)) await db.attendanceDay.createMany({ data: c });

  // Leave: the old system's two types are added if missing (existing leave types are left as they are).
  const quota = (type: string) => Math.max(0, ...p.balances.filter((b) => b.type === type).map((b) => b.opening + b.additional));
  const leaveTypes = new Map<string, string>();
  for (const [i, [name, code, color]] of ([["Annual Paid Leaves", "APL", "blue"], ["Sick Leaves", "SL", "amber"]] as const).entries()) {
    const t = await db.leaveType.upsert({ where: { name }, update: {}, create: { name, code, color, paid: true, quota: quota(name), sortOrder: 10 + i } });
    leaveTypes.set(name, t.id);
  }
  const haveLeave = new Set((await db.leaveRequest.findMany({ where: { employeeId: { in: empIds } }, select: { employeeId: true, from: true } })).map((l) => `${l.employeeId}|${+l.from}`));
  const requests = p.days.filter((d) => d.leaveType && ids.get(d.code) && !haveLeave.has(`${ids.get(d.code)}|${+d.date}`))
    .map((d) => ({ employeeId: ids.get(d.code)!, typeId: leaveTypes.get(d.leaveType!)!, from: d.date, to: d.date, halfDay: d.halfDay, days: d.halfDay ? 0.5 : 1, status: "approved", decidedAt: d.date, reason: "Imported from previous system" }));
  for (const c of chunks(requests, 500)) await db.leaveRequest.createMany({ data: c });
  // Match the balances the old system reported.
  const year = new Date().getFullYear();
  for (const code of new Set(p.balances.map((b) => b.code))) {
    const employeeId = ids.get(code);
    if (!employeeId) continue;
    const current = await balancesFor(employeeId, year);
    for (const b of p.balances.filter((x) => x.code === code)) {
      const typeId = leaveTypes.get(b.type);
      const have = current.find((c) => c.type.id === typeId);
      if (!typeId || !have) continue;
      const adjusted = b.available - have.available;
      await db.leaveBalance.upsert({ where: { employeeId_typeId_year: { employeeId, typeId, year } }, update: { adjusted, note: "Imported balance" }, create: { employeeId, typeId, year, adjusted, note: "Imported balance" } });
    }
  }

  // Past payroll, as paid runs; months or payslips already in AMS are kept and not duplicated.
  const months = [...new Set(p.slips.map((s) => s.month))].sort();
  let payslips = 0;
  for (const month of months) {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const paidAt = new Date(y, m, 0);
    const run = (await db.payrollRun.findUnique({ where: { month } })) ?? (await db.payrollRun.create({ data: { month, status: "paid", createdById: actor.id, approvedById: actor.id, approvedAt: paidAt, paidAt } }));
    const already = new Set((await db.payslip.findMany({ where: { runId: run.id }, select: { employeeId: true } })).map((x) => x.employeeId));
    for (const s of p.slips.filter((x) => x.month === month)) {
      const employeeId = ids.get(s.code);
      if (!employeeId || already.has(employeeId)) continue;
      const daysInMonth = getDaysInMonth(paidAt);
      await db.payslip.create({
        data: {
          runId: run.id, employeeId, gross: s.gross, earnings: s.earnings, deductions: s.deductions, tax: s.tax, net: s.net, daysInMonth, employedDays: Math.min(s.days || daysInMonth, daysInMonth),
          designation: s.designation || null, department: s.department || null,
          lines: { create: s.lines.map((l, i) => ({ ...l, sortOrder: i })) },
        },
      });
      payslips++;
    }
  }

  await audit(actor.id, "create", "employee", null, `Added HR data from Excel: ${created} new and ${updated} existing employees, ${dayRows.length} attendance days, ${payslips} payslips`);
  return { created, updated, logins, attendanceDays: dayRows.length, punches: punches.length, leaveDays: requests.length, payslips, payMonths: months.length };
}

/** Welcome emails for everyone who has never signed in. */
export async function sendWelcomeToAll(actorId: string) {
  const users = await db.user.findMany({ where: { active: true, lastLoginAt: null, id: { not: actorId } }, select: { id: true, name: true, email: true } });
  let sent = 0;
  const failed: string[] = [];
  for (const u of users) {
    if ((await sendLoginEmail(u, actorId)).status === "sent") sent++;
    else failed.push(u.email);
  }
  await audit(actorId, "update", "user", null, `Sent welcome emails: ${sent} sent, ${failed.length} failed`);
  return { sent, failed };
}
