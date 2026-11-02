// Resolves field rules for a user: the most open mode among their roles (no rule = full); Super Admins see all.
import { db } from "./db";
import { memo } from "./memo";
import type { SessionUser } from "./auth";
import { FIELD_DEFS, FULL_ACCESS, moreOpen, type FieldAccess, type FieldMode } from "./field-defs";

export function fieldAccess(user: SessionUser): Promise<FieldAccess> {
  if (user.isSuperAdmin) return Promise.resolve(FULL_ACCESS);
  return memo(`session:fields:${user.id}`, 60_000, async () => {
    const roles = await db.userRole.findMany({ where: { userId: user.id }, select: { role: { select: { fieldRules: true } } } });
    if (!roles.length) return FULL_ACCESS;
    const out = {} as FieldAccess;
    for (const f of FIELD_DEFS) {
      // Each role's mode for this field (no row = full); the user gets the most open.
      out[f.key] = roles.map(({ role }) => (role.fieldRules.find((r) => r.field === f.key)?.mode as FieldMode) ?? "full").reduce(moreOpen);
    }
    return out;
  });
}
