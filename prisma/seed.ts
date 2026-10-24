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
import { DEFAULT_ROLES, expandGrants } from "../src/lib/rbac";
import { seedAttendance, seedHr } from "./seed-hr";

const DEMO_PASSWORD = "Advisor@2026";
const DEMO = process.env.SEED_DEMO?.trim().toLowerCase() !== "false";
const db = new PrismaClient();

async function main() {
  const [dha, bhd] = await Promise.all([
    db.branch.upsert({ where: { code: "DHA" }, update: {}, create: { name: "DHA", code: "DHA", address: "DHA, Karachi" } }),
    db.branch.upsert({ where: { code: "BHD" }, update: {}, create: { name: "Bahadurabad", code: "BHD", address: "Bahadurabad, Karachi" } }),
  ]);

  const roles: Record<string, string> = {};
  for (const tpl of DEFAULT_ROLES) {
    const role = await db.role.upsert({
      where: { name: tpl.name },
      update: {},
      create: {
        name: tpl.name,
        description: tpl.description,
        isSystem: true,
        permissions: { create: expandGrants(tpl.grants) },
      },
    });
    roles[tpl.name] = role.id;
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

  if (!DEMO) {
    await seedCrm([], false);
    await seedInventory([], false);
    await seedHr(db, false);
    await seedAttendance(db, false);
    console.log("Seed complete (configuration only).");
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const upsertUser = async (email: string, data: { name: string; title: string; branchId?: string; managerId?: string; isSuperAdmin?: boolean; role?: string }) => {
    const { role, ...rest } = data;
    return db.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash, ...rest, roles: role ? { create: { roleId: roles[role]! } } : undefined },
    });
  };

  await upsertUser("admin@advisor.local", { name: "System Admin", title: "Administrator", branchId: dha.id, isSuperAdmin: true });
  await upsertUser("hr@advisor.local", { name: "Hina Rashid", title: "HR Manager", branchId: dha.id, role: "HR Manager" });
  const manager = await upsertUser("manager@advisor.local", { name: "Saad Malik", title: "Sales Manager", branchId: dha.id, role: "Sales Manager" });
  const agent1 = await upsertUser("agent1@advisor.local", { name: "Ali Raza", title: "Property Consultant", branchId: dha.id, managerId: manager.id, role: "Agent" });
  const agent2 = await upsertUser("agent2@advisor.local", { name: "Sana Khan", title: "Property Consultant", branchId: bhd.id, managerId: manager.id, role: "Agent" });
  await upsertUser("staff@advisor.local", { name: "Usman Tariq", title: "Office Assistant", branchId: bhd.id, role: "Employee" });

  await seedCrm([agent1, agent2, manager]);
  await seedInventory([agent1, agent2]);
  await seedHr(db);
  await seedAttendance(db);
  console.log("Seed complete.");
}

