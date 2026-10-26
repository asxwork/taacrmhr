import type { PrismaClient } from "@prisma/client";
import { db as defaultDb } from "./db";

/** Next value of a named counter. Atomic increment, so two requests never get the same number and deletes never free one up. */
export async function nextNumber(name: string, client: Pick<PrismaClient, "sequence"> = defaultDb) {
  const row = await client.sequence.upsert({ where: { name }, update: { value: { increment: 1 } }, create: { name, value: 1 } });
  return row.value;
}
