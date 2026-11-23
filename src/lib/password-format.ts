// "Set passwords from a format" (Settings → Users → bulk action): one rule makes each person's password from their
// own details, e.g. {First}@2026 → Huzaifa@2026, {first}{phone4} → huzaifa4567.
export const PASSWORD_TOKENS = [
  ["{first}", "first name, small letters"], ["{First}", "First name, capital first letter"], ["{FIRST}", "FIRST NAME, all capitals"],
  ["{last}", "last name, small letters"], ["{Last}", "Last name, capital first letter"], ["{username}", "the part of the email before @"], ["{Username}", "the same, capital first letter"],
  ["{code}", "employee code"], ["{phone4}", "last 4 digits of the phone"], ["{year}", "this year"],
] as const;

export type PasswordPerson = { name: string; email: string; phone?: string | null; code?: string | null };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function passwordFromFormat(format: string, p: PasswordPerson): string {
  const words = p.name.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);
  // "Mr. Daniyal Ahmed" → first name Daniyal; "Muhammad Ali Khan" → first Muhammad, last Khan.
  const clean = words.filter((w, i) => !(i === 0 && /^(mr|mrs|ms|dr|miss)$/i.test(w)));
  const first = clean[0] ?? "", last = clean.length > 1 ? clean[clean.length - 1]! : "";
  const digits = (p.phone ?? "").replace(/\D/g, "");
  const values: Record<string, string> = {
    "{first}": first.toLowerCase(), "{First}": cap(first), "{FIRST}": first.toUpperCase(),
    "{last}": last.toLowerCase(), "{Last}": cap(last), "{username}": (p.email.split("@")[0] ?? "").toLowerCase(), "{Username}": cap(p.email.split("@")[0] ?? ""),
    "{code}": p.code ?? "", "{phone4}": digits.slice(-4), "{year}": String(new Date().getFullYear()),
  };
  return format.replace(/\{(first|First|FIRST|last|Last|username|Username|code|phone4|year)\}/g, (t) => values[t] ?? "");
}

export const usesToken = (format: string) => /\{(first|First|FIRST|last|Last|username|Username|code|phone4)\}/.test(format);
