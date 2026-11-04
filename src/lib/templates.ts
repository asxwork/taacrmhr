// Message templates: ready-made WhatsApp / email texts with {placeholders}. Client-safe.
export const TEMPLATE_PLACEHOLDERS = [
  ["{first_name}", "Lead's first name"],
  ["{name}", "Lead's full name"],
  ["{agent}", "Your name"],
  ["{agent_phone}", "Your phone"],
  ["{project}", "Project they asked about"],
  ["{unit}", "Unit they asked about"],
  ["{company}", "Company name"],
] as const;

export function renderTemplate(body: string, vars: Record<string, string | null | undefined>) {
  return body.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] ?? "" : m)).replace(/[ \t]{2,}/g, " ").trim();
}
