import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Eye, MessageCircle, Phone, Users, Footprints, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { disabledFeatures } from "@/lib/features";
import { fmtPKR, telHref, waHref } from "@/lib/crm-shared";
import { sizeLabel, unitStatus } from "@/lib/inventory";
import { pricePerSqft } from "@/lib/unit-public";

export const metadata = { title: "Your property", robots: { index: false } };

/**
 * The property owner's page (link sent by the agent): how their listing is doing — views of the shared listing,
 * enquiries, matching buyers, site visits and the price history. Counts only, never the buyers' details. No login.
 */
export default async function OwnerPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token.length < 20 || (await disabledFeatures()).has("inv-owner")) notFound();
  const u = await db.unit.findFirst({ where: { ownerToken: token }, include: { project: { select: { name: true } }, owner: { select: { name: true, phone: true } } } });
  if (!u) notFound();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [enquiries, enquiries30, matches, visits, prices] = await Promise.all([
    db.lead.count({ where: { unitId: u.id } }),
    db.lead.count({ where: { unitId: u.id, createdAt: { gte: since } } }),
    db.propertyMatch.count({ where: { unitId: u.id, dismissedAt: null } }),
    db.activity.count({ where: { type: "visit", doneAt: { not: null }, lead: { unitId: u.id } } }),
    db.unitPrice.findMany({ where: { unitId: u.id }, orderBy: { changedAt: "desc" }, take: 12 }),
  ]);
  const st = unitStatus(u.status);
  const title = u.project ? `${u.project.name} · ${u.unitNo}` : `${u.type} · ${u.address ?? u.area ?? u.unitNo}`;
  const ppsf = pricePerSqft(u.price, u.size, u.sizeUnit);
  const Tile = ({ icon: Icon, n, label, sub }: { icon: typeof Eye; n: number; label: string; sub?: string }) => (
    <div className="rounded-xl bg-white p-4 shadow-sm"><Icon className="size-5 text-navy-900" /><p className="mt-2 text-2xl font-semibold">{n.toLocaleString()}</p><p className="text-sm text-muted">{label}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</div>
  );
  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-center text-sm font-semibold tracking-wide text-navy-900">THE ADVISOR ASSOCIATES</p>
        <div className="rounded-xl bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Your property</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted">{sizeLabel(u.size, u.sizeUnit)}{u.bedrooms ? ` · ${u.bedrooms} bed` : ""} · Status: <b className="font-medium text-ink">{st.label}</b></p>
          <p className="mt-3 text-3xl font-semibold text-navy-900">{fmtPKR(u.price)}{u.purpose === "rent" && <span className="text-base font-normal text-muted"> / month</span>}</p>
          {ppsf && u.purpose !== "rent" && <p className="text-sm text-muted">{fmtPKR(ppsf)} per sq ft</p>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile icon={Eye} n={u.publicViews} label="Listing views" sub="people who opened the shared listing" />
          <Tile icon={Users} n={enquiries} label="Enquiries" sub={`${enquiries30} in the last 30 days`} />
          <Tile icon={Sparkles} n={matches} label="Matching buyers" sub="clients looking for a property like yours" />
          <Tile icon={Footprints} n={visits} label="Site visits" />
        </div>
        {prices.length > 0 && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="mb-2 font-medium">Price history</p>
            <ul className="divide-y divide-line text-sm">{prices.map((p) => <li key={p.id} className="flex justify-between py-2"><span className="text-muted">{format(p.changedAt, "d MMM yyyy")}</span><span>{p.oldPrice ? `${fmtPKR(p.oldPrice)} → ` : ""}<b className="font-medium">{fmtPKR(p.price)}</b></span></li>)}</ul>
          </div>
        )}
        {u.owner?.phone && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-muted">Your agent: <b className="font-medium text-ink">{u.owner.name}</b></p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={waHref(u.owner.phone)} target="_blank" rel="noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 font-medium text-white"><MessageCircle className="size-5" /> WhatsApp</a>
              <a href={telHref(u.owner.phone)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line px-4 font-medium"><Phone className="size-5" /> Call</a>
            </div>
          </div>
        )}
        <p className="text-center text-xs text-muted">Updated live · {format(new Date(), "d MMM yyyy, h:mm a")}</p>
      </div>
    </main>
  );
}
