// What each column of an uploaded calling sheet probably is (client-safe: the browser reads the file now).
export const CALL_COLUMN_ROLES = [["phone", "Phone number"], ["phone2", "Second phone"], ["name", "Full name"], ["first", "First name"], ["last", "Last name"], ["detail", "Show to agent"], ["keep", "Keep, hide from agents"], ["skip", "Don't import"]] as const;

/** Best guesses: the first phone-like column is Phone, the next one Second phone, a name column is Name; the rest are shown to the agent. */
export function guessCallColumns(headers: string[], rows: Record<string, string>[]) {
  let phones = 0;
  const guess = headers.map((h) => {
    const looksPhone = /phone|mobile|cell|contact|whatsapp|number|tel/.test(h) && !/unit|plot|flat|cnic|passport|file|id$/.test(h);
    if (looksPhone && phones < 2) return phones++ === 0 ? "phone" : "phone2";
    if (/^first ?name|^given name|^fname$/.test(h)) return "first";
    if (/^last ?name|^surname|^family name|^lname$/.test(h)) return "last";
    if (/(^|\b)(full )?name$|^name\b|client|customer|buyer|owner name|contact name/.test(h) && !/project|unit|building|company|agent|developer|tower|file|deal(?! ?owner)/.test(h)) return "name";
    return "detail";
  });
  // One column per role: keep the first guess for name / first / last.
  for (const r of ["name", "first", "last"]) { let seen = false; guess.forEach((g, i) => { if (g === r) { if (seen) guess[i] = "detail"; seen = true; } }); }
  if (!guess.includes("phone")) {
    const i = headers.findIndex((h) => rows.slice(0, 20).some((r) => (r[h] ?? "").replace(/\D/g, "").length >= 9));
    if (i >= 0) guess[i] = "phone";
  }
  return guess;
}

const digits = (s: string) => s.replace(/\D/g, "").length;

/** The rows to import with the chosen column roles: phone (first real number of a cell), full name, and the details. */
export function buildCallRows(headers: string[], rows: Record<string, string>[], role: string[], label: string[]) {
  const pi = role.indexOf("phone"), p2 = role.indexOf("phone2"), ni = role.indexOf("name"), fi = role.indexOf("first"), li = role.indexOf("last");
  return rows.map((r) => {
    const v = (i: number) => (i >= 0 ? (r[headers[i]!] ?? "").trim() : "");
    const extra: Record<string, string> = {};
    role.forEach((x, i) => { if ((x === "detail" || x === "keep") && v(i)) extra[label[i]!] = v(i).slice(0, 500); });
    if (v(p2)) extra["Other phone"] = v(p2).slice(0, 100);
    const name = v(ni) || [v(fi), v(li)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    // A cell with several numbers ("0300… / 0321…"): the first real one.
    const phone = v(pi).split(/[/,;|\n]| or /i).map((x) => x.trim()).find((x) => digits(x) >= 7) ?? v(pi);
    return { phone: phone.slice(0, 40), name: name ? name.slice(0, 190) : null, extra: Object.keys(extra).length ? extra : null };
  }).filter((r) => digits(r.phone) >= 7); // a real number, not a name or a unit code
}
