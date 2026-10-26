// Seeds configuration (branches, roles, lists, pipelines, shifts, holidays, leave types) and, unless
// SEED_DEMO=false, demo users and sample data. Safe to re-run on every deploy: it only fills blanks.
// Production: set SEED_DEMO=false plus ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME to create the first admin.
// Demo logins (local/dev only — change or delete before go-live). All use the password below.
//   admin@advisor.local     Super Admin
//   hr@advisor.local        HR Manager
//   manager@advisor.local   Sales Manager (DHA)
//   agent1@advisor.local    Agent (DHA, reports to manager)
//   agent2@advisor.local    Agent (Bahadurabad, reports to manager)
//   staff@advisor.local     Employee (self-service only)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLES, MODULES, expandGrants } from "../src/lib/rbac";
import { randomBytes } from "node:crypto";
import { demoLoaded, loadDemo, upgradeDemo } from "../src/lib/demo-data";
import { nextNumber } from "../src/lib/sequence";
import { seedAttendance, seedHr, seedPayroll } from "./seed-hr";

const DEMO_PASSWORD = "Advisor@2026";
const DEMO = process.env.SEED_DEMO?.trim().toLowerCase() !== "false";
const db = new PrismaClient();

async function main() {
  const [dha] = await Promise.all([
    db.branch.upsert({ where: { code: "DHA" }, update: {}, create: { name: "DHA", code: "DHA", address: "DHA, Karachi" } }),
    db.branch.upsert({ where: { code: "BHD" }, update: {}, create: { name: "Bahadurabad", code: "BHD", address: "Bahadurabad, Karachi" } }),
  ]);

  for (const tpl of DEFAULT_ROLES) {
    await db.role.upsert({
      where: { name: tpl.name },
      update: {},
      create: {
        name: tpl.name,
        description: tpl.description,
        isSystem: true,
        permissions: { create: expandGrants(tpl.grants) },
      },
    });
  }

  // Boss: one person, can read (and export) everything, changes nothing. Found by key so it can be renamed.
  if (!(await db.role.findFirst({ where: { key: "boss" } }))) {
    const grants = Object.fromEntries(MODULES.map((m) => [m.key, Object.fromEntries(m.actions.filter((a) => a === "view" || a === "export").map((a) => [a, "all"]))]));
    await db.role.create({ data: {
      name: (await db.role.findUnique({ where: { name: "Boss" } })) ? "Boss (owner)" : "Boss", key: "boss", maxUsers: 1, isSystem: true,
      description: "The owner's view: every CRM and HR number, read-only. Only one person can have it.",
      permissions: { create: expandGrants(grants) },
    } });
  }

  const sources = ["Facebook", "Instagram", "Website", "Zameen", "Graana", "WhatsApp", "CC", "Direct", "Referral"];
  for (const [i, name] of sources.entries()) {
    await db.leadSource.upsert({ where: { name }, update: {}, create: { name, sortOrder: i } });
  }

  await db.setting.upsert({ where: { key: "company.name" }, update: {}, create: { key: "company.name", value: "The Advisor Associates" } });
  await db.setting.upsert({ where: { key: "company.currency" }, update: {}, create: { key: "company.currency", value: "PKR" } });

  // First real admin from env (created once; later deploys never touch the password).
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmail && process.env.ADMIN_PASSWORD && !(await db.user.findUnique({ where: { email: adminEmail } }))) {
    if (process.env.ADMIN_PASSWORD.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
    await db.user.create({ data: { email: adminEmail, name: process.env.ADMIN_NAME || "Administrator", passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10), isSuperAdmin: true, branchId: dha.id } });
    console.log(`Created admin ${adminEmail}`);
  }

  await seedCrm();
  await numberLeads();
  await seedInventory();
  await seedHr(db);
  await seedAttendance(db);
  await seedPayroll(db);
  await upgradeDemo(db); // sample data from an older version gets the newer sections
  if (!DEMO) {
    // Live: load the sample data once so the app can be tried out. Settings → Company → "Remove sample data"
    // deletes it, and the flag stops later deploys from adding it back.
    if (!(await db.setting.findUnique({ where: { key: "demo.autoloaded" } })) && !(await demoLoaded(db))) {
      const res = await loadDemo(db, { passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 10), domain: "demo.local", withSuperAdmin: false, codePrefix: "DEMO-" });
      await db.setting.create({ data: { key: "demo.autoloaded", value: new Date().toISOString() } });
      console.log("error" in res ? `Sample data skipped: ${res.error}` : "Loaded sample data (remove it in Settings → Company & Branches).");
    }
    console.log("Seed complete (configuration only).");
    return;
  }

  // Demo data once, on a fresh local database.
  if (!(await db.user.findUnique({ where: { email: "admin@advisor.local" } }))) {
    await loadDemo(db, { passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10), domain: "advisor.local", withSuperAdmin: true, codePrefix: "TAA-" });
  }
  console.log("Seed complete.");
}

