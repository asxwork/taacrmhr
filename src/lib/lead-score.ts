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

export function leadScore(l: ScoreInput) {
  if (l.kind !== "open") return 0;
  const now = l.now ?? new Date();
  const days = (d: Date) => (now.getTime() - d.getTime()) / 86_400_000;
  let s = 0;
  s += l.stageCount > 1 ? Math.round((l.stageIndex / (l.stageCount - 1)) * 30) : 0; // further along the pipeline
  if (l.lastActivityAt) s += days(l.lastActivityAt) <= 3 ? 20 : days(l.lastActivityAt) <= 7 ? 10 : 0; // recently engaged
  if (days(l.createdAt) <= 2) s += 15; // fresh enquiry
  if (l.hasBudget) s += 15;
  if (l.hasProperty) s += 10;
  if (l.nextDue) s += l.nextDue < now ? -10 : 10; // planned next step (overdue costs points)
  return Math.max(0, Math.min(100, s));
}

export const scoreLabel = (score: number) => (score >= 60 ? "Hot" : score >= 35 ? "Warm" : "Cold");
export const scoreTone = (score: number) => (score >= 60 ? "red" : score >= 35 ? "amber" : "neutral") as "red" | "amber" | "neutral";
