// Employees never change their own record directly: every change (details, photo, relatives, qualifications) is
// queued as one "Profile update" request for HR. Sending more while one is waiting adds to the same request.
import { db } from "@/lib/db";
import { submitRequest } from "@/lib/approvals";
import { profileSection, type ProfileField } from "@/lib/profile-fields";
import { SELF_EDITABLE } from "@/lib/hr-shared";

/** Sections an employee may ask to change (job, salary and banks stay with HR). */
export const SELF_SECTIONS = ["personal", "quick", "addresses", "contacts", "cnic", "passport", "license"] as const;

export function selfFields(): ProfileField[] {
  return SELF_SECTIONS.flatMap((k) => profileSection(k)?.fields ?? []).filter((f) => !f.readOnly && f.key !== "officialEmail");
}
export const SELF_KEYS = () => new Set<string>([...selfFields().map((f) => f.key), ...SELF_EDITABLE.map((f) => f.key)]);

export type ProfilePayload = {
  changes?: Record<string, string | null>;
  /** Uploaded, not yet applied: becomes the photo when HR approves. */
  photo?: string;
  relatives?: { name: string; relation: string; dob?: string | null; cnic?: string | null; phone?: string | null; dependent?: boolean; emergency?: boolean }[];
  qualifications?: { kind: string; title: string; institution?: string | null; from?: string | null; to?: string | null; grade?: string | null; notes?: string | null }[];
};

export async function queueProfileChange(emp: { id: string; fullName: string }, requesterId: string, add: ProfilePayload, what: string) {
  const pending = await db.approvalRequest.findFirst({ where: { employeeId: emp.id, type: "profile_update", status: "pending" } });
  if (pending) {
    let cur: ProfilePayload = {};
    try { cur = JSON.parse(pending.payload) as ProfilePayload; } catch { /* start over */ }
    const next: ProfilePayload = {
      changes: { ...(cur.changes ?? {}), ...(add.changes ?? {}) },
      photo: add.photo ?? cur.photo,
      relatives: [...(cur.relatives ?? []), ...(add.relatives ?? [])],
      qualifications: [...(cur.qualifications ?? []), ...(add.qualifications ?? [])],
    };
    await db.approvalRequest.update({ where: { id: pending.id }, data: { payload: JSON.stringify(next), summary: describe(next) } });
    return { merged: true };
  }
  await submitRequest({ type: "profile_update", employeeId: emp.id, requesterId, title: `Profile update — ${emp.fullName}`, summary: describe(add) || what, payload: add });
  return { merged: false };
}

export function describe(p: ProfilePayload) {
  const parts = [
    Object.keys(p.changes ?? {}).length ? `${Object.keys(p.changes!).length} field(s)` : "",
    p.photo ? "new photo" : "",
    p.relatives?.length ? `${p.relatives.length} relative(s)` : "",
    p.qualifications?.length ? `${p.qualifications.length} qualification(s)` : "",
  ].filter(Boolean);
  return parts.join(", ");
}
