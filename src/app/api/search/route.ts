import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeWhere } from "@/lib/permissions";
import { unitWhere } from "@/lib/inventory";
import { employeeWhere } from "@/lib/hr";

// Global search (Ctrl+K). Every group applies the same scope as its list page, so nobody finds what they can't open.
type Hit = { title: string; sub?: string; href: string };
const TAKE = 6;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return Response.json({ groups: [] });
  const digits = q.replace(/\D/g, "");
  const phone = digits.length >= 4 ? [{ phone: { contains: digits } }] : [];

  const groups: { label: string; items: Hit[] }[] = [];
  const add = (label: string, items: Hit[]) => items.length && groups.push({ label, items });

  const leadScope = can(user, "crm.leads") ? await scopeWhere(user, "crm.leads") : null;
  const contactScope = can(user, "crm.contacts") ? await scopeWhere(user, "crm.contacts") : null;
  const dealScope = can(user, "crm.deals") ? await scopeWhere(user, "crm.deals") : null;
  const units = can(user, "inventory.units") || can(user, "inventory.projects") ? await unitWhere(user) : null;
  const emps = can(user, "hr.employees") ? await employeeWhere(user) : null;

  const [leads, contacts, deals, unitRows, people] = await Promise.all([
    leadScope ? db.lead.findMany({ where: { AND: [leadScope as Prisma.LeadWhereInput, { OR: [{ name: { contains: q } }, { email: { contains: q } }, ...phone] }] }, include: { status: true }, orderBy: { updatedAt: "desc" }, take: TAKE }) : [],
    contactScope ? db.contact.findMany({ where: { AND: [contactScope as Prisma.ContactWhereInput, { OR: [{ name: { contains: q } }, { email: { contains: q } }, ...phone] }] }, orderBy: { updatedAt: "desc" }, take: TAKE }) : [],
    dealScope ? db.deal.findMany({ where: { AND: [dealScope as Prisma.DealWhereInput, { OR: [{ title: { contains: q } }, { contact: { name: { contains: q } } }] }] }, include: { stage: true, contact: true }, orderBy: { updatedAt: "desc" }, take: TAKE }) : [],
    units ? db.unit.findMany({ where: { AND: [units, { OR: [{ unitNo: { contains: q } }, { address: { contains: q } }, { project: { name: { contains: q } } }] }] }, include: { project: true }, take: TAKE }) : [],
    emps ? db.employee.findMany({ where: { AND: [emps, { OR: [{ fullName: { contains: q } }, { code: { contains: q } }, ...(digits.length >= 4 ? [{ cnic: { contains: q } }] : []), ...phone] }] }, include: { designation: true }, orderBy: { fullName: "asc" }, take: TAKE }) : [],
  ]);

  add("Leads", leads.map((l) => ({ title: l.name, sub: [l.status.name, l.phone].filter(Boolean).join(" · "), href: `/crm/leads/${l.id}` })));
  add("Deals", deals.map((d) => ({ title: d.title, sub: [d.stage.name, d.contact?.name].filter(Boolean).join(" · "), href: `/crm/deals/${d.id}` })));
  add("Contacts", contacts.map((c) => ({ title: c.name, sub: c.phone ?? c.email ?? undefined, href: `/crm/contacts/${c.id}` })));
  add("Inventory", unitRows.map((u) => ({ title: u.project ? `${u.project.name} · ${u.unitNo}` : u.unitNo, sub: [u.type, u.status, u.address].filter(Boolean).join(" · "), href: `/inventory/units/${u.id}` })));
  add("Employees", people.map((e) => ({ title: e.fullName, sub: [e.code, e.designation?.name].filter(Boolean).join(" · "), href: `/hr/employees/${e.id}` })));
  return Response.json({ groups });
}
