// Property-match alerts: when a unit is added or becomes available, find open leads it fits and tell their agents.
import { db } from "./db";
import { notify, inBackground } from "./notify";
import { disabledFeatures } from "./features";
import { fmtPKR } from "./crm-shared";
import { loadUserById } from "./auth";
import { can } from "./permissions";

type U = { id: string; unitNo: string; type: string; price: number | null; purpose: string; status: string; projectId: string | null; address: string | null; project: { name: string } | null };

/** How well a unit fits a lead (0–100) and why; null when it clearly doesn't fit. */
export function matchScore(u: U, l: { interest: string | null; propertyType: string | null; projectId: string | null; budgetMin: number | null; budgetMax: number | null; location: string | null }) {
  if (l.interest === "sell") return null;
  if (u.purpose === "rent" ? l.interest && l.interest !== "rent" : l.interest === "rent") return null;
  const why: string[] = [];
  let score = 0;
  if (l.projectId && l.projectId === u.projectId) { score += 45; why.push("same project"); }
  if (l.propertyType) {
    if (l.propertyType.toLowerCase() !== u.type.toLowerCase()) return null;
    score += 25; why.push(u.type);
  }
  const lo = l.budgetMin, hi = l.budgetMax;
  if (u.price && (lo || hi)) {
    // 10% leeway either side: agents can negotiate.
    if ((lo && u.price < lo * 0.9) || (hi && u.price > hi * 1.1)) return null;
    score += 25; why.push("in budget");
  }
  const place = `${u.project?.name ?? ""} ${u.address ?? ""}`.toLowerCase();
  if (l.location && place.includes(l.location.toLowerCase().split(/[,·]/)[0]!.trim())) { score += 15; why.push(l.location); }
  // Needs at least two signals (e.g. type + budget, or the project itself).
  return score >= 45 ? { score: Math.min(100, score), why: why.join(" · ") } : null;
}

/** Finds and records matches for one unit, notifying each lead's agent once. Runs after the response. */
export function findMatchesForUnit(unitId: string) {
  inBackground(async () => {
    if ((await disabledFeatures()).has("matches")) return;
    const u = await db.unit.findUnique({ where: { id: unitId }, select: { id: true, unitNo: true, type: true, price: true, purpose: true, status: true, projectId: true, address: true, project: { select: { name: true } } } });
    if (!u || u.status !== "available") return;
    const leads = await db.lead.findMany({
      where: { status: { kind: "open" }, ownerId: { not: null }, OR: [{ projectId: u.projectId ?? "-" }, { propertyType: u.type }, { budgetMax: { not: null } }] },
      select: { id: true, name: true, ownerId: true, interest: true, propertyType: true, projectId: true, budgetMin: true, budgetMax: true, location: true },
      take: 2000,
    });
    const seen = new Set((await db.propertyMatch.findMany({ where: { unitId }, select: { leadId: true } })).map((m) => m.leadId));
    const perAgent = new Map<string, string[]>();
    for (const l of leads) {
      if (seen.has(l.id)) continue;
      const m = matchScore(u, l);
      if (!m) continue;
      await db.propertyMatch.create({ data: { leadId: l.id, unitId, score: m.score, why: m.why } });
      perAgent.set(l.ownerId!, [...(perAgent.get(l.ownerId!) ?? []), l.name]);
    }
    const title = `${u.project?.name ? `${u.project.name} · ` : ""}${u.unitNo}`;
    for (const [agent, names] of perAgent) {
      const who = await loadUserById(agent);
      if (!who || !can(who, "crm.matches")) continue; // matches are still listed for managers who can see them
      await notify(agent, `New match: ${title} fits ${names.length} of your leads`, {
        body: `${u.type}${u.price ? ` · ${fmtPKR(u.price)}` : ""} — ${names.slice(0, 5).join(", ")}${names.length > 5 ? "…" : ""}`, link: "/crm/matches",
      });
    }
  });
}
