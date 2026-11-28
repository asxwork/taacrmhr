// Inventory sharing: the public listing page (/p/<token>, shared on WhatsApp, no login) and the property owner's
// progress page (/o/<token>); plus price history, price per sq ft and price-drop alerts to agents with matching leads.
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { notify } from "./notify";
import { fmtPKR } from "./crm-shared";

const newToken = () => randomBytes(18).toString("base64url");

/** The unit's public or owner token, made the first time it's needed. */
export async function unitToken(unitId: string, kind: "public" | "owner") {
  const u = await db.unit.findUnique({ where: { id: unitId }, select: { publicToken: true, ownerToken: true } });
  if (!u) return null;
  const have = kind === "public" ? u.publicToken : u.ownerToken;
  if (have) return have;
  const t = newToken();
  await db.unit.update({ where: { id: unitId }, data: kind === "public" ? { publicToken: t } : { ownerToken: t } });
  return t;
}

/** Size in square feet (1 marla = 225 sq ft as used by DHA / most Karachi societies, 1 kanal = 20 marla, 1 sq yd = 9 sq ft). */
export const sqftOf = (size: number | null, unit: string) => (!size ? null : unit === "sqyd" ? size * 9 : unit === "marla" ? size * 225 : unit === "kanal" ? size * 4500 : size);
export const pricePerSqft = (price: number | null, size: number | null, unit: string) => { const s = sqftOf(size, unit); return price && s ? Math.round(price / s) : null; };

/** Saves a price change and, when the price went down, tells the agents whose leads match or asked about the unit. */
export async function recordPriceChange(unitId: string, oldPrice: number | null, price: number | null, byId: string | null) {
  if (oldPrice === price) return;
  await db.unitPrice.create({ data: { unitId, oldPrice, price, byId } });
  if (!oldPrice || !price || price >= oldPrice) return;
  if ((await (await import("./features")).disabledFeatures()).has("inv-prices")) return;
  const unit = await db.unit.findUnique({ where: { id: unitId }, select: { unitNo: true, status: true, project: { select: { name: true } } } });
  if (!unit || unit.status !== "available") return;
  const [matches, asked] = await Promise.all([
    db.propertyMatch.findMany({ where: { unitId, dismissedAt: null, lead: { status: { kind: "open" } } }, select: { lead: { select: { id: true, name: true, ownerId: true } } }, take: 200 }),
    db.lead.findMany({ where: { unitId, status: { kind: "open" } }, select: { id: true, name: true, ownerId: true }, take: 200 }),
  ]);
  const byOwner = new Map<string, string[]>();
  for (const l of [...matches.map((m) => m.lead), ...asked]) if (l.ownerId && l.ownerId !== byId) byOwner.set(l.ownerId, [...new Set([...(byOwner.get(l.ownerId) ?? []), l.name])]);
  const title = unit.project ? `${unit.project.name} · ${unit.unitNo}` : unit.unitNo;
  const pct = Math.round(((oldPrice - price) / oldPrice) * 100);
  for (const [ownerId, names] of byOwner) {
    await notify(ownerId, `Price dropped ${pct}%: ${title}`, { body: `Now ${fmtPKR(price)} (was ${fmtPKR(oldPrice)}). Matches your lead${names.length > 1 ? "s" : ""} ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}. A good reason to call.`, link: `/inventory/units/${unitId}` }).catch(() => {});
  }
}