/** Gives every lead without a number one, oldest first, continuing the counter. */
async function numberLeads() {
  const missing = await db.lead.findMany({ where: { number: null }, select: { id: true }, orderBy: { createdAt: "asc" } });
  for (const l of missing) await db.lead.update({ where: { id: l.id }, data: { number: await nextNumber("lead", db) } });
  if (missing.length) console.log(`Numbered ${missing.length} lead(s).`);
}

/**
 * One-time move to the Bitrix-style lead stages (2026-10). Renames keep every lead on its stage; Qualified leads
 * move to In Progress and Qualified is removed. Guarded by a setting so admins' later edits are never touched.
 */
async function migrateLeadStages() {
  if (await db.setting.findUnique({ where: { key: "crm.leadStages.v2" } })) return;
  const rename = async (from: string, to: string) => {
    const old = await db.leadStatus.findUnique({ where: { name: from } });
    if (old && !(await db.leadStatus.findUnique({ where: { name: to } }))) await db.leadStatus.update({ where: { id: old.id }, data: { name: to } });
  };
  await rename("New", "New Request");
  await rename("Contacted", "In Progress");
  await rename("Converted", "Complete lead");
  await rename("Junk", "Not Valid");
  const qualified = await db.leadStatus.findUnique({ where: { name: "Qualified" } });
  const inProgress = await db.leadStatus.findUnique({ where: { name: "In Progress" } });
  if (qualified && inProgress) {
    const moved = await db.lead.updateMany({ where: { statusId: qualified.id }, data: { statusId: inProgress.id } });
    await db.leadStatus.delete({ where: { id: qualified.id } });
    console.log(`Lead stages: moved ${moved.count} Qualified lead(s) to In Progress.`);
  }
  await db.setting.create({ data: { key: "crm.leadStages.v2", value: new Date().toISOString() } });
}

/**
 * On-hold rules (lib/lead-hold.ts): tags the New Request / On-hold stages, creates the "Demo User" that held
 * leads go to, and once starts every existing lead's clock now, so the first deploy doesn't put old leads on hold.
 */
async function seedHoldRules() {
  for (const [name, key] of [["New Request", "new"], ["On-hold", "onhold"]] as const) {
    if (await db.leadStatus.findFirst({ where: { systemKey: key } })) continue;
    const st = await db.leadStatus.findUnique({ where: { name } });
    if (st) await db.leadStatus.update({ where: { id: st.id }, data: { systemKey: key, kind: "open", active: true } });
  }
  if (!(await db.setting.findUnique({ where: { key: "crm.hold.userId" } }))) {
    const email = "demo.user@hold.local";
    const demo = (await db.user.findUnique({ where: { email } }))
      ?? (await db.user.create({ data: { email, name: "Demo User", title: "Holds unassigned leads", passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 10) } }));
    await db.setting.create({ data: { key: "crm.hold.userId", value: demo.id } });
  }
  if (!(await db.setting.findUnique({ where: { key: "crm.hold.v1" } }))) {
    const now = new Date();
    await db.lead.updateMany({ where: { assignedAt: null }, data: { assignedAt: now } });
    await db.lead.updateMany({ where: { statusChangedAt: null }, data: { statusChangedAt: now } });
    await db.setting.create({ data: { key: "crm.hold.v1", value: now.toISOString() } });
  }
}

