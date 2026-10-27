import { redirect } from "next/navigation";
import { CheckCircle2, Circle, KeyRound, PhoneCall } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAgents } from "@/lib/calls";
import { canStoreSecrets, pbxConfig, retentionDays } from "@/lib/softphone";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { saveExtension, savePbx } from "./actions";

export const metadata = { title: "Phone system" };

const ISSABEL_STEPS = [
  { t: "Secure WebRTC address", d: "In Issabel, turn on Asterisk's TLS web socket on port 8089 (http.conf: tlsenable=yes, tlsbindaddr=0.0.0.0:8089) with a real certificate for the PBX's domain (e.g. Let's Encrypt for pbx.yourcompany.com). The address then is wss://pbx.yourcompany.com:8089/ws." },
  { t: "WebRTC on each agent extension", d: "PBX → Extensions → the agent's extension → Advanced: transport wss (or All), avpf=yes, icesupport=yes, encryption=yes, dtlsenable=yes, dtlsverify=fingerprint, dtlssetup=actpass, rtcp_mux=yes, using the same certificate. Note the extension number and its secret." },
  { t: "Firewall", d: "Allow TCP 8089 (web socket) and UDP 10000–20000 (voice) to the PBX from where agents work. If agents work from home, the PBX needs a public address or a TURN server (add it below)." },
  { t: "Optional: supervisor codes", d: "For live listen, whisper and barge, ask your Issabel admin for ChanSpy feature codes (for example 556 + extension to listen) and enter them below. Voicemail is *97 on Issabel by default." },
];

