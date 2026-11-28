// Interview scheduler (HR → Recruitment → Interviews): scorecard criteria, labels and calendar links. Client-safe.
export const SCORE_CRITERIA = ["Communication", "Experience / skills", "Attitude", "Sales sense", "Culture fit"] as const;
export const RECOMMENDATIONS = [["hire", "Hire"], ["maybe", "Maybe"], ["no", "Don't hire"]] as const;
export const INTERVIEW_STATUS: Record<string, { label: string; tone: "neutral" | "green" | "red" | "amber" }> = {
  scheduled: { label: "Scheduled", tone: "neutral" }, done: { label: "Done", tone: "green" }, cancelled: { label: "Cancelled", tone: "red" }, no_show: { label: "No-show", tone: "amber" },
};
export const MODES = [["onsite", "In office"], ["video", "Video call"], ["phone", "Phone"]] as const;
export const modeLabel = (m: string) => MODES.find(([v]) => v === m)?.[1] ?? m;

export function parseScorecard(s: string | null | undefined): Record<string, number> {
  try { const o = JSON.parse(s ?? "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; }
}
export const scoreAvg = (s: string | null | undefined) => { const v = Object.values(parseScorecard(s)).filter((n) => n >= 1 && n <= 5); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };

/** "Add to Google Calendar" link for an interview. */
export function googleCalendarUrl(title: string, at: Date, durationMin: number, details: string, location: string) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(+at + durationMin * 60_000);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${f(at)}/${f(end)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}`;
}
