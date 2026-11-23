import { db } from "./db";

// Sign in with what people remember: the full email, just the part before @ ("admin", "huzaifa.khan"), or their
// name ("Huzaifa Khan", or "huzaifa" when only one active person has that first name).
const key = (s: string) => s.trim().toLowerCase().replace(/[.\s_-]+/g, " ").trim();

export async function resolveLoginEmail(input: string): Promise<string | null> {
  const typed = input.trim().toLowerCase();
  if (!typed) return null;
  if (typed.includes("@")) return typed;
  const people = await db.user.findMany({ where: { active: true }, select: { email: true, name: true } });
  const one = (list: { email: string }[]) => (list.length === 1 ? list[0]!.email.toLowerCase() : null);
  const k = key(typed);
  return (
    one(people.filter((p) => p.email.toLowerCase().split("@")[0] === typed))
    ?? one(people.filter((p) => key(p.email.split("@")[0]!) === k))
    ?? one(people.filter((p) => key(p.name) === k || key(p.name).replace(/ /g, "") === k.replace(/ /g, "")))
    ?? one(people.filter((p) => key(p.name).split(" ")[0] === k))
  );
}
