import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BedDouble, Bath, MapPin, MessageCircle, Phone, Ruler } from "lucide-react";
import { db } from "@/lib/db";
import { disabledFeatures } from "@/lib/features";
import { fmtPKR, telHref, waHref } from "@/lib/crm-shared";
import { sizeLabel } from "@/lib/inventory-shared";
import { pricePerSqft } from "@/lib/unit-public";
import { APP_URL } from "@/lib/notify";

type P = { params: Promise<{ token: string }>; searchParams: Promise<{ a?: string }> };

async function load(token: string) {
  if (token.length < 20 || (await disabledFeatures()).has("inv-share")) return null;
  return db.unit.findFirst({ where: { publicToken: token }, include: { project: { select: { name: true, developer: true, location: true } }, block: { select: { name: true } }, owner: { select: { name: true, phone: true, active: true } }, images: { orderBy: { sortOrder: "asc" }, select: { id: true } } } });
}
const titleOf = (u: NonNullable<Awaited<ReturnType<typeof load>>>) => [u.bedrooms ? `${u.bedrooms} bed` : null, u.type, u.project?.name ?? u.area ?? u.address].filter(Boolean).join(" · ");

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const u = await load((await params).token);
  if (!u) return { title: "Listing", robots: { index: false } };
  const t = titleOf(u);
  return { title: t, description: `${fmtPKR(u.price)}${u.purpose === "rent" ? " / month" : ""} · ${sizeLabel(u.size, u.sizeUnit)}`, robots: { index: false }, openGraph: { title: t, images: u.images.length ? [`/p/${(await params).token}/photo/0`] : [] } };
}

/** A listing shared on WhatsApp: photos, price, size, location and the agent to contact. No login. */
export default async function PublicListing({ params, searchParams }: P) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const u = await load(token);
  if (!u) notFound();
  await db.unit.update({ where: { id: u.id }, data: { publicViews: { increment: 1 } } }).catch(() => {});
  // The agent who shared it (?a=), else the listing agent, else the company number.
  const sharer = sp.a ? await db.user.findFirst({ where: { id: sp.a.slice(0, 40), active: true }, select: { name: true, phone: true } }) : null;
  const agent = sharer?.phone ? sharer : u.owner?.active && u.owner.phone ? u.owner : null;
  const companyPhone = agent ? null : (await db.setting.findUnique({ where: { key: "company.phone" } }))?.value ?? null;
  const phone = agent?.phone ?? companyPhone;
  const ppsf = pricePerSqft(u.price, u.size, u.sizeUnit);
  const where = [u.block?.name, u.project?.name, u.area ?? u.project?.location].filter(Boolean).join(", ");
  const gone = !["available", "hold"].includes(u.status);
  const title = titleOf(u);
  const msg = `Hi, I'm interested in ${title} (${fmtPKR(u.price)}) — ${APP_URL()}/p/${token}`;
  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-center text-sm font-semibold tracking-wide text-navy-900">THE ADVISOR ASSOCIATES</p>
        {gone && <p className="rounded-lg bg-amber-50 px-4 py-2 text-center text-sm text-amber-800">This property is no longer available. Contact us for similar options.</p>}
        {u.images.length > 0 && (
          <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-xl">
            {u.images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.id} src={`/p/${token}/photo/${i}`} alt={`${title} photo ${i + 1}`} className="aspect-[4/3] w-[85%] shrink-0 snap-center rounded-xl object-cover sm:w-[70%]" loading={i ? "lazy" : "eager"} />
            ))}
          </div>
        )}
        <div className="rounded-xl bg-white p-5 shadow-sm sm:p-7">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{u.purpose === "rent" ? "For rent" : u.listingType === "project" ? "Off-plan" : "For sale"}</p>
          <h1 className="mt-1 font-display text-2xl font-semibold">{title}</h1>
          {where && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><MapPin className="size-4" /> {where}</p>}
          <p className="mt-3 text-3xl font-semibold text-navy-900">{fmtPKR(u.price)}{u.purpose === "rent" && <span className="text-base font-normal text-muted"> / month</span>}</p>
          {ppsf && u.purpose !== "rent" && <p className="text-sm text-muted">{fmtPKR(ppsf)} per sq ft</p>}
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            {u.size && <span className="flex items-center gap-1.5"><Ruler className="size-4 text-muted" /> {sizeLabel(u.size, u.sizeUnit)}</span>}
            {u.bedrooms && <span className="flex items-center gap-1.5"><BedDouble className="size-4 text-muted" /> {u.bedrooms} bedrooms</span>}
            {u.bathrooms && <span className="flex items-center gap-1.5"><Bath className="size-4 text-muted" /> {u.bathrooms} bathrooms</span>}
          </div>
          {[u.floor && `Floor ${u.floor}`, u.facing && `${u.facing} facing`, u.corner && "Corner", u.parkFacing && "Park facing", u.mainRoad && "Main road", u.project?.developer && `Developer: ${u.project.developer}`].filter(Boolean).length > 0 && (
            <p className="mt-3 text-sm text-muted">{[u.floor && `Floor ${u.floor}`, u.facing && `${u.facing} facing`, u.corner && "Corner", u.parkFacing && "Park facing", u.mainRoad && "Main road", u.project?.developer && `Developer: ${u.project.developer}`].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        {phone && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-muted">Contact {agent ? agent.name : "us"}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`${waHref(phone)}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 font-medium text-white"><MessageCircle className="size-5" /> WhatsApp</a>
              <a href={telHref(phone)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-line px-4 font-medium"><Phone className="size-5" /> Call</a>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