async function seedCrm(owners: { id: string; branchId: string | null }[], demo = true) {
  const statuses = [
    ["New", "blue", "open"],
    ["Contacted", "violet", "open"],
    ["Qualified", "amber", "open"],
    ["Site Visit", "teal", "open"],
    ["Converted", "green", "converted"],
    ["Junk", "red", "junk"],
  ] as const;
  for (const [i, [name, color, kind]] of statuses.entries()) {
    await db.leadStatus.upsert({ where: { name }, update: {}, create: { name, color, kind, sortOrder: i } });
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

  // Demo records only on an empty CRM.
  if (!demo) return;
  if ((await db.lead.count()) > 0) return;
  const [statusRows, sources, sales] = await Promise.all([
    db.leadStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    db.leadSource.findMany(),
    db.pipeline.findUniqueOrThrow({ where: { name: "Sales" }, include: { stages: { orderBy: { sortOrder: "asc" } } } }),
  ]);
  const src = (n: string) => sources.find((s) => s.name === n)?.id;
  const names = [
    "Ahmed Siddiqui", "Fatima Noor", "Bilal Qureshi", "Ayesha Javed", "Hamza Sheikh", "Zainab Ali", "Omar Farooq", "Maryam Iqbal",
    "Faisal Mehmood", "Sara Hussain", "Imran Baig", "Nida Aslam", "Kashif Anwar", "Rabia Shah", "Tariq Jamil", "Hira Abbasi",
  ];
  const srcNames = ["Facebook", "Zameen", "CC", "Direct", "Website", "WhatsApp", "Referral", "Graana"];
  const locations = ["DHA Phase 6", "DHA Phase 8", "Bahria Town", "Clifton Block 5", "Gulshan-e-Iqbal", "PECHS"];
  const types = ["Apartment", "House", "Plot", "Shop"];

  for (const [i, name] of names.entries()) {
    const owner = owners[i % owners.length]!;
    const status = statusRows[i % 5]!;
    const phone = `0300${(1234560 + i * 7919).toString().slice(0, 7)}`;
    const budget = (i % 4 + 1) * 15_000_000;
    const lead = await db.lead.create({
      data: {
        name, phone, phoneKey: phone, email: `${name.split(" ")[0]!.toLowerCase()}@example.com`,
        sourceId: src(srcNames[i % srcNames.length]!), interest: i % 3 === 0 ? "rent" : "buy",
        propertyType: types[i % types.length], location: locations[i % locations.length],
        budgetMin: budget, budgetMax: budget * 1.3, statusId: status.id,
        ownerId: owner.id, createdById: owner.id, branchId: owner.branchId,
        createdAt: new Date(Date.now() - i * 2 * 864e5), lastActivityAt: new Date(Date.now() - i * 864e5),
      },
    });
    await db.activity.create({
      data: { type: "call", subject: "Intro call", body: "Discussed requirements and budget.", doneAt: new Date(Date.now() - i * 864e5), leadId: lead.id, ownerId: owner.id, createdById: owner.id, branchId: owner.branchId },
    });
    if (i % 3 === 0) {
      await db.activity.create({
        data: { type: "task", subject: "Follow up on shortlist", dueAt: new Date(Date.now() + ((i % 5) - 2) * 864e5), leadId: lead.id, ownerId: owner.id, createdById: owner.id, branchId: owner.branchId },
      });
    }

    if (status.kind === "converted" || i % 4 === 1) {
      const contact = await db.contact.create({
        data: { name, phone, phoneKey: phone, email: lead.email, sourceId: lead.sourceId, ownerId: owner.id, branchId: owner.branchId },
      });
      const stage = sales.stages[i % sales.stages.length]!;
      await db.deal.create({
        data: {
          title: `${lead.propertyType} — ${lead.location}`, pipelineId: sales.id, stageId: stage.id, contactId: contact.id, leadId: lead.id,
          sourceId: lead.sourceId, value: budget, commissionPct: 1, ownerId: owner.id, branchId: owner.branchId,
          expectedClose: new Date(Date.now() + (i + 5) * 864e5), closedAt: stage.kind === "open" ? null : new Date(),
          lostReason: stage.kind === "lost" ? "Budget mismatch" : null,
        },
      });
      await db.lead.update({ where: { id: lead.id }, data: { contactId: contact.id } });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

async function seedInventory(agents: { id: string; branchId: string | null }[], demo = true) {
  // Which unit status each deal stage applies (only fills blanks, so admin edits survive re-seeding).
  const mapping: [string, string, string][] = [
    ["Sales", "Token / Booking", "booked"], ["Sales", "Agreement", "booked"], ["Sales", "Payment Plan", "booked"], ["Sales", "Won", "sold"],
    ["Rentals", "Negotiation", "hold"], ["Rentals", "Won", "rented"],
  ];
  for (const [pipeline, stage, unitStatus] of mapping) {
    await db.stage.updateMany({ where: { name: stage, pipeline: { name: pipeline }, unitStatus: null }, data: { unitStatus } });
  }

  if (!demo || (await db.project.count()) > 0) return;
  const statuses = ["available", "available", "available", "booked", "available", "sold", "hold", "available"];

  const heights = await db.project.create({
    data: {
      name: "Advisor Heights", code: "AH", developer: "Advisor Developers", location: "DHA Phase 8", kind: "residential", status: "active",
      description: "Luxury apartments with sea-facing towers.", planDownPct: 25, planInstallments: 36, planFrequency: "monthly", planPossessionPct: 10,
      blocks: { create: [{ name: "Tower A", sortOrder: 0 }, { name: "Tower B", sortOrder: 1 }] },
    },
    include: { blocks: true },
  });
  let i = 0;
  for (const block of heights.blocks) {
    const floors = block.name === "Tower A" ? 5 : 3;
    for (let floor = 1; floor <= floors; floor++) {
      for (let n = 1; n <= 4; n++) {
        const beds = n <= 2 ? 2 : 3;
        const size = beds === 2 ? 1350 : 1900;
        await db.unit.create({
          data: {
            projectId: heights.id, blockId: block.id, unitNo: `${block.name.slice(-1)}-${floor}0${n}`, type: "Apartment",
            size, sizeUnit: "sqft", bedrooms: beds, bathrooms: beds, floor: String(floor), facing: n % 2 ? "Sea" : "Park",
            corner: n === 1 || n === 4, price: size * (24000 + floor * 500), status: statuses[i++ % statuses.length]!,
          },
        });
      }
    }
  }

  const palm = await db.project.create({
    data: {
      name: "Palm Residency", code: "PR", developer: "Palm Builders", location: "Scheme 33", kind: "residential", status: "active",
      planDownPct: 20, planInstallments: 12, planFrequency: "quarterly", planPossessionPct: 0,
      blocks: { create: [{ name: "Block P1", sortOrder: 0 }, { name: "Block P2", sortOrder: 1 }] },
    },
    include: { blocks: true },
  });
  for (const block of palm.blocks) {
    for (let n = 1; n <= 16; n++) {
      const marla = n % 3 === 0 ? 10 : 5;
      await db.unit.create({
        data: {
          projectId: palm.id, blockId: block.id, unitNo: `${block.name.slice(-2)}-${n}`, type: "Plot", size: marla, sizeUnit: "marla",
          corner: n % 8 === 1, parkFacing: n % 5 === 0, mainRoad: n <= 2, price: marla * 1_150_000 + (n % 8 === 1 ? 800_000 : 0),
          status: statuses[(i++ + n) % statuses.length]!,
        },
      });
    }
  }

  // Agent listings (resale / rental)
  const listings = [
    { unitNo: "House 42", type: "House", purpose: "sale", listingType: "resale", size: 500, sizeUnit: "sqyd", bedrooms: 5, price: 135_000_000, address: "Khayaban-e-Shamsheer, DHA Phase 5", propertyOwner: "Mr. Kamran Ahmed" },
    { unitNo: "Flat 3B", type: "Apartment", purpose: "rent", listingType: "rental", size: 1800, sizeUnit: "sqft", bedrooms: 3, price: 250_000, address: "Clifton Block 2", propertyOwner: "Mrs. Rubina Saleem" },
    { unitNo: "Shop 7", type: "Shop", purpose: "sale", listingType: "resale", size: 400, sizeUnit: "sqft", price: 38_000_000, address: "Bahadurabad Chowrangi", propertyOwner: "Mr. Asif Lakhani" },
    { unitNo: "Villa 11", type: "House", purpose: "rent", listingType: "rental", size: 1000, sizeUnit: "sqyd", bedrooms: 6, price: 900_000, address: "DHA Phase 6", propertyOwner: "Mr. Naveed Iqbal" },
  ];
  for (const [n, l] of listings.entries()) {
    const agent = agents[n % agents.length]!;
    await db.unit.create({ data: { ...l, status: "available", ownerId: agent.id, branchId: agent.branchId } });
  }
}
