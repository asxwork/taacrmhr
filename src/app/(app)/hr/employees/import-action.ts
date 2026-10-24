"use server";

import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { addEvent, getSetting, nextEmployeeCode, syncUserFromEmployee } from "@/lib/hr";
import type { FormState } from "@/lib/utils";

// Column names accepted for each field (case-insensitive). Covers our template and common ResourceInn/Excel exports.
const COLS: Record<string, string[]> = {
  code: ["employee code", "emp code", "employee id", "emp id", "code", "emp no", "employee no"],
  fullName: ["full name", "employee name", "name"],
  fatherName: ["father name", "father/husband name", "father's name", "husband name"],
  gender: ["gender", "sex"],
  dob: ["date of birth", "dob", "birth date"],
  cnic: ["cnic", "cnic no", "nic", "national id"],
  phone: ["phone", "mobile", "mobile no", "contact", "contact no", "cell"],
  personalEmail: ["personal email", "email", "e-mail"],
  address: ["address", "current address", "residential address"],
  city: ["city"],
  branch: ["branch", "location", "office"],
  department: ["department", "dept"],
  designation: ["designation", "job title", "title", "position"],
  manager: ["reports to", "manager", "reporting manager", "line manager", "supervisor"],
  joiningDate: ["joining date", "date of joining", "doj", "join date", "hire date"],
  employmentType: ["employment type", "type", "job type"],
  status: ["status", "employee status"],
  gross: ["gross salary", "gross", "salary", "monthly salary"],
  bankName: ["bank", "bank name"],
  accountTitle: ["account title", "a/c title"],
  accountNumber: ["account number", "account no", "iban", "a/c no"],
  deviceUserId: ["device id", "biometric id", "machine id", "enroll no", "ac-no"],
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** 2024-01-15, 15/01/2024, 15-01-2024, 15-Jan-2024, 15 Jan 2024. Day-first when ambiguous (Pakistan). */
function parseDate(v: string) {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{2,4})$/);
  if (m) {
    const mo = MONTHS.indexOf(m[2]!.toLowerCase());
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return mo >= 0 ? new Date(y, mo, Number(m[1])) : null;
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  return null;
}

/** Bulk-creates employees from a CSV. Existing people (same code or CNIC) are skipped, never overwritten. */
export async function importEmployees(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSuperAdmin && scopeFor(user, "hr.employees", "create") !== "all") return { error: "Only HR with company-wide access can import employees." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 5_000_000) return { error: "File is larger than 5 MB." };

  const parsed = Papa.parse<Record<string, string>>((await file.text()).replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  const headers = parsed.meta.fields ?? [];
  const col = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, headers.find((h) => names.includes(h))]));
  if (!col.fullName) return { error: "The file needs a “Full Name” (or “Name”) column. Download the template to see the expected columns." };
  const rows = parsed.data.slice(0, 2000);

  const [branches, depts, desigs, existing] = await Promise.all([
    db.branch.findMany(), db.department.findMany(), db.designation.findMany(),
    db.employee.findMany({ select: { code: true, cnic: true, deviceUserId: true } }),
  ]);
  const codes = new Set(existing.map((e) => e.code.toLowerCase()));
  const cnics = new Set(existing.map((e) => e.cnic?.replace(/\D/g, "")).filter(Boolean));
  const devices = new Set(existing.map((e) => e.deviceUserId).filter(Boolean));
  const probationMonths = Number(await getSetting("hr.probationMonths", "3")) || 0;

  const findOrCreate = async <T extends { id: string; name: string }>(list: T[], name: string, create: (n: string) => Promise<T>) => {
    if (!name) return null;
    const hit = list.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit.id;
    const made = await create(name);
    list.push(made);
    return made.id;
  };

  let created = 0;
  const skipped: string[] = [];
  const managerLinks: { id: string; manager: string }[] = [];
  for (const [i, r] of rows.entries()) {
    const get = (k: string) => (col[k] ? (r[col[k]!] ?? "").trim() : "");
    const fullName = get("fullName");
    if (!fullName) { skipped.push(`row ${i + 2}: no name`); continue; }
    const code = get("code");
    const cnic = get("cnic");
    if ((code && codes.has(code.toLowerCase())) || (cnic && cnics.has(cnic.replace(/\D/g, "")))) { skipped.push(`${fullName} (already exists)`); continue; }

    const joiningDate = parseDate(get("joiningDate")) ?? new Date();
    const status = ["active", "probation", "notice", "left"].includes(get("status").toLowerCase()) ? get("status").toLowerCase() : "active";
    const branch = get("branch").toLowerCase();
    const device = get("deviceUserId").replace(/\D/g, "");
    const emp = await db.employee.create({
      data: {
        code: code || (await nextEmployeeCode()), fullName, fatherName: get("fatherName") || null,
        gender: ["male", "female"].includes(get("gender").toLowerCase()) ? get("gender").toLowerCase() : null,
        dob: parseDate(get("dob")), cnic: cnic || null, phone: get("phone") || null, personalEmail: get("personalEmail").toLowerCase() || null,
        address: get("address") || null, city: get("city") || "Karachi",
        branchId: branches.find((b) => b.name.toLowerCase() === branch || b.code.toLowerCase() === branch)?.id ?? null,
        departmentId: await findOrCreate(depts, get("department"), (name) => db.department.create({ data: { name } })),
        designationId: await findOrCreate(desigs, get("designation"), (name) => db.designation.create({ data: { name } })),
        joiningDate, status,
        employmentType: ["permanent", "contract", "intern", "consultant"].includes(get("employmentType").toLowerCase()) ? get("employmentType").toLowerCase() : "permanent",
        probationEnd: probationMonths ? addMonths(joiningDate, probationMonths) : null,
        confirmedAt: status === "active" ? (probationMonths ? addMonths(joiningDate, probationMonths) : joiningDate) : null,
        bankName: get("bankName") || null, accountTitle: get("accountTitle") || null, accountNumber: get("accountNumber") || null,
        deviceUserId: device && !devices.has(device) ? device : null,
      },
    });
    if (device) devices.add(device);
    codes.add(emp.code.toLowerCase());
    if (cnic) cnics.add(cnic.replace(/\D/g, ""));
    const gross = parseFloat(get("gross").replace(/[^\d.]/g, ""));
    if (gross > 0) await db.salaryProfile.create({ data: { employeeId: emp.id, gross, effectiveFrom: joiningDate } });
    await addEvent(emp.id, "joined", "Joined (imported)", { date: joiningDate, byId: user.id });
    if (get("manager")) managerLinks.push({ id: emp.id, manager: get("manager") });
    created++;
  }

  // Second pass: managers may appear later in the file. Match by name or employee code.
  let linked = 0;
  if (managerLinks.length) {
    const everyone = await db.employee.findMany({ select: { id: true, fullName: true, code: true } });
    for (const l of managerLinks) {
      const key = l.manager.toLowerCase();
      const m = everyone.find((e) => e.code.toLowerCase() === key || e.fullName.toLowerCase() === key);
      if (m && m.id !== l.id) {
        await db.employee.update({ where: { id: l.id }, data: { managerId: m.id } });
        await syncUserFromEmployee(l.id);
        linked++;
      }
    }
  }

  await audit(user.id, "create", "employee", null, `Imported ${created} employee(s) from ${file.name}`);
  revalidatePath("/hr/employees");
  const extra = skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 5).join("; ")}${skipped.length > 5 ? "…" : ""}` : "";
  return { ok: true, message: `Imported ${created} employee(s), linked ${linked} to their managers.${extra}` };
}
