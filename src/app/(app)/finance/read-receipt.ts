"use client";
export type ReadResult = { amount: number | null; date: string | null; payee: string | null; description: string | null; categoryId: string | null };

/** Sends the bill to /api/finance/receipt. Returns null when receipt reading is off. */
export async function readReceipt(file: File): Promise<ReadResult | { error: string } | null> {
  const fd = new FormData(); fd.append("file", file);
  const r = await fetch("/api/finance/receipt", { method: "POST", body: fd }).catch(() => null);
  if (!r) return { error: "No connection." };
  if (r.status === 404) return null;
  const j = await r.json().catch(() => ({ error: "Couldn't read the bill." }));
  return r.ok ? (j as ReadResult) : { error: j.error ?? "Couldn't read the bill." };
}

/** Fills empty fields of the form the input sits in (never overwrites what was typed). */
export function fillForm(form: HTMLFormElement | null, d: ReadResult) {
  if (!form) return;
  const set = (name: string, v: string | number | null) => {
    const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    if (!el || v == null || v === "" || (el.value && name !== "date")) return;
    el.value = String(v);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  set("amount", d.amount); set("party", d.payee); set("description", d.description); set("categoryId", d.categoryId); set("date", d.date);
}