async function seedCrm() {
  await migrateLeadStages();
  const statuses = [
    ["New Request", "blue", "open"],
    ["In Progress", "violet", "open"],
    ["Not Answered", "amber", "open"],
    ["Site Visit", "teal", "open"],
    ["On-hold", "slate", "open"],
    ["Finalizing", "gold", "open"],
    ["Complete lead", "green", "converted"],
    ["Not Interested", "red", "junk"],
    ["Not Valid", "slate", "junk"],
  ] as const;
  // Creates missing stages. Order and colour are only set the first time (the migration run), never over admin edits.
  const firstRun = !(await db.setting.findUnique({ where: { key: "crm.leadStages.ordered" } }));
  for (const [i, [name, color, kind]] of statuses.entries()) {
    await db.leadStatus.upsert({ where: { name }, update: firstRun ? { sortOrder: i, color } : {}, create: { name, color, kind, sortOrder: i } });
  }
  if (firstRun) await db.setting.create({ data: { key: "crm.leadStages.ordered", value: new Date().toISOString() } });
  await seedHoldRules();

  // The Reshuffle automation (once; admins can edit or add more in CRM → Automations).
  if (!(await db.automation.count())) {
    const fresh = await db.leadStatus.findUnique({ where: { name: "New Request" } });
    await db.automation.create({ data: {
      name: "Reshuffle: new agent + New Request",
      config: JSON.stringify({ assign: "roundrobin", userIds: [], avoidSameAgent: true, stageId: fresh?.id ?? null, deleteOpen: true, deleteHistory: true, markReshuffled: true, planCall: true }),
    } });
  }

  const pipelines = [
    { name: "Sales", isDefault: true, stages: [["New", "blue", "open", 10], ["Negotiation", "violet", "open", 30], ["Token / Booking", "amber", "open", 60], ["Agreement", "teal", "open", 80], ["Payment Plan", "gold", "open", 90], ["Won", "green", "won", 100], ["Lost", "red", "lost", 0]] },
    { name: "Rentals", isDefault: false, stages: [["New", "blue", "open", 10], ["Viewing", "violet", "open", 40], ["Negotiation", "amber", "open", 70], ["Won", "green", "won", 100], ["Lost", "red", "lost", 0]] },
  ] as const;
  for (const [i, p] of pipelines.entries()) {
    if (await db.pipeline.findUnique({ where: { name: p.name } })) continue;
    await db.pipeline.create({
      data: {
        name: p.name,
        isDefault: p.isDefault,
        sortOrder: i,
        stages: { create: p.stages.map(([name, color, kind, probability], j) => ({ name, color, kind, probability, sortOrder: j })) },
      },
    });
  }

}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

async function seedInventory() {
  // Which unit status each deal stage applies (only fills blanks, so admin edits survive re-seeding).
  const mapping: [string, string, string][] = [
    ["Sales", "Token / Booking", "booked"], ["Sales", "Agreement", "booked"], ["Sales", "Payment Plan", "booked"], ["Sales", "Won", "sold"],
    ["Rentals", "Negotiation", "hold"], ["Rentals", "Won", "rented"],
  ];
  for (const [pipeline, stage, unitStatus] of mapping) {
    await db.stage.updateMany({ where: { name: stage, pipeline: { name: pipeline }, unitStatus: null }, data: { unitStatus } });
  }
}
