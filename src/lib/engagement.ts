// Employee Engagement pulse surveys. Answers are keyed by a hash of survey + employee so each person answers once,
// and anonymous surveys never store who answered.
import { createHash } from "node:crypto";

export type Question = { text: string; kind: "rating" | "text" };

export const respondentKey = (surveyId: string, employeeId: string) => createHash("sha256").update(`${surveyId}:${employeeId}`).digest("hex");

export function parseQuestions(json: string): Question[] {
  try { return (JSON.parse(json) as Question[]).filter((q) => q.text); } catch { return []; }
}

export const RATING_FACES = ["😞", "🙁", "😐", "🙂", "😄"] as const;
