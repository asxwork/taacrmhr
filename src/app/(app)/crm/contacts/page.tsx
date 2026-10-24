import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission, scopeWhere } from "@/lib/permissions";
import { assignableUsers } from "@/lib/crm";
import { cn, fmtAgo } from "@/lib/utils";
import { Avatar, Card, Drawer, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { Pagination, hrefWith } from "@/components/crm/bits";
import { CompanyForm, ContactForm } from "./forms";

export const metadata = { title: "Contacts" };

const PAGE_SIZE = 50;
type SP = { tab?: string; q?: string; page?: string; new?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("crm.contacts");
  const sp = await searchParams;
  const tab = sp.tab === "companies" ? "companies" : "contacts";
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const keep = { tab: sp.tab, q: sp.q };
  const scope = (await scopeWhere(user, "crm.contacts"))!;
  const canCreate = can(user, "crm.contacts", "create");
  const closeHref = hrefWith("/crm/contacts", keep, {});

  const contactWhere: Prisma.ContactWhereInput = { ...scope, ...(q && { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }] }) };
  const companyWhere: Prisma.CompanyWhereInput = { ...scope, ...(q && { OR: [{ name: { contains: q } }, { phone: { contains: q } }] }) };

  const [contacts, companies, total] = await Promise.all([
    tab === "contacts"
      ? db.contact.findMany({ where: contactWhere, include: { company: true, owner: { select: { name: true } }, _count: { select: { deals: true } } }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE })
      : [],
    tab === "companies"
      ? db.company.findMany({ where: companyWhere, include: { owner: { select: { name: true } }, _count: { select: { contacts: true, deals: true } } }, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE })
      : [],
    tab === "contacts" ? db.contact.count({ where: contactWhere }) : db.company.count({ where: companyWhere }),
  ]);

  const drawerData = sp.new && canCreate
    ? await Promise.all([
        db.company.findMany({ where: scope, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
        db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
        assignableUsers(user, "crm.contacts"),
      ])
    : null;

  return (
    <>
      <PageHeader
        title="Contacts"
        actions={
          canCreate && (
            <LinkButton href={hrefWith("/crm/contacts", keep, { new: "1" })} scroll={false}>
              <Plus className="size-4" /> {tab === "companies" ? "New company" : "New contact"}
            </LinkButton>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-black/5 p-0.5">
          {(["contacts", "companies"] as const).map((t) => (
            <Link
              key={t}
              href={t === "companies" ? "/crm/contacts?tab=companies" : "/crm/contacts"}
              className={cn("rounded-md px-3 py-1.5 text-sm capitalize", tab === t ? "bg-white font-medium shadow-sm" : "text-muted hover:text-ink")}
            >
              {t}
            </Link>
          ))}
        </div>
        <form className="relative min-w-56 flex-1">
          {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
          <Search className="absolute left-3 top-2.5 size-4 text-muted" />
          <input name="q" defaultValue={q} placeholder={tab === "companies" ? "Search companies" : "Search name, phone, email"} className="input pl-9" />
        </form>
      </div>

      <Card className="overflow-hidden">
        {total === 0 ? (
          <EmptyState title={`No ${tab} yet`} description={tab === "contacts" ? "Contacts are created when you convert a lead, or add one directly." : undefined} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-line bg-canvas/60">
                  {tab === "contacts" ? (
                    <tr>
                      <th className="th">Name</th>
                      <th className="th">Phone</th>
                      <th className="th">Company</th>
                      <th className="th">Deals</th>
                      <th className="th">Responsible</th>
                      <th className="th">Updated</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="th">Company</th>
                      <th className="th">Industry</th>
                      <th className="th">Contacts</th>
                      <th className="th">Deals</th>
                      <th className="th">Responsible</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-line">
                  {contacts.map((c) => (
                    <tr key={c.id} className="hover:bg-canvas/60">
                      <td className="td">
                        <Link href={`/crm/contacts/${c.id}`} className="flex items-center gap-3">
                          <Avatar name={c.name} />
                          <span>
                            <span className="block font-medium hover:underline">{c.name}</span>
                            {c.email && <span className="block text-xs text-muted">{c.email}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="td whitespace-nowrap text-muted">{c.phone ?? "—"}</td>
                      <td className="td text-muted">{c.company ? <Link href={`/crm/companies/${c.company.id}`} className="hover:underline">{c.company.name}</Link> : "—"}</td>
                      <td className="td text-muted">{c._count.deals}</td>
                      <td className="td text-muted">{c.owner?.name ?? "—"}</td>
                      <td className="td whitespace-nowrap text-muted">{fmtAgo(c.updatedAt)}</td>
                    </tr>
                  ))}
                  {companies.map((c) => (
                    <tr key={c.id} className="hover:bg-canvas/60">
                      <td className="td"><Link href={`/crm/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td>
                      <td className="td text-muted">{c.industry ?? "—"}</td>
                      <td className="td text-muted">{c._count.contacts}</td>
                      <td className="td text-muted">{c._count.deals}</td>
                      <td className="td text-muted">{c.owner?.name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination base="/crm/contacts" sp={keep} page={page} pageSize={PAGE_SIZE} total={total} />
          </>
        )}
      </Card>

      {drawerData && (
        <Drawer title={tab === "companies" ? "New company" : "New contact"} closeHref={closeHref}>
          {tab === "companies" ? (
            <CompanyForm owners={drawerData[2]} currentUserId={user.id} cancelHref={closeHref} />
          ) : (
            <ContactForm companies={drawerData[0]} sources={drawerData[1]} owners={drawerData[2]} currentUserId={user.id} cancelHref={closeHref} />
          )}
        </Drawer>
      )}
    </>
  );
}