/** Calls → Phone system (Super Admin): connect agents' Issabel extensions to the softphone, recording and retention. */
export default async function PhoneSystem() {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  const [pbx, agents, accounts, recCount] = await Promise.all([
    pbxConfig(), callAgents(true), db.sipAccount.findMany(), db.callRecording.count({ where: { deletedAt: null } }),
  ]);
  const acc = new Map(accounts.map((a) => [a.userId, a]));
  const secrets = canStoreSecrets();
  const connected = !!pbx.wss && accounts.some((a) => a.enabled && a.secretEnc);
  const steps = [
    { done: true, label: "Calling workspace", text: "Campaigns, batches, dialer, outcomes, callbacks, WhatsApp, wallboard and reports." },
    { done: connected, label: "Softphone on Issabel", text: "Agents call from AMS through their own extension: click-to-call, inbound calls with a screen pop, hold, mute, transfer, keypad, voicemail, live status on the wallboard." },
    { done: connected && pbx.record !== "off", label: "Recording vault (Super Admin only)", text: `Answered calls recorded by the softphone, kept ${retentionDays(pbx)} days, every play and download logged. ${recCount} recording(s) stored.` },
    { done: false, label: "WhatsApp Business inbox", text: "Official WhatsApp Business API: chat from AMS, approved templates, every message on the lead. Needs a verified Meta Business account." },
  ];
  return (
    <>
      <PageHeader title="Phone system (Issabel)" description="Agents register their own Issabel extensions inside AMS, so calls go through your PBX and lines as usual. AMS does not need admin access to the PBX." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 font-semibold">Connection</h2>
            <ActionForm action={savePbx} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="PBX"><input name="make" defaultValue={pbx.make} className="input" /></Field>
                <Field label="Version"><input name="model" defaultValue={pbx.model} className="input" placeholder="e.g. Issabel 4" /></Field>
                <Field label="WebRTC address (WSS)" hint="From step 1 on the right"><input name="wss" defaultValue={pbx.wss} className="input" placeholder="wss://pbx.example.com:8089/ws" /></Field>
                <Field label="SIP domain" hint="Leave blank to use the WSS host"><input name="domain" defaultValue={pbx.domain} className="input" placeholder="pbx.example.com" /></Field>
                <Field label="PBX admin address (for reference)"><input name="host" defaultValue={pbx.host} className="input" placeholder="192.168.1.10" /></Field>
                <Field label="Outside line prefix" hint="Only if your PBX needs one, e.g. 9"><input name="dialPrefix" defaultValue={pbx.dialPrefix} className="input w-28" /></Field>
                <Field label="Phone lines / SIP trunk"><input name="trunk" defaultValue={pbx.trunk} className="input" placeholder="e.g. PTCL lines, SIP trunk from …" /></Field>
                <Field label="Voicemail code"><input name="voicemail" defaultValue={pbx.voicemail} className="input w-28" /></Field>
              </div>
              <Field label="STUN / TURN servers" hint="One per line. Add a TURN server if agents call from outside the office."><textarea name="ice" rows={2} defaultValue={pbx.ice} className="input font-mono text-xs" /></Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Listen code" hint="Dialled + extension"><input name="spyListen" defaultValue={pbx.spyListen} className="input" placeholder="e.g. 556" /></Field>
                <Field label="Whisper code"><input name="spyWhisper" defaultValue={pbx.spyWhisper} className="input" placeholder="e.g. 557" /></Field>
                <Field label="Barge code"><input name="spyBarge" defaultValue={pbx.spyBarge} className="input" placeholder="e.g. 558" /></Field>
              </div>
              <div className="flex flex-wrap items-end gap-6 rounded-lg bg-canvas/60 p-4">
                <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="record" defaultChecked={pbx.record !== "off"} /> Record answered calls</label>
                <Field label="Keep recordings for (days)"><input name="retentionDays" type="number" min={7} max={3650} defaultValue={retentionDays(pbx)} className="input w-28" /></Field>
                <p className="flex-1 text-xs text-muted">Recordings are visible only to Super Admins in Calls → Recordings. Add a “this call may be recorded” announcement on Issabel for inbound calls.</p>
              </div>
              <Field label="Notes"><textarea name="notes" rows={2} defaultValue={pbx.notes} className="input" /></Field>
              <SubmitButton>Save connection</SubmitButton>
            </ActionForm>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-4">
              <h2 className="flex-1 font-semibold">Agent extensions</h2>
              {!secrets && <Badge tone="amber">Set SIP_SECRET_KEY on the server to save passwords</Badge>}
            </div>
            <div className="divide-y divide-line">
              {agents.map((a) => {
                const s = acc.get(a.id);
                return (
                  <ActionForm key={a.id} action={saveExtension} className="grid items-end gap-3 px-6 py-3 sm:grid-cols-[1fr_110px_170px_auto_auto]">
                    <input type="hidden" name="userId" value={a.id} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted">
                        {!s ? "No extension" : !s.secretEnc ? "Password missing" : s.presence && s.presence !== "offline" && s.presenceAt && Date.now() - s.presenceAt.getTime() < 150_000 ? `Online · ${s.presence}` : "Offline"}
                      </p>
                    </div>
                    <Field label="Extension"><input name="extension" defaultValue={s?.extension ?? ""} className="input" placeholder="201" /></Field>
                    <Field label="SIP password"><input name="password" type="password" autoComplete="new-password" className="input" placeholder={s?.secretEnc ? "•••• (unchanged)" : ""} /></Field>
                    <label className="flex h-10 items-center gap-1.5 text-sm"><input type="checkbox" name="enabled" defaultChecked={s?.enabled ?? true} /> On</label>
                    <SubmitButton className="h-10">Save</SubmitButton>
                  </ActionForm>
                );
              })}
            </div>
            <p className="px-6 py-3 text-xs text-muted">Clear the extension and save to remove it. Passwords are encrypted and sent only to that agent’s own browser when they open Calls.</p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="h-fit p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><PhoneCall className="size-4" /> Roll-out</h2>
            <ol className="space-y-4">
              {steps.map((s) => (
                <li key={s.label} className="flex gap-3">
                  {s.done ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 size-5 shrink-0 text-muted" />}
                  <div><p className="text-sm font-medium">{s.label}</p><p className="text-xs text-muted">{s.text}</p></div>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="h-fit p-6">
            <h2 className="mb-4 flex items-center gap-2 font-semibold"><KeyRound className="size-4" /> On the Issabel side (one time)</h2>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              {ISSABEL_STEPS.map((s) => <li key={s.t}><p className="font-medium">{s.t}</p><p className="text-xs text-muted">{s.d}</p></li>)}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
