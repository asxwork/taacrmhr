// HR dashboard widgets an admin can hide (System Settings → Customization → Dashboard).
import { db } from "./db";

export const DASHBOARD_WIDGETS = [
  { key: "drill", label: "Attendance drill-down" },
  { key: "risers", label: "Early risers & late comers" },
  { key: "kpis", label: "Separation & confirmation tiles" },
  { key: "me", label: "Clock in/out, leave summary & clock" },
  { key: "quote", label: "Quote of the day" },
  { key: "posts", label: "Accolades, news letter & words of wisdom" },
  { key: "summary", label: "My attendance summary & check-in trend" },
  { key: "absents", label: "Month-wise absents" },
  { key: "people", label: "Birthdays, my team, new joiners & anniversaries" },
  { key: "headcount", label: "Head count charts" },
  { key: "money", label: "Attrition, expense report & monthly attendance" },
  { key: "gender", label: "Gender head count & company policies" },
  { key: "support", label: "Support email & joiners by gender" },
] as const;
export type WidgetKey = (typeof DASHBOARD_WIDGETS)[number]["key"];

export async function hiddenWidgets() {
  const v = (await db.setting.findUnique({ where: { key: "hr.dashboard.hidden" } }))?.value ?? "";
  return new Set(v.split(",").filter(Boolean) as WidgetKey[]);
}

/** One person's dashboard: the widgets they hide and the order they like. Company-hidden widgets stay hidden. */
export async function myDashboardLayout(userId: string) {
  const row = await db.setting.findUnique({ where: { key: `hr.dashboard.layout.${userId}` } });
  let saved: { order?: string[]; hidden?: string[] } = {};
  try { saved = row ? JSON.parse(row.value) : {}; } catch { /* default */ }
  const all = DASHBOARD_WIDGETS.map((w) => w.key) as WidgetKey[];
  const order = [...(saved.order ?? []).filter((k): k is WidgetKey => all.includes(k as WidgetKey)), ...all.filter((k) => !(saved.order ?? []).includes(k))];
  return { order, hidden: new Set((saved.hidden ?? []) as WidgetKey[]), custom: !!row };
}

export const QUOTES: [string, string][] = [
  ["The secret of getting ahead is getting started.", "Mark Twain"],
  ["Quality is not an act, it is a habit.", "Aristotle"],
  ["Well done is better than well said.", "Benjamin Franklin"],
  ["Coming together is a beginning; keeping together is progress; working together is success.", "Henry Ford"],
  ["The best way to predict the future is to create it.", "Peter Drucker"],
  ["It always seems impossible until it's done.", "Nelson Mandela"],
  ["Success is the sum of small efforts, repeated day in and day out.", "Robert Collier"],
  ["Customers will never love a company until the employees love it first.", "Simon Sinek"],
  ["Hard work beats talent when talent doesn't work hard.", "Tim Notke"],
  ["Don't watch the clock; do what it does. Keep going.", "Sam Levenson"],
  ["Great things in business are never done by one person. They're done by a team of people.", "Steve Jobs"],
  ["Your work is going to fill a large part of your life. Do great work.", "Steve Jobs"],
  ["Opportunities don't happen. You create them.", "Chris Grosser"],
  ["Discipline is the bridge between goals and accomplishment.", "Jim Rohn"],
  ["Do what you can, with what you have, where you are.", "Theodore Roosevelt"],
  ["Small daily improvements over time lead to stunning results.", "Robin Sharma"],
  ["Act as if what you do makes a difference. It does.", "William James"],
  ["The harder I work, the luckier I get.", "Samuel Goldwyn"],
  ["Every client you meet is a chance to build trust.", "The Advisor Associates"],
  ["Be so good they can't ignore you.", "Steve Martin"],
  ["A goal without a plan is just a wish.", "Antoine de Saint-Exupéry"],
  ["Start where you are. Use what you have. Do what you can.", "Arthur Ashe"],
  ["Excellence is doing ordinary things extraordinarily well.", "John W. Gardner"],
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Focus on being productive instead of busy.", "Tim Ferriss"],
  ["Honesty is the first chapter in the book of wisdom.", "Thomas Jefferson"],
  ["Follow up is where the deal is won.", "The Advisor Associates"],
  ["Little by little, one travels far.", "J.R.R. Tolkien"],
  ["Believe you can and you're halfway there.", "Theodore Roosevelt"],
  ["Make each day your masterpiece.", "John Wooden"],
  ["What we do today matters most.", "Unknown"],
];
/** Same quote all day for everyone; a new one tomorrow. */
export function quoteOfTheDay(d = new Date()) {
  const day = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return QUOTES[day % QUOTES.length]!;
}
