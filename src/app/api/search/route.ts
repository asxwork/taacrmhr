import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, scopeWhere } from "@/lib/permissions";
import { unitWhere } from "@/lib/inventory";
import { employeeWhere } from "@/lib/hr";
import { fieldAccess } from "@/lib/field-rules";
import { maskPhone } from "@/lib/field-defs";
import { fmtPKR, phoneKey, PROPERTY_TYPES } from "@/lib/crm-shared";
import { TUTORIALS } from "@/lib/tutorials";

// Global search (Ctrl+K). Every group applies the same scope as its list page, so nobody finds what they can't open.
// "Smart" parts: lead numbers (#123), phone numbers in any format, several words in any order, and property
// questions like "3 bed apartment dha under 2 crore" that turn into an inventory search.
type Hit = { title: string; sub?: string; href: string };
const TAKE = 6;

const TYPE_WORDS: Record<string, string> = { flat: "Apartment", flats: "Apartment", apartment: "Apartment", apartments: "Apartment", house: "House", houses: "House", villa: "House", plot: "Plot", plots: "Plot", shop: "Shop", shops: "Shop", office: "Office", offices: "Office", farmhouse: "Farmhouse", building: "Building" };
const UNIT = { crore: 1e7, cr: 1e7, lakh: 1e5, lac: 1e5, lakhs: 1e5, l: 1e5, k: 1e3, m: 1e6, million: 1e6 } as Record<string, number>;

