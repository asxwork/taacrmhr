import { db } from "./db";

export async function audit(userId: string | null, action: string, entity: string, entityId: string | null, summary: string) {
  await db.auditLog.create({ data: { userId, action, entity, entityId, summary } });
}
