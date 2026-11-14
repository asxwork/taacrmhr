// Lead score (Hot / Warm / Cold): how worth calling a lead is right now, from what AMS already knows.
// Client-safe; kept deliberately simple so agents can understand why a lead is hot.

export type ScoreInput = {
  kind: string;              // status kind: open | converted | junk
  stageIndex: number;        // position among open stages (0 = first)
  stageCount: number;
  createdAt: Date;
  lastActivityAt: Date | null;
  hasBudget: boolean;
  hasProperty: boolean;      // project or unit chosen
  nextDue: Date | null;      // next planned follow-up
  now?: Date;
};

export type ScoreExtra = {
  /** Share of this lead's source that became clients (0–1), e.g. Zameen 0.08. */
  sourceRate?: number | null;
  /** Calls / meetings / WhatsApps logged as done. */
  doneActivities?: number;
  /** A site visit was done. */
  visited?: boolean;
  /** Phone and email both known. */
  fullContact?: boolean;
};

/** Score and the reasons behind it (shown when hovering the Hot / Warm badge and on the lead page). */
export function leadScoreParts(l: ScoreInput & ScoreExtra): { score: number; why: string[] } {
  if (l.kind !== "open") return { score: 0, why: ["Closed"] };
  const now = l.now ?? new Date();
  const days = (d: Date) => (now.getTime() - d.getTime()) / 86_400_000;
  const why: string[] = [];
  let s = 0;
  const add = (n: number, reason: string) => { if (n) { s += n; why.push(`${n > 0 ? "+" : ""}${n} ${reason}`); } };
  add(l.stageCount > 1 ? Math.round((l.stageIndex / (l.stageCount - 1)) * 25) : 0, "further along the pipeline");
  if (l.lastActivityAt) add(days(l.lastActivityAt) <= 3 ? 15 : days(l.lastActivityAt) <= 7 ? 8 : 0, "recently in touch");
  if (days(l.createdAt) <= 2) add(10, "fresh enquiry");
  if (l.hasBudget) add(10, "budget known");
  if (l.hasProperty) add(8, "property chosen");
  if (l.visited) add(15, "site visit done");
  if (l.doneActivities) add(Math.min(10, l.doneActivities * 2), `${l.doneActivities} calls / meetings`);
  if (l.sourceRate != null) add(Math.round(Math.min(1, l.sourceRate / 0.15) * 10), `source converts ${Math.round(l.sourceRate * 100)}%`);
  if (l.fullContact) add(2, "phone and email");
  if (l.nextDue) add(l.nextDue < now ? -10 : 5, l.nextDue < now ? "follow-up overdue" : "next step planned");
  return { score: Math.max(0, Math.min(100, s)), why };
}

export function leadScore(l: ScoreInput & ScoreExtra) {
  return leadScoreParts(l).score;
}

export const scoreLabel = (score: number) => (score >= 60 ? "Hot" : score >= 35 ? "Warm" : "Cold");
export const scoreTone = (score: number) => (score >= 60 ? "red" : score >= 35 ? "amber" : "neutral") as "red" | "amber" | "neutral";
