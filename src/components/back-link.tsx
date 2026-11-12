"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const DRAWER_PARAMS = ["new", "edit", "open", "members", "convert", "correct", "editPunch", "a", "import"];

const ID = "c[a-z0-9]{15,}"; // record ids (cuid), so sub-pages like /hr/payroll/payslips don't match
/** Detail pages that draw their own "← Leads" style link at the top. */
const OWN_BACK = [
  `^/crm/(companies|deals|leads|contacts)/${ID}$`, "^/crm/leads/new$", `^/crm/deals/[^/]+/payments$`,
  `^/hr/(employees|policies|performance|recruitment)/${ID}$`, "^/hr/payroll/\\d{4}-\\d{2}$", `^/calls/campaigns/${ID}$`,
  `^/settings/users/[^/]+/access$`, `^/settings/roles/${ID}$`, `^/inventory/(projects|units)/${ID}$`, `^/reports/agents/${ID}$`,
].map((s) => new RegExp(s));

type Page = { href: string; label: string };
type App = { key: string; name: string; home: string; prefixes: string[] };
const clean = (h: string) => h.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";

/**
 * "← Back" at the top left of every page, one level up each time:
 * a detail page or open form → its section page → the app's home (dashboard) → All apps.
 * e.g. an employee's payslip → Payslips → HR dashboard → All apps.
 */
export function BackLink({ pages, apps }: { pages: Page[]; apps: App[] }) {
  const path = clean(usePathname());
  const params = useSearchParams();
  // The app you're in (the sidebar remembers it in the "app" cookie). Read after mount so server and browser agree.
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => setLast(document.cookie.match(/(?:^|; )app=([^;]+)/)?.[1] ?? null), [path]);
  if (path === "/home" || OWN_BACK.some((re) => re.test(path))) return null;
  const drawer = DRAWER_PARAMS.some((k) => params.has(k));

  // Which app this page is in: the one you came from when it matches, else the closest prefix.
  const fit = (a: App) => Math.max(0, ...a.prefixes.map((p) => (path === p || path.startsWith(`${p}/`) ? p.length : 0)));
  const app = apps.find((a) => a.key === last && fit(a) > 0) ?? [...apps].filter((a) => fit(a) > 0).sort((a, b) => fit(b) - fit(a))[0] ?? apps.find((a) => a.key === last);
  const roots = new Map(pages.map((p) => [clean(p.href), p.label]));

  let target: string; let label: string;
  if (drawer) { target = path; label = roots.get(path) ?? "Back"; }
  else if (path.startsWith("/payslips/")) { target = app?.key === "me" ? "/me/payslips" : "/hr/payroll/payslips"; label = "Payslips"; }
  else if (!roots.has(path)) {
    const parent = [...roots.keys()].filter((r) => r !== "/" && path.startsWith(`${r}/`)).sort((a, b) => b.length - a.length)[0];
    target = parent ?? app?.home ?? "/home?all=1"; label = parent ? roots.get(parent)! : app ? app.name : "All apps";
  } else if (app && clean(app.home) !== path) { target = app.home; label = app.key === "me" ? "My Space" : `${app.name} dashboard`; }
  else { target = "/home?all=1"; label = "All apps"; }

  return (
    <Link href={target} className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-canvas hover:text-ink print:hidden">
      <ArrowLeft className="size-4" /> {label}
    </Link>
  );
}
