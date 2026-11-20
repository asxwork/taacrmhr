import { requireUser } from "@/lib/auth";
import { EMAIL_MODES, notifyPrefs } from "@/lib/notify-prefs";
import { NOTIFY_CATEGORIES } from "@/lib/notify";
import { digestFor } from "@/lib/daily-digest";
import { SoundSetting } from "@/components/sound-setting";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveMyNotifications } from "./actions";

export const metadata = { title: "Notifications & emails" };

const ABOUT: Record<string, string> = { crm: "Leads, deals, calls, inventory", hr: "Leave, attendance, requests, payslips", finance: "Expenses, approvals, cash", system: "Everything else" };

/** Profile → Notifications: how many emails you get (one daily summary by default) and which kinds you don't want. */
export default async function MyNotificationsPage() {
  const user = await requireUser();
  const prefs = await notifyPrefs(user.id);
  const preview = await digestFor(user.id).catch(() => null);
  return (
    <>
      <PageHeader title="Notifications & emails" description="By default you get one email each morning with your day, instead of an email for every notification. Urgent things (overdue, failures, security) still come straight away." />
      {user.isSuperAdmin && <p className="mb-4 rounded-lg bg-sky-50 px-4 py-2.5 text-sm text-sky-800">As a Super Admin you only get notifications about your own leads and deals, about yourself, and urgent ones; everyone else&apos;s activity stays in the app.</p>}
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
            {NOTIFY_CATEGORIES.map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-canvas">
                <input type="checkbox" name={`mute:${k}`} defaultChecked={prefs.muted.includes(k)} className="accent-navy-900" />
                <span className="flex-1"><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted">{ABOUT[k]}</span></span>
              </label>
            ))}
          </div>
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
