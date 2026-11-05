// Restores an AMS backup (ams-database-*.json.gz from Google Drive) into the database in DATABASE_URL.
// EVERYTHING in that database is replaced. Usage (on the server or a laptop):
//   1. npx prisma db push            (makes sure every table exists)
//   2. npx tsx scripts/restore-backup.ts ams-database-2026-11-05_0200.json.gz --yes
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Prisma, PrismaClient } from "@prisma/client";

const [file, confirm] = process.argv.slice(2);
if (!file || confirm !== "--yes") {
  console.error("Usage: npx tsx scripts/restore-backup.ts <backup.json.gz> --yes   (replaces ALL data in DATABASE_URL)");
  process.exit(1);
}
const mysql = (process.env.DATABASE_URL ?? "").startsWith("mysql");
const db = new PrismaClient();

(async () => {
  const dump = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as { version: number; createdAt: string; models: Record<string, Record<string, unknown>[]> };
  console.log(`Backup from ${dump.createdAt}`);
  const models = Prisma.dmmf.datamodel.models;
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(mysql ? "SET FOREIGN_KEY_CHECKS=0" : "PRAGMA defer_foreign_keys = ON");
    const t = tx as unknown as Record<string, { deleteMany: () => Promise<unknown>; createMany: (a: { data: object[] }) => Promise<unknown> }>;
    const name = (m: string) => m[0]!.toLowerCase() + m.slice(1);
    for (const m of models) await t[name(m.name)]!.deleteMany();
    for (const m of models) {
      const rows = dump.models[m.name] ?? [];
      const dates = m.fields.filter((f) => f.type === "DateTime").map((f) => f.name);
      const scalars = new Set(m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name));
      const clean = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => scalars.has(k)).map(([k, v]) => [k, dates.includes(k) && typeof v === "string" ? new Date(v) : v])));
      for (let i = 0; i < clean.length; i += 1000) await t[name(m.name)]!.createMany({ data: clean.slice(i, i + 1000) });
      if (clean.length) console.log(`${m.name}: ${clean.length}`);
    }
    if (mysql) await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
  }, { timeout: 30 * 60_000, maxWait: 60_000 });
  console.log("Restore complete.");
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
