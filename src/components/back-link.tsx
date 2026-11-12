"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const DRAWER_PARAMS = ["new", "edit", "open", "members", "convert", "correct"];

/**
 * "← Back" at the top left of any page below a section (a profile, a form, "new leave"…): goes to the section the
 * page belongs to (e.g. /hr/requests/wfh/new → Requests, /me/leave?new=1 → Leave). Hidden on the section pages.
 */
const ID = "(?!new$)[^/]+";
const OWN_BACK = [
  `^/crm/(companies|deals|leads|contacts)/${ID}$`, "^/crm/leads/new$", `^/crm/deals/[^/]+/payments$`,
  `^/hr/(employees|policies|payroll|performance|recruitment)/${ID}$`, `^/calls/campaigns/${ID}$`,
  `^/settings/users/[^/]+/access$`, `^/settings/roles/${ID}$`, `^/inventory/(projects|units)/${ID}$`, `^/reports/agents/${ID}$`,
].map((s) => new RegExp(s));

export function BackLink({ roots }: { roots: string[] }) {
  const path = usePathname().replace(/\/+$/, "") || "/";
  const params = useSearchParams();
  const drawer = DRAWER_PARAMS.some((k) => params.has(k));
  if (OWN_BACK.some((re) => re.test(path))) return null; // these pages draw their own "← Leads" style link
  const isRoot = roots.includes(path);
  if (isRoot && !drawer) return null;
  // A drawer/form on a section page closes back to that page; a deeper page goes up to its nearest section.
  const target = isRoot ? path : roots.filter((r) => r !== "/" && path.startsWith(`${r}/`)).sort((a, b) => b.length - a.length)[0] ?? "/home";
  return (
    <Link href={target} className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:bg-canvas hover:text-ink print:hidden">
      <ArrowLeft className="size-4" /> Back
    </Link>
  );
}
