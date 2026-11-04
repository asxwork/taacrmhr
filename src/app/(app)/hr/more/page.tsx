import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { disabledFeatures, featureForPath } from "@/lib/features";
import { NAV_ICONS } from "@/components/nav-icons";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "More" };

const TILES: { href: string; label: string; about: string; icon: string; module?: string; superAdmin?: boolean }[] = [
  { href: "/hr/requests", label: "New request", about: "WFH, overtime, travel, tickets and more", icon: "chatplus" },
  { href: "/hr/recruitment", label: "Recruitment", about: "Openings and candidates", icon: "briefcase", module: "hr.recruitment" },
  { href: "/hr/performance", label: "Performance", about: "Appraisals and KPIs", icon: "trending", module: "hr.performance" },
  { href: "/hr/check-ins", label: "Monthly check-ins", about: "1:1 notes and goals each month", icon: "chatplus", module: "hr.checkins" },
  { href: "/org-chart", label: "Org chart", about: "Who reports to whom, with photos", icon: "hierarchy", module: "hr.orgchart" },
  { href: "/feed", label: "Feed", about: "Announcements and kudos", icon: "award" },
  { href: "/hr/probation", label: "Probation", about: "Reviews before confirmation", icon: "usercog", module: "hr.performance" },
  { href: "/hr/assets", label: "Assets", about: "Laptops, phones, cars given to staff", icon: "laptop", module: "hr.assets" },
  { href: "/hr/policies/manage", label: "Policies", about: "Documents and acknowledgements", icon: "shield", module: "hr.employees" },
  { href: "/hr/letters", label: "Letters", about: "Offer, experience and other letters", icon: "file", module: "hr.employees" },
  { href: "/hr/engagement", label: "Engagement", about: "Staff surveys", icon: "sparkles", module: "hr.employees" },
  { href: "/reports/hr", label: "HR reports", about: "Headcount, joiners, leavers, leave", icon: "chart", module: "reports.hr" },
  { href: "/hr/payroll/dashboard", label: "Payroll dashboard", about: "Cost trends and breakdowns", icon: "wallet", module: "hr.payroll" },
  { href: "/hr/payroll/vouchers", label: "Vouchers", about: "Bank and cash payment vouchers", icon: "receipt", module: "hr.payroll" },
  { href: "/hr/payroll/items/late-sittings", label: "Late sittings", about: "Extra-hours pay items", icon: "clock", module: "hr.payroll" },
  { href: "/hr/payroll/banks", label: "Disbursement banks", about: "Company bank accounts for salary", icon: "landmark", module: "hr.payroll" },
  { href: "/settings/hr", label: "HR settings", about: "Shifts, leave types, holidays, approvals, departments", icon: "sliders", module: "hr.employees" },
  { href: "/hr/settings/custom-fields", label: "Custom fields", about: "Extra fields on employee profiles", icon: "list", module: "hr.employees" },
];

/** HR → More: the less-used parts of HR as tiles (only what this person may open, and features that are on). */
export default async function MorePage() {
  const user = await requireUser();
  const off = await disabledFeatures();
  const tiles = TILES.filter((t) => (!t.module || can(user, t.module)) && (!t.superAdmin || user.isSuperAdmin) && !featureForPath(t.href, off));
  return (
    <>
      <PageHeader title="More" description="Everything else in HR." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const Icon = NAV_ICONS[t.icon] ?? NAV_ICONS.layout!;
          return (
            <Link key={t.href} href={t.href} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-navy-900/20 hover:bg-canvas/40">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-navy-900/5 text-navy-900"><Icon className="size-5" /></span>
              <span className="min-w-0"><span className="block font-medium">{t.label}</span><span className="block truncate text-xs text-muted">{t.about}</span></span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
