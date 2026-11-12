import Link from "@/components/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, Clock, Mail, MessageCircle, Send, UserPlus, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { APP_URL } from "@/lib/notify";
import { waHref } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { CopyButton } from "@/components/copy-button";
import { createInvite } from "./actions";

export const metadata = { title: "Onboarding links" };
type State = "waiting" | "submitted" | "expired";

/** HR → Onboarding links: send a new hire a link to fill in their own details, photo and CNIC. */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const user = await requirePermission("hr.onboarding");
  const filter = (await searchParams).s as State | undefined;
  const [invites, employees] = await Promise.all([
    db.onboardingInvite.findMany({ include: { employee: { select: { id: true, fullName: true, phone: true, personalEmail: true, photo: true, code: true, designation: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true }, orderBy: [{ joiningDate: "desc" }], take: 300 }),
  ]);
  const now = new Date();
  const stateOf = (i: (typeof invites)[number]): State => (i.submittedAt ? "submitted" : i.expiresAt < now ? "expired" : "waiting");
  const count = (s: State) => invites.filter((i) => stateOf(i) === s).length;
  const shown = filter ? invites.filter((i) => stateOf(i) === filter) : invites;
  const TILES = [["waiting", "Waiting", Clock, "text-amber-600 bg-amber-50"], ["submitted", "Submitted", CheckCircle2, "text-emerald-600 bg-emerald-50"], ["expired", "Expired", XCircle, "text-slate-500 bg-slate-100"]] as const;
  const message = (url: string) => `Welcome to The Advisor Associates! Please fill in your details for HR here: ${url}`;

  return (
    <>
      <PageHeader title="Onboarding links" description="Let a new hire fill in their own details: no login needed." />

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {([["1", "Add the employee", "In Employees, with name, phone and joining date.", UserPlus], ["2", "Create & send the link", "WhatsApp, email or copy it. It works once, for 14 days.", Send], ["3", "They fill it in", "Personal details, CNIC, photo, emergency contact, bank account.", CheckCircle2]] as const).map(([n, t, d, Icon]) => (
          <div key={n} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white">{n}</span>
            <div><p className="flex items-center gap-1.5 font-medium"><Icon className="size-4 text-muted" />{t}</p><p className="text-xs text-muted">{d}</p></div>
          </div>
        ))}
      </div>

      {can(user, "hr.onboarding", "create") && (
        <Card className="mb-5 p-4">
          <ActionForm action={createInvite} className="flex flex-wrap items-end gap-2">
            <label className="min-w-64 flex-1 text-sm"><span className="mb-1 block font-medium">New hire</span>
              <select name="employeeId" required className="input"><option value="">Choose an employee</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}{e.code ? ` · ${e.code}` : ""}</option>)}</select>
            </label>
            <SubmitButton><Send className="size-4" /> Create link</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        {TILES.map(([s, label, Icon, tone]) => (
          <Link key={s} href={filter === s ? "/hr/onboarding" : `/hr/onboarding?s=${s}`} className={cn("flex items-center gap-3 rounded-xl border bg-surface p-4 transition hover:shadow-md", filter === s ? "border-navy-900 ring-1 ring-navy-900" : "border-line")}>
            <span className={cn("flex size-10 items-center justify-center rounded-lg", tone)}><Icon className="size-5" /></span>
            <span><span className="block text-2xl font-semibold tabular-nums leading-none">{count(s)}</span><span className="mt-1 block text-xs text-muted">{label}</span></span>
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        {shown.length === 0 ? <EmptyState title={filter ? `No ${filter} links` : "No links yet"} description={filter ? undefined : "Create one above for your next new hire."} /> : (
          <ul className="divide-y divide-line">
            {shown.map((i) => {
              const url = `${APP_URL()}/onboard/${i.token}`;
              const st = stateOf(i);
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 text-sm">
                  <PersonAvatar name={i.employee.fullName} photo={i.employee.photo} className="size-10" />
                  <div className="min-w-48 flex-1">
                    <Link href={`/hr/employees/${i.employee.id}`} className="font-medium hover:underline">{i.employee.fullName}</Link>
                    <p className="text-xs text-muted">{[i.employee.code, i.employee.designation?.name].filter(Boolean).join(" · ")} · created {format(i.createdAt, "d MMM")}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st === "submitted" ? "bg-emerald-50 text-emerald-700" : st === "waiting" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>
                    {st === "submitted" ? `Submitted ${format(i.submittedAt!, "d MMM")}` : st === "waiting" ? `Waiting · ${formatDistanceToNowStrict(i.expiresAt)} left` : "Expired"}
                  </span>
                  {st === "waiting" && (
                    <span className="flex flex-wrap items-center gap-2">
                      <CopyButton text={url} />
                      {i.employee.phone && <a href={`${waHref(i.employee.phone)}?text=${encodeURIComponent(message(url))}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"><MessageCircle className="size-4" /> WhatsApp</a>}
                      {i.employee.personalEmail && <a href={`mailto:${i.employee.personalEmail}?subject=${encodeURIComponent("Your joining details")}&body=${encodeURIComponent(message(url))}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 hover:bg-canvas"><Mail className="size-4" /> Email</a>}
                    </span>
                  )}
                  {st === "submitted" && <Link href={`/hr/employees/${i.employee.id}`} className="text-sm font-medium text-navy-900 hover:underline">Review profile →</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
