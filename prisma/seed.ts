// Seeds branches, default roles, lead sources and demo users. Safe to re-run (upserts).
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

const DEMO_PASSWORD = "Advisor@2026";
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
  await upsertUser("agent1@advisor.local", { name: "Ali Raza", title: "Property Consultant", branchId: dha.id, managerId: manager.id, role: "Agent" });
  await upsertUser("agent2@advisor.local", { name: "Sana Khan", title: "Property Consultant", branchId: bhd.id, managerId: manager.id, role: "Agent" });
  await upsertUser("staff@advisor.local", { name: "Usman Tariq", title: "Office Assistant", branchId: bhd.id, role: "Employee" });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
