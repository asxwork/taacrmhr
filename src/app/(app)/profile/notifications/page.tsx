import { Briefcase, Settings2, Target, UserPlus, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { scopeFor } from "@/lib/permissions";
import { EMAIL_MODES, notifyPrefs } from "@/lib/notify-prefs";
import { NOTIFY_CATEGORIES } from "@/lib/notify";
import { digestFor } from "@/lib/daily-digest";
import { SoundSetting } from "@/components/sound-setting";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveMyNotifications } from "./actions";

export const metadata = { title: "Notifications & emails" };

const CAT_ICON = { crm: Target, hr: Briefcase, finance: Wallet, system: Settings2 } as const;
const CAT_TONE = { crm: "bg-sky-100 text-sky-700", hr: "bg-violet-100 text-violet-700", finance: "bg-emerald-100 text-emerald-700", system: "bg-slate-100 text-slate-600" } as const;
const ABOUT: Record<string, string> = { crm: "Leads, deals, calls, inventory", hr: "Leave, attendance, requests, payslips", finance: "Expenses, approvals, cash", system: "Everything else" };

/** Profile → Notifications: how many emails you get (one daily summary by default) and which kinds you don't want. */
export default async function MyNotificationsPage() {
  const user = await requireUser();
  const prefs = await notifyPrefs(user.id);
  const preview = await digestFor(user.id).catch(() => null);
  // "Every new lead": for people who can see all leads (on by default for Super Admins).
  const canWatch = user.isSuperAdmin || scopeFor(user, "crm.leads") === "all";
  const allLeads = prefs.allLeads ?? user.isSuperAdmin;
  return (
    <>
      <PageHeader title="Notifications & emails" description="By default you get one email each morning with your day, instead of an email for every notification. Urgent things (overdue, failures, security) still come straight away." />
      {user.isSuperAdmin && <p className="mb-4 rounded-lg bg-sky-50 px-4 py-2.5 text-sm text-sky-800">As a Super Admin you get notifications about your own leads and deals, about yourself, urgent ones, and (if ticked below) every new lead that comes in; everyone else&apos;s activity stays in the app.</p>}
      <ActionForm action={saveMyNotifications} className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Email</h2>
          <div className="space-y-2">
            {EMAIL_MODES.map(([v, label, about]) => (
              <label key={v} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-[:checked]:border-navy-900 has-[:checked]:bg-navy-900/[0.04]">
                <input type="radio" name="email" value={v} defaultChecked={prefs.email === v} className="mt-1 accent-navy-900" />
                <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted">{about}</span></span>
              </label>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Mute</h2>
          <p className="mb-3 text-xs text-muted">Muted kinds don&apos;t notify you at all (urgent ones still do).</p>
          <div className="space-y-1">
            {NOTIFY_CATEGORIES.map(([k, label]) => {
              const Icon = CAT_ICON[k];
              return (
              <label key={k} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-canvas">
                <input type="checkbox" name={`mute:${k}`} defaultChecked={prefs.muted.includes(k)} className="accent-navy-900" />
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${CAT_TONE[k]}`}><Icon className="size-4" /></span>
                <span className="flex-1"><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted">{ABOUT[k]}</span></span>
              </label>
              );
            })}
          </div>
          {canWatch && (
            <div className="mt-4 border-t border-line pt-3">
              <input type="hidden" name="allLeadsShown" value="1" />
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-canvas">
                <input type="checkbox" name="allLeads" defaultChecked={allLeads} className="accent-navy-900" />
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><UserPlus className="size-4" /></span>
                <span className="flex-1"><span className="block text-sm font-medium">Every new lead</span><span className="block text-xs text-muted">A notification (with sound) for each new lead from the API, website, Facebook or portals, whoever it&apos;s given to.</span></span>
              </label>
            </div>
          )}
          <div className="mt-4"><SubmitButton>Save</SubmitButton></div>
        </Card>
      </ActionForm>
      <Card className="mt-5 p-5">
        <h2 className="mb-3 font-semibold">Sound</h2>
        <SoundSetting />
      </Card>
      <Card className="mt-5 p-5">
        <h2 className="mb-1 font-semibold">Your next summary email</h2>
        <p className="mb-3 text-xs text-muted">What tomorrow morning&apos;s email would say if it went out now.</p>
        {preview ? <pre className="whitespace-pre-wrap rounded-lg bg-canvas p-4 font-sans text-sm leading-relaxed">{`${preview.subject}\n\n${preview.body.replace(/https?:\/\/\S+/g, "[button]")}`}</pre> : <p className="text-sm text-muted">Nothing to send right now. You only get the email on days there is something for you.</p>}
      </Card>
    </>
  );
}
