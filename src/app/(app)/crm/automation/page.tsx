import Link from "@/components/link";
import { redirect } from "next/navigation";
import { formatDistanceToNowStrict, subDays } from "date-fns";
import { ArrowRight, Bolt, Clock, Megaphone, FileSpreadsheet, Globe, Plug, Plus, Send, Trash2, Webhook, Zap } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { APP_URL } from "@/lib/notify";
import { HOOK_EVENTS, TRIGGERS, ruleActions, ruleConditions, EMPTY_ACTIONS, EMPTY_CONDITIONS, type RuleActions, type RuleConditions } from "@/lib/lead-rules";
import { getSetting, INTAKE_KEYS } from "@/lib/lead-intake";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Drawer, EmptyState, Field, PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { deleteHook, deleteRule, saveHook, saveRule, sendTestLead, testHook, toggleRule } from "./actions";

export const metadata = { title: "Automation hub · CRM" };

type SP = { tab?: string; edit?: string; new?: string; hook?: string };
const TABS = [["overview", "Lead sources"], ["rules", "Rules"], ["webhooks", "Send to other apps"], ["log", "Log"]] as const;

/** Ready-made rules: one click fills the form. */
const TEMPLATES: Record<string, { name: string; trigger: string; c: Partial<RuleConditions>; a: Partial<RuleActions>; why: string }> = {
  speed: { name: "Speed to lead: reassign if not called in 15 minutes", trigger: "uncontacted", c: { minutes: 15 }, a: { assign: "roundrobin", task: "Call the client now", notifyOwner: true }, why: "A new lead nobody called in 15 minutes goes to the next agent, with a call task." },
  facebook: { name: "Facebook & Instagram leads to the social team", trigger: "created", c: {}, a: { assign: "roundrobin", task: "Call within 5 minutes", taskMinutes: 5 }, why: "Leads from chosen sources are shared round-robin between chosen agents." },
  quiet: { name: "Quiet for 2 days: remind the agent", trigger: "idle", c: { hours: 48 }, a: { task: "Follow up: no contact for 2 days", notifyOwner: true }, why: "No activity for 48 hours: the owner gets a follow-up task and an alert." },
  visit: { name: "Site visit booked: tell the manager", trigger: "stage", c: {}, a: { notifyOwner: false, task: "Confirm the site visit with the client", taskMinutes: 60 }, why: "When a lead reaches a stage, chosen people are told and a task is planned." },
  welcome: { name: "Welcome email to new leads", trigger: "created", c: {}, a: { emailSubject: "Thank you for your interest, {first_name}", emailBody: "Dear {name},\n\nThank you for contacting The Advisor Associates. {agent} will call you shortly.\n\nRegards,\nThe Advisor Associates", notifyOwner: false }, why: "Leads with an email get a thank-you email straight away." },
};

