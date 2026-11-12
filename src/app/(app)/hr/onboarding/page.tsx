import Link from "@/components/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CheckCircle2, Clock, FileSearch, Mail, MessageCircle, RotateCcw, Send, UserPlus, XCircle } from "lucide-react";
import { ONB_FIELDS, ONB_SECTIONS, onbStatus } from "@/lib/onboarding";
import { fileUrl } from "@/lib/files";
import { Drawer, Field } from "@/components/ui";
import { db } from "@/lib/db";
import { can, requirePermission } from "@/lib/permissions";
import { APP_URL } from "@/lib/notify";
import { waHref } from "@/lib/crm-shared";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PersonAvatar } from "@/components/person-avatar";
import { CopyButton } from "@/components/copy-button";
import { createInvite, reviewOnboarding } from "./actions";

export const metadata = { title: "Onboarding links" };
type State = "waiting" | "review" | "sent-back" | "approved" | "expired";

/** HR → Onboarding links: send a new hire a link to fill in their own details, photo and CNIC. */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ s?: string; mode?: string; review?: string }> }) {
  const user = await requirePermission("hr.onboarding");
  const sp = await searchParams;
  const filter = sp.s as State | undefined;
  const mode = sp.mode === "existing" ? "existing" : "new";
  const [invites, employees] = await Promise.all([
    db.onboardingInvite.findMany({ include: { employee: { select: { id: true, fullName: true, phone: true, personalEmail: true, photo: true, code: true, designation: { select: { name: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.employee.findMany({ where: { status: { not: "left" } }, select: { id: true, fullName: true, code: true }, orderBy: [{ joiningDate: "desc" }], take: 300 }),
  ]);
  const now = new Date();
  const stateOf = (i: (typeof invites)[number]): State => {
    const st = onbStatus(i);
    return st === "submitted" ? "review" : st === "approved" ? "approved" : i.expiresAt < now ? "expired" : st === "rejected" ? "sent-back" : "waiting";
  };
  const reviewing = sp.review ? invites.find((i) => i.id === sp.review) : undefined;
  const canReview = can(user, "hr.onboarding", "edit");
  const count = (s: State) => invites.filter((i) => stateOf(i) === s).length;
  const shown = filter ? invites.filter((i) => stateOf(i) === filter) : invites;
  const TILES = [["review", "To review", FileSearch, "text-violet-600 bg-violet-50"], ["waiting", "Waiting for them", Clock, "text-amber-600 bg-amber-50"], ["sent-back", "Sent back to fix", RotateCcw, "text-red-600 bg-red-50"], ["approved", "Approved", CheckCircle2, "text-emerald-600 bg-emerald-50"], ["expired", "Expired", XCircle, "text-slate-500 bg-slate-100"]] as const;
  const message = (url: string) => `Welcome to The Advisor Associates! Please fill in your details for HR here: ${url}`;

  return (
    <>
      <PageHeader title="Onboarding links" description="Let a new hire fill in their own details: no login needed." />

      <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        {([["1", "Create the link", "Type the new hire's first and last name, or pick an existing employee.", UserPlus], ["2", "Send it", "WhatsApp, email or copy it. They fill in every field, with CNIC and photo.", Send], ["3", "Review & approve", "Approve and it goes onto their profile, or send back what's wrong to fix.", CheckCircle2]] as const).map(([n, t, d, Icon]) => (
          <div key={n} className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white">{n}</span>
            <div><p className="flex items-center gap-1.5 font-medium"><Icon className="size-4 text-muted" />{t}</p><p className="text-xs text-muted">{d}</p></div>
          </div>
        ))}
      </div>

      {can(user, "hr.onboarding", "create") && (
        <Card className="mb-5 p-4">
          <div className="mb-3 flex w-fit rounded-lg bg-black/5 p-0.5 text-sm">
            {([["new", "New employee"], ["existing", "Existing employee"]] as const).map(([m, label]) => (
              <Link key={m} href={m === "new" ? "/hr/onboarding" : "/hr/onboarding?mode=existing"} scroll={false} className={cn("rounded-md px-3 py-1.5", mode === m ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink")}>{label}</Link>
            ))}
          </div>
          <ActionForm action={createInvite} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="mode" value={mode} />
            {mode === "new" ? (
              <>
                <label className="min-w-44 flex-1 text-sm"><span className="mb-1 block font-medium">First name</span><input name="firstName" required className="input" placeholder="e.g. Ahmed" /></label>
                <label className="min-w-44 flex-1 text-sm"><span className="mb-1 block font-medium">Last name</span><input name="lastName" required className="input" placeholder="e.g. Khan" /></label>
              </>
            ) : (
              <label className="min-w-64 flex-1 text-sm"><span className="mb-1 block font-medium">Employee</span>
                <select name="employeeId" required className="input"><option value="">Choose an employee</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}{e.code ? ` · ${e.code}` : ""}</option>)}</select>
              </label>
            )}
            <SubmitButton><Send className="size-4" /> Create link</SubmitButton>
          </ActionForm>
          {mode === "new" && <p className="mt-2 text-xs text-muted">Creates the employee (joining today, on probation) and the link. Set their department, designation and salary later on their profile.</p>}
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
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
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", { review: "bg-violet-50 text-violet-700", approved: "bg-emerald-50 text-emerald-700", waiting: "bg-amber-50 text-amber-700", "sent-back": "bg-red-50 text-red-700", expired: "bg-slate-100 text-slate-600" }[st])}>
                    {st === "review" ? `Submitted ${format(i.submittedAt!, "d MMM")} · to review` : st === "approved" ? "Approved" : st === "sent-back" ? `Sent back · ${formatDistanceToNowStrict(i.expiresAt)} left` : st === "waiting" ? `Waiting · ${formatDistanceToNowStrict(i.expiresAt)} left` : "Expired"}
                  </span>
                  {st === "review" && canReview && <Link href={`/hr/onboarding?review=${i.id}`} scroll={false} className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-navy-800"><FileSearch className="size-4" /> Review</Link>}
                  {(st === "waiting" || st === "sent-back") && (
                    <span className="flex flex-wrap items-center gap-2">
                      <CopyButton text={url} />
                      {i.employee.phone && <a href={`${waHref(i.employee.phone)}?text=${encodeURIComponent(message(url))}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700"><MessageCircle className="size-4" /> WhatsApp</a>}
                      {i.employee.personalEmail && <a href={`mailto:${i.employee.personalEmail}?subject=${encodeURIComponent("Your joining details")}&body=${encodeURIComponent(message(url))}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 hover:bg-canvas"><Mail className="size-4" /> Email</a>}
                    </span>
                  )}
                  {st === "approved" && <Link href={`/hr/employees/${i.employee.id}`} className="text-sm font-medium text-navy-900 hover:underline">Open profile →</Link>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {reviewing && canReview && reviewing.payload && (() => {
        const p = JSON.parse(reviewing.payload) as Record<string, string>;
        const isImg = (path: string) => /\.(jpe?g|png|webp|gif)$/i.test(path);
        /* eslint-disable @next/next/no-img-element -- uploaded files shown as-is for HR to check */
        return (
          <Drawer title={`Review · ${p.firstName} ${p.lastName}`} closeHref="/hr/onboarding" width="max-w-2xl">
            <p className="mb-4 text-sm text-muted">Check each detail. If everything is right, approve. If something is wrong, tick it below and send it back: they get the same link with those fields marked.</p>
            <ActionForm action={reviewOnboarding} className="mb-4">
              <input type="hidden" name="id" value={reviewing.id} /><input type="hidden" name="op" value="approve" />
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"><CheckCircle2 className="size-4" /> All correct: approve &amp; add to profile</button>
            </ActionForm>
            <ActionForm action={reviewOnboarding} className="space-y-5">
              <input type="hidden" name="id" value={reviewing.id} /><input type="hidden" name="op" value="reject" />
              {ONB_SECTIONS.map((sec) => (
                <div key={sec}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{sec}</p>
                  <div className="divide-y divide-line rounded-lg border border-line">
                    {ONB_FIELDS.filter((f) => f.section === sec).map((f) => (
                      <label key={f.key} className="flex items-center gap-3 px-3 py-2 text-sm has-[:checked]:bg-red-50">
                        <span className="w-44 shrink-0 text-muted">{f.label}</span>
                        <span className="min-w-0 flex-1 font-medium">
                          {f.kind === "file" ? (p[f.key] ? <a href={fileUrl(p[f.key]!)} target="_blank" rel="noreferrer" className="inline-block">{isImg(p[f.key]!) ? <img src={fileUrl(p[f.key]!)} alt={f.label} className="h-16 rounded border border-line object-cover" /> : <span className="text-navy-900 underline">Open file</span>}</a> : <span className="text-muted">—</span>)
                            : f.options ? f.options.find(([v]) => v === p[f.key])?.[1] ?? p[f.key] : p[f.key] || "—"}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-red-700"><input type="checkbox" name="wrong" value={f.key} className="accent-red-600" /> Wrong</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <Field label="Note to the new hire (optional)"><textarea name="note" rows={2} className="input" placeholder="e.g. The CNIC photo is blurry, please take it again" /></Field>
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"><RotateCcw className="size-4" /> Send back to fix the ticked fields</button>
            </ActionForm>
          </Drawer>
        );
      })()}
    </>
  );
}
