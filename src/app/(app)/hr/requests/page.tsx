import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { REQUEST_TYPES } from "@/lib/request-types";
import { Card, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Requests" };

/** Every kind of request an employee can raise; each goes through its approval chain. */
export default async function RequestsHome() {
  await requireUser();
  const fixed = [
    { href: "/me/leave", label: "Leave", description: "Apply for leave; balances update on approval." },
    { href: "/me/attendance", label: "Punch correction", description: "Forgot to check in or out? Request the right times." },
    { href: "/me/expenses", label: "Expense claim", description: "Claim fuel, travel or client-meeting costs." },
    { href: "/me/expenses#loans", label: "Loan / advance", description: "Ask for an advance, repaid from salary." },
  ];
  return (
    <>
      <PageHeader title="Requests" description="Choose what you need. Each request goes to its approvers and you're notified of the decision." actions={<LinkButton href="/approvals?tab=mine" variant="secondary">My requests</LinkButton>} />
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...fixed, ...REQUEST_TYPES.map((t) => ({ href: `/hr/requests/${t.slug}/new`, label: t.label, description: t.description }))].map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:border-navy-900/20 hover:shadow-md">
              <p className="font-medium">{r.label}</p>
              <p className="mt-1 text-sm text-muted">{r.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