export default async function AutomationHub({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!user.isSuperAdmin && !can(user, "settings.company", "edit")) redirect("/no-access");
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : "overview";
  const origin = APP_URL();
  const since = subDays(new Date(), 7);
  const [rules, hooks, logs, sources, stages, users, connections, weekLogs, formKey] = await Promise.all([
    db.leadRule.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.outgoingHook.findMany({ orderBy: { createdAt: "asc" } }),
    db.webhookLog.findMany({ orderBy: { createdAt: "desc" }, take: 120 }),
    db.leadSource.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    db.leadStatus.findMany({ where: { active: true, kind: "open" }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, systemKey: true } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.apiConnection.findMany({ orderBy: { createdAt: "asc" } }),
    db.webhookLog.findMany({ where: { createdAt: { gte: since }, status: { in: ["created", "merged"] } }, select: { source: true, status: true, createdAt: true } }),
    getSetting(INTAKE_KEYS.webformKey),
  ]);
  const fbReady = !!(process.env.FB_APP_SECRET && process.env.FB_PAGE_TOKEN);
  const count = (pred: (s: string) => boolean) => weekLogs.filter((l) => pred(l.source)).length;
  const editing = sp.edit ? rules.find((r) => r.id === sp.edit) : null;
  const tpl = sp.new && sp.new !== "1" ? TEMPLATES[sp.new] : null;
  const c: RuleConditions = editing ? ruleConditions(editing.conditions) : { ...EMPTY_CONDITIONS, ...tpl?.c };
  const a: RuleActions = editing ? ruleActions(editing.actions) : { ...EMPTY_ACTIONS, ...tpl?.a };
  const trigger = editing?.trigger ?? tpl?.trigger ?? "created";
  const hookEditing = sp.hook && sp.hook !== "new" ? hooks.find((h) => h.id === sp.hook) : null;
  const name = (id: string, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name ?? "?";
  const sentence = (r: (typeof rules)[number]) => {
    const rc = ruleConditions(r.conditions), ra = ruleActions(r.actions);
    const when = r.trigger === "created" ? "When a lead arrives" : r.trigger === "stage" ? `When a lead moves to ${rc.stageIds.map((s) => name(s, stages)).join(" or ")}` : r.trigger === "uncontacted" ? `When nobody contacts a new lead in ${rc.minutes} min` : `When a lead has no activity for ${rc.hours} h`;
    const only = [rc.sourceIds.length && `from ${rc.sourceIds.map((s) => name(s, sources)).join(", ")}`, rc.words && `mentioning “${rc.words}”`, rc.interests.length && `wanting to ${rc.interests.join("/")}`].filter(Boolean).join(", ");
    const then = [ra.assign !== "none" && `${ra.assign === "user" ? "give it to" : ra.assign === "leastloaded" ? "give it to the least busy of" : "share it round-robin between"} ${ra.userIds.map((u) => name(u, users)).join(", ")}`, ra.stageId && `move it to ${name(ra.stageId, stages)}`, ra.task && `plan “${ra.task}”`, ra.emailSubject && "email the client", ra.note && "add a note", (ra.notifyOwner || ra.notifyUserIds.length) && "send alerts"].filter(Boolean).join(", ");
    return `${when}${only ? ` ${only}` : ""}: ${then || "nothing yet"}.`;
  };
  const tabLink = (t: string) => `/crm/automation${t === "overview" ? "" : `?tab=${t}`}`;
  const appsScript = `function onFormSubmit(e) {
  // Google Sheet → AMS: Extensions → Apps Script, paste, then Triggers → On form submit (or On change).
  var row = e.namedValues || {};
  var lead = { name: (row["Name"] || [""])[0], phone: (row["Phone"] || [""])[0], email: (row["Email"] || [""])[0],
               message: (row["Message"] || [""])[0], source: "Website", campaign: "Google Sheet" };
  UrlFetchApp.fetch("${origin}/api/v1/leads", { method: "post", contentType: "application/json",
    headers: { Authorization: "Bearer YOUR_API_KEY" }, payload: JSON.stringify(lead), muteHttpExceptions: true });
}`;

  return (
    <>
      <PageHeader title="Automation hub" description="Every way leads come into AMS, the rules that act on them by themselves, and alerts to your other apps." />
      <div className="mb-5 flex max-w-full overflow-x-auto rounded-lg bg-black/5 p-0.5 sm:w-fit">
        {TABS.map(([t, l]) => <Link key={t} href={tabLink(t)} className={cn("shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-sm", t === tab ? "bg-surface font-medium shadow-xs" : "text-muted")}>{l}{t === "rules" && rules.length ? ` (${rules.filter((r) => r.active).length})` : ""}</Link>)}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              { icon: Globe, title: "Website form", ok: !!formKey, n: count((s) => s === "webform"), body: "Your website's enquiry form posts straight into AMS.", href: "/settings/integrations#website-form", cta: "Form code" },
              { icon: Megaphone, title: "Facebook & Instagram Lead Ads", ok: fbReady, n: count((s) => s === "facebook"), body: fbReady ? "Connected: every new ad lead arrives in seconds." : "Needs the Facebook app keys on the server.", href: "/settings/integrations#facebook-instagram-lead-ads", cta: fbReady ? "Settings" : "How to connect" },
              { icon: Plug, title: "Portals & apps (API)", ok: connections.some((x) => x.active), n: count((s) => s.startsWith("api:")), body: `${connections.filter((x) => x.active).length} connection${connections.length === 1 ? "" : "s"}: Zameen, Graana, OLX, a call centre or any system that can send a web request.`, href: "/settings/integrations#api-connections", cta: "Add connection" },
            ].map((ch) => (
              <Card key={ch.title} className="flex flex-col p-5">
                <div className="mb-2 flex items-center gap-2"><ch.icon className="size-5 text-navy-900" /><p className="flex-1 font-medium">{ch.title}</p>{ch.ok ? <Badge tone="green">On</Badge> : <Badge>Not set</Badge>}</div>
                <p className="flex-1 text-sm text-muted">{ch.body}</p>
                <div className="mt-3 flex items-center justify-between text-sm"><span className="text-muted">{ch.n} lead{ch.n === 1 ? "" : "s"} this week</span><Link href={ch.href} className="inline-flex items-center gap-1 font-medium text-navy-900 hover:underline">{ch.cta} <ArrowRight className="size-3.5" /></Link></div>
              </Card>
            ))}
          </div>
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2"><Zap className="size-5 text-amber-500" /><p className="font-medium">Zapier, Make or n8n (connect anything)</p></div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              <li>In Settings → Integrations, <Link href="/settings/integrations#api-connections" className="font-medium underline">make an API connection</Link> (e.g. “Zapier”) and copy its key.</li>
              <li>In Zapier / Make, pick the trigger: a new Google Sheet row, a Gmail email from Zameen, a Typeform, a TikTok lead form…</li>
              <li>Add the action <b>Webhooks → POST</b> to <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">{origin}/api/v1/leads</code> with header <code className="rounded bg-canvas px-1.5 py-0.5 text-xs">Authorization: Bearer YOUR_KEY</code>.</li>
              <li>Send the fields <code className="text-xs">name, phone, email, message, source, campaign, location, budget</code>. Other names (full_name, mobile, whatsapp…) are understood too.</li>
            </ol>
            <p className="mt-3 text-xs text-muted">The same phone or email within an open lead is added to that lead instead of making a duplicate. New leads are shared round-robin, then your rules run.</p>
          </Card>
          <Card className="p-5">
            <div className="mb-2 flex items-center gap-2"><FileSpreadsheet className="size-5 text-emerald-600" /><p className="font-medium">Google Sheets / Google Forms (no Zapier needed)</p></div>
            <p className="mb-2 text-sm text-muted">Paste this into the sheet&apos;s Apps Script, put your API key in place of YOUR_API_KEY and add the trigger. Each new form answer becomes a lead.</p>
            <pre className="max-h-64 overflow-auto rounded-lg bg-navy-950 p-3 text-xs leading-relaxed text-white/90"><code>{appsScript}</code></pre>
          </Card>
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2"><Send className="size-5 text-navy-900" /><p className="font-medium">Test the whole setup</p></div>
            <ActionForm action={sendTestLead} className="flex flex-wrap items-end gap-3">
              <Field label="Name"><input name="name" defaultValue="Test Lead (automation)" className="input w-56" /></Field>
              <Field label="Source"><select name="source" className="input w-40">{sources.map((s) => <option key={s.id}>{s.name}</option>)}</select></Field>
              <SubmitButton>Send a test lead</SubmitButton>
            </ActionForm>
            <p className="mt-2 text-xs text-muted">It goes through the same steps as a real lead (duplicate check, round-robin, your rules, your webhooks). Delete it afterwards from Leads.</p>
          </Card>
        </div>
      )}

      {tab === "rules" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/crm/automation?tab=rules&new=1" scroll={false} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800"><Plus className="size-4" /> New rule</Link>
            <span className="text-sm text-muted">or start from:</span>
            {Object.entries(TEMPLATES).map(([k, t]) => <Link key={k} href={`/crm/automation?tab=rules&new=${k}`} scroll={false} title={t.why} className="rounded-full border border-line px-3 py-1 text-xs hover:bg-canvas">{t.name.split(":")[0]}</Link>)}
          </div>
          <Card className="overflow-hidden">
            {rules.length === 0 ? <EmptyState title="No rules yet" description="Rules act on leads by themselves: share new leads, reassign leads nobody called, remind agents, tell managers, email the client." /> : (
              <ul className="divide-y divide-line">
                {rules.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <Bolt className={cn("mt-0.5 size-5 shrink-0", r.active ? "text-amber-500" : "text-muted")} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/crm/automation?tab=rules&edit=${r.id}`} scroll={false} className="font-medium hover:underline">{r.name}</Link>
                      <p className="text-sm text-muted">{sentence(r)}</p>
                      <p className="text-xs text-muted">{r.runs} run{r.runs === 1 ? "" : "s"}{r.lastRunAt ? ` · last ${formatDistanceToNowStrict(r.lastRunAt)} ago` : ""}</p>
                    </div>
                    <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><button className={cn("rounded-full px-3 py-1 text-xs font-medium", r.active ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-muted")}>{r.active ? "On" : "Off"}</button></form>
                    <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><button className="p-1 text-muted hover:text-red-600" aria-label="Delete rule"><Trash2 className="size-4" /></button></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <p className="flex items-center gap-1.5 text-xs text-muted"><Clock className="size-3.5" /> Timed rules (not contacted, quiet) run with the every-10-minutes job (the attendance machine cron link) and once a day.</p>
        </div>
      )}

      {tab === "webhooks" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">AMS sends a message to another app when something happens: add the lead to a Google Sheet, post to a WhatsApp tool, update another CRM. Paste the “Catch hook” URL from Zapier or Make.</p>
          <Link href="/crm/automation?tab=webhooks&hook=new" scroll={false} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-navy-900 px-4 text-sm font-medium text-white hover:bg-navy-800"><Plus className="size-4" /> Add webhook</Link>
          <Card className="overflow-hidden">
            {hooks.length === 0 ? <EmptyState title="No webhooks" description="Nothing is sent to other apps yet." /> : (
              <ul className="divide-y divide-line">
                {hooks.map((h) => (
                  <li key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Webhook className={cn("size-5", h.active ? "text-navy-900" : "text-muted")} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/crm/automation?tab=webhooks&hook=${h.id}`} scroll={false} className="font-medium hover:underline">{h.name}</Link>{!h.active && <Badge tone="red">Off after failures</Badge>}
                      <p className="truncate text-xs text-muted">{h.url}</p>
                      <p className="text-xs text-muted">{h.events.split(",").map((e) => HOOK_EVENTS.find(([k]) => k === e)?.[1] ?? e).join(" · ")}{h.lastAt ? ` · last ${h.lastStatus} ${formatDistanceToNowStrict(h.lastAt)} ago` : ""}</p>
                    </div>
                    <form action={testHook}><input type="hidden" name="id" value={h.id} /><button className="rounded-md border border-line px-2.5 py-1 text-xs hover:bg-canvas">Send test</button></form>
                    <form action={deleteHook}><input type="hidden" name="id" value={h.id} /><button className="p-1 text-muted hover:text-red-600" aria-label="Delete webhook"><Trash2 className="size-4" /></button></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {hooks.length > 0 && <p className="text-xs text-muted">Each message is JSON with <code>event</code>, <code>at</code> and <code>data</code>. To check it came from AMS, compare header <code>X-AMS-Signature</code> with HMAC-SHA256 of the body using the webhook&apos;s secret (shown when you open it).</p>}
        </div>
      )}

      {tab === "log" && (
        <Card className="overflow-x-auto">
          {logs.length === 0 ? <EmptyState title="Nothing yet" description="Incoming leads, rule runs and webhook sends appear here." /> : (
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-canvas/60 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">From</th><th className="px-4 py-2.5">Result</th><th className="px-4 py-2.5">What happened</th></tr></thead>
              <tbody className="divide-y divide-line">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{formatDistanceToNowStrict(l.createdAt)} ago</td>
                    <td className="px-4 py-2">{l.source.startsWith("rule:") ? <span className="inline-flex items-center gap-1"><Bolt className="size-3.5 text-amber-500" />{l.source.slice(5)}</span> : l.source.startsWith("out:") ? <span className="inline-flex items-center gap-1"><Webhook className="size-3.5" />{l.source.slice(4)}</span> : l.source.replace(/^api:/, "")}</td>
                    <td className="px-4 py-2"><Badge tone={["created", "ran", "sent"].includes(l.status) ? "green" : l.status === "merged" ? "navy" : l.status === "failed" ? "red" : "neutral"}>{l.status}</Badge></td>
                    <td className="px-4 py-2">{l.leadId ? <Link href={`/crm/leads/${l.leadId}`} className="hover:underline">{l.summary}</Link> : l.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {(sp.new || editing) && tab === "rules" && (
        <Drawer title={editing ? `Edit rule` : "New rule"} closeHref="/crm/automation?tab=rules" width="max-w-2xl">
          {tpl && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{tpl.why} Choose the people / sources, then save.</p>}
          <ActionForm action={saveRule} className="space-y-5">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Name"><input name="name" required defaultValue={editing?.name ?? tpl?.name ?? ""} placeholder="e.g. Zameen leads to the DHA team" className="input" /></Field>
            <fieldset className="rounded-lg border border-line p-4">
              <legend className="px-1 text-sm font-semibold">1 · When</legend>
              <div className="space-y-2">{TRIGGERS.map(([k, l, hint]) => <label key={k} className="flex items-start gap-2 text-sm"><input type="radio" name="trigger" value={k} defaultChecked={trigger === k} className="mt-1 accent-navy-900" /><span><span className="font-medium">{l}</span><span className="block text-xs text-muted">{hint}</span></span></label>)}</div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Minutes (not contacted)"><input name="minutes" type="number" min={1} defaultValue={c.minutes} className="input" /></Field>
                <Field label="Hours (quiet)"><input name="hours" type="number" min={1} defaultValue={c.hours} className="input" /></Field>
              </div>
            </fieldset>
            <fieldset className="rounded-lg border border-line p-4">
              <legend className="px-1 text-sm font-semibold">2 · Only for (leave empty for every lead)</legend>
              <p className="mb-1.5 text-sm font-medium">Sources</p>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">{sources.map((s) => <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" name="sourceIds" value={s.id} defaultChecked={c.sourceIds.includes(s.id)} className="accent-navy-900" />{s.name}</label>)}</div>
              <p className="mb-1.5 text-sm font-medium">Stages <span className="font-normal text-muted">(for “moves to a stage”: the stage it moves to)</span></p>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">{stages.filter((s) => s.systemKey !== "onhold").map((s) => <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" name="stageIds" value={s.id} defaultChecked={c.stageIds.includes(s.id)} className="accent-navy-900" />{s.name}</label>)}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Words in campaign / location / notes" hint="Comma separated, e.g. DHA, Bahria, 10 marla"><input name="words" defaultValue={c.words} className="input" /></Field>
                <div><p className="mb-1.5 text-sm font-medium">Wants to</p><div className="flex flex-wrap gap-3 text-sm">{["buy", "rent", "invest", "sell"].map((i) => <label key={i} className="flex items-center gap-1.5"><input type="checkbox" name="interests" value={i} defaultChecked={c.interests.includes(i)} className="accent-navy-900" />{i}</label>)}</div></div>
              </div>
            </fieldset>
            <fieldset className="rounded-lg border border-line p-4">
              <legend className="px-1 text-sm font-semibold">3 · Then</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Give the lead to">
                  <select name="assign" defaultValue={a.assign} className="input"><option value="none">Keep the owner</option><option value="roundrobin">Next agent in turn (round-robin)</option><option value="leastloaded">The agent with the fewest open leads</option><option value="user">One person</option></select>
                </Field>
                <Field label="Move to stage"><select name="stageId" defaultValue={a.stageId} className="input"><option value="">Don&apos;t change</option>{stages.filter((s) => s.systemKey !== "onhold").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              </div>
              <p className="mb-1.5 mt-3 text-sm font-medium">Agents (for giving the lead)</p>
              <div className="mb-3 flex max-h-40 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto text-sm">{users.map((u) => <label key={u.id} className="flex items-center gap-1.5"><input type="checkbox" name="userIds" value={u.id} defaultChecked={a.userIds.includes(u.id)} className="accent-navy-900" />{u.name}</label>)}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <Field label="Plan a task for the owner"><input name="task" defaultValue={a.task} placeholder="e.g. Call the client" className="input" /></Field>
                <Field label="Due in (minutes)"><input name="taskMinutes" type="number" min={0} defaultValue={a.taskMinutes} className="input" /></Field>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="notifyOwner" defaultChecked={a.notifyOwner} className="accent-navy-900" /> Alert the lead&apos;s owner</label>
              <p className="mb-1.5 mt-3 text-sm font-medium">Also alert</p>
              <div className="mb-3 flex max-h-32 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto text-sm">{users.map((u) => <label key={u.id} className="flex items-center gap-1.5"><input type="checkbox" name="notifyUserIds" value={u.id} defaultChecked={a.notifyUserIds.includes(u.id)} className="accent-navy-900" />{u.name}</label>)}</div>
              <Field label="Add a note to the lead (optional)"><input name="note" defaultValue={a.note} className="input" /></Field>
              <details className="mt-3" open={!!a.emailSubject}>
                <summary className="cursor-pointer text-sm font-medium">Email the client (leads with an email)</summary>
                <div className="mt-2 space-y-2"><input name="emailSubject" defaultValue={a.emailSubject} placeholder="Subject" className="input" /><textarea name="emailBody" rows={5} defaultValue={a.emailBody} placeholder="Message. You can use {name}, {first_name}, {agent}." className="input" /></div>
              </details>
            </fieldset>
            <SubmitButton>Save rule</SubmitButton>
          </ActionForm>
        </Drawer>
      )}

      {sp.hook && tab === "webhooks" && (
        <Drawer title={hookEditing ? hookEditing.name : "Add webhook"} closeHref="/crm/automation?tab=webhooks">
          <ActionForm action={saveHook} className="space-y-4">
            {hookEditing && <input type="hidden" name="id" value={hookEditing.id} />}
            <Field label="Name"><input name="name" required defaultValue={hookEditing?.name ?? ""} placeholder="e.g. Leads Google Sheet (Zapier)" className="input" /></Field>
            <Field label="URL" hint="From Zapier “Webhooks by Zapier → Catch Hook” or Make “Custom webhook”."><input name="url" required type="url" defaultValue={hookEditing?.url ?? ""} placeholder="https://hooks.zapier.com/…" className="input" /></Field>
            <fieldset><legend className="mb-1.5 text-sm font-medium">Send when</legend>
              <div className="space-y-1.5 text-sm">{HOOK_EVENTS.map(([k, l]) => <label key={k} className="flex items-center gap-2"><input type="checkbox" name="events" value={k} defaultChecked={hookEditing ? hookEditing.events.split(",").includes(k) : k === "lead.created"} className="accent-navy-900" />{l}</label>)}</div>
            </fieldset>
            {hookEditing && <p className="rounded-lg bg-canvas px-3 py-2 text-xs">Secret (to check the signature): <code className="select-all break-all">{hookEditing.secret}</code></p>}
            <SubmitButton>Save webhook</SubmitButton>
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