/** Pulls property filters out of free text; what's left is matched against project / address. */
function propertyIntent(q: string) {
  let rest = ` ${q.toLowerCase()} `;
  const take = (re: RegExp) => { const m = rest.match(re); if (m) rest = rest.replace(m[0], " "); return m; };
  const beds = take(/\b(\d)\s*-?\s*(bed|beds|bedroom|bedrooms|bd|br|bhk)\b/);
  const price = take(/\b(under|below|upto|up to|max|around|about)?\s*(\d+(?:\.\d+)?)\s*(crore|cr|lakhs?|lac|l|k|million|m)\b/);
  const purpose = take(/\b(for rent|rent|rental|for sale|sale|buy)\b/);
  let type: string | undefined;
  for (const w of rest.split(/\s+/)) if (TYPE_WORDS[w]) { type = TYPE_WORDS[w]; rest = rest.replace(new RegExp(`\\b${w}\\b`), " "); break; }
  if (!type) type = PROPERTY_TYPES.find((t) => rest.includes(` ${t.toLowerCase()} `));
  rest = rest.replace(/\b(available|in|at|near|with|a|an|the)\b/g, " ").replace(/\s+/g, " ").trim();
  const amount = price ? Number(price[2]) * (UNIT[price[3]!] ?? 1) : null;
  const under = !!price?.[1] && /under|below|upto|up to|max/.test(price[1]);
  const found = !!(beds || price || type);
  return found ? {
    type, beds: beds ? Number(beds[1]) : undefined, rest,
    purpose: purpose ? (/rent/.test(purpose[1]!) ? "rent" : "sale") : undefined,
    min: amount ? (under ? undefined : Math.round(amount * 0.85)) : undefined,
    max: amount ? (under ? amount : Math.round(amount * 1.15)) : undefined,
  } : null;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) return Response.json({ groups: [] });
  const words = q.split(/\s+/).filter((w) => w.length > 0).slice(0, 5);
  const digits = q.replace(/\D/g, "");
  const key = digits.length >= 7 ? phoneKey(q) : null;
  const leadNo = /^#?\d{1,7}$/.test(q) ? Number(q.replace("#", "")) : null;
  const fields = await fieldAccess(user);
  const pm = fields["lead.phone"];
  // Phone matching follows the field rules: someone who can't see lead numbers can't search by them either.
  const phoneOr = (allowed: boolean) => (allowed && digits.length >= 4 ? [{ phone: { contains: digits } }, ...(key ? [{ phoneKey: { contains: key.slice(-9) } }] : [])] : []);

  const groups: { label: string; items: Hit[] }[] = [];
  const add = (label: string, items: Hit[]) => items.length && groups.push({ label, items });

  const leadScope = can(user, "crm.leads") ? await scopeWhere(user, "crm.leads") : null;
  const contactScope = can(user, "crm.contacts") ? await scopeWhere(user, "crm.contacts") : null;
  const dealScope = can(user, "crm.deals") ? await scopeWhere(user, "crm.deals") : null;
  const units = can(user, "inventory.units") || can(user, "inventory.projects") ? await unitWhere(user) : null;
  const emps = can(user, "hr.employees") ? await employeeWhere(user) : null;
  const intent = units ? propertyIntent(q) : null;

  // Every word must appear somewhere (name, email, area, project, source details) — order doesn't matter.
  const leadWords: Prisma.LeadWhereInput[] = words.map((w) => ({ OR: [{ name: { contains: w } }, { email: { contains: w } }, { location: { contains: w } }, { project: { name: { contains: w } } }, { sourceInfo: { contains: w } }] }));
  const leadMatch: Prisma.LeadWhereInput = { OR: [{ AND: leadWords }, ...phoneOr(pm !== "hidden"), ...(leadNo ? [{ number: leadNo }] : [])] };
  const unitText: Prisma.UnitWhereInput[] = (intent ? intent.rest.split(" ").filter(Boolean) : words).map((w) => ({ OR: [{ unitNo: { contains: w } }, { address: { contains: w } }, { project: { name: { contains: w } } }, { block: { name: { contains: w } } }] }));
  const unitFilter: Prisma.UnitWhereInput = intent
    ? { AND: [...unitText, { status: "available" }, intent.type ? { type: intent.type } : {}, intent.beds ? { bedrooms: intent.beds } : {}, intent.purpose ? { purpose: intent.purpose } : {}, intent.min || intent.max ? { price: { ...(intent.min ? { gte: intent.min } : {}), ...(intent.max ? { lte: intent.max } : {}) } } : {}] }
    : { AND: unitText };

  const [leads, contacts, deals, unitRows, people] = await Promise.all([
    leadScope ? db.lead.findMany({ where: { AND: [leadScope as Prisma.LeadWhereInput, leadMatch] }, include: { status: true }, orderBy: { updatedAt: "desc" }, take: TAKE }) : [],
    contactScope ? db.contact.findMany({ where: { AND: [contactScope as Prisma.ContactWhereInput, { OR: [{ AND: words.map((w) => ({ OR: [{ name: { contains: w } }, { email: { contains: w } }] })) }, ...phoneOr(pm !== "hidden")] }] }, orderBy: { updatedAt: "desc" }, take: TAKE }) : [],
    dealScope ? db.deal.findMany({ where: { AND: [dealScope as Prisma.DealWhereInput, { AND: words.map((w) => ({ OR: [{ title: { contains: w } }, { contact: { name: { contains: w } } }, { lead: { name: { contains: w } } }] })) }] }, include: { stage: true, contact: true }, orderBy: { updatedAt: "desc" }, take: TAKE }) : [],
    units ? db.unit.findMany({ where: { AND: [units, unitFilter] }, include: { project: true }, orderBy: intent ? { price: "asc" } : { updatedAt: "desc" }, take: TAKE }) : [],
    emps ? db.employee.findMany({ where: { AND: [emps, { OR: [{ AND: words.map((w) => ({ OR: [{ fullName: { contains: w } }, { code: { contains: w } }, { designation: { name: { contains: w } } }, { department: { name: { contains: w } } }] })) }, ...(digits.length >= 4 && fields["employee.cnic"] === "full" ? [{ cnic: { contains: q } }] : []), ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])] }] }, include: { designation: true }, orderBy: { fullName: "asc" }, take: TAKE }) : [],
  ]);

  const shownPhone = (p: string | null) => (!p || pm === "hidden" ? null : pm === "mask" ? maskPhone(p) : p);
  add("Leads", leads.map((l) => ({ title: `${l.name}${l.number ? ` #${l.number}` : ""}`, sub: [l.status.name, shownPhone(l.phone)].filter(Boolean).join(" · "), href: `/crm/leads/${l.id}` })));
  add("Deals", deals.map((d) => ({ title: d.title, sub: [d.stage.name, d.contact?.name].filter(Boolean).join(" · "), href: `/crm/deals/${d.id}` })));
  add("Contacts", contacts.map((c) => ({ title: c.name, sub: shownPhone(c.phone) ?? c.email ?? undefined, href: `/crm/contacts/${c.id}` })));
  if (intent) {
    const qs = new URLSearchParams(Object.entries({ status: "available", type: intent.type, purpose: intent.purpose, min: intent.min?.toString(), max: intent.max?.toString(), q: intent.rest }).filter(([, v]) => v) as [string, string][]);
    add("Matching units", [
      ...unitRows.map((u) => ({ title: u.project ? `${u.project.name} · ${u.unitNo}` : u.unitNo, sub: [u.type, u.bedrooms ? `${u.bedrooms} bed` : null, u.price ? fmtPKR(u.price) : null].filter(Boolean).join(" · "), href: `/inventory/units/${u.id}` })),
      { title: "See all matching units →", sub: [intent.beds && `${intent.beds} bed`, intent.type, intent.purpose, intent.max && `up to ${fmtPKR(intent.max)}`, intent.rest].filter(Boolean).join(" · "), href: `/inventory?${qs}` },
    ]);
  } else {
    add("Inventory", unitRows.map((u) => ({ title: u.project ? `${u.project.name} · ${u.unitNo}` : u.unitNo, sub: [u.type, u.status, u.address].filter(Boolean).join(" · "), href: `/inventory/units/${u.id}` })));
  }
  add("Employees", people.map((e) => ({ title: e.fullName, sub: [e.code, e.designation?.name].filter(Boolean).join(" · "), href: `/hr/employees/${e.id}` })));
  // How-to answers from Tutorials (only topics this person can use).
  const lower = words.map((w) => w.toLowerCase());
  add("How to", TUTORIALS.filter((t) => (user.isSuperAdmin || ((!t.module || can(user, t.module, t.action ?? "view")) && !t.superAdmin)) && lower.every((w) => `${t.title} ${t.summary}`.toLowerCase().includes(w)))
    .slice(0, 3).map((t) => ({ title: t.title, sub: t.summary, href: `/help#${t.key}` })));
  return Response.json({ groups });
}
