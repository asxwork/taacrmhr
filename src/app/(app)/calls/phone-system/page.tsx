import { redirect } from "next/navigation";
import { CheckCircle2, Circle, PhoneCall } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { savePbx } from "./actions";

export const metadata = { title: "Phone system" };

/** Calls → Phone system (Super Admin): your PBX details and what connecting it switches on. */
export default async function PhoneSystem() {
  const user = await requireUser();
  if (!user.isSuperAdmin) redirect("/no-access");
  const row = await db.setting.findUnique({ where: { key: "calls.pbx" } });
  let pbx: Record<string, string> = {};
  try { pbx = row ? JSON.parse(row.value) : {}; } catch {}
  const steps = [
    { done: true, label: "Calling workspace", text: "Campaigns, batches, dialer, outcomes, callbacks, WhatsApp, wallboard and reports (live now; calls go out from the agent's phone)." },
    { done: false, label: "Softphone in the browser and apps", text: "Click-to-call through your PBX, automatic call logging and talk time, transfer, hold, live listen / whisper / barge for supervisors, inbound queues, IVR and voicemail with a screen pop." },
    { done: false, label: "Recording vault (Super Admin only)", text: "Every call recorded on the PBX and searchable here by agent, number and date, kept 6 months, with every play and download logged." },
    { done: false, label: "WhatsApp Business inbox", text: "Official WhatsApp Business API: chat from AMS, approved templates, every message on the lead. Needs a verified Meta Business account." },
  ];
  return (
    <>
      <PageHeader title="Phone system (PBX)" description="Fill in your PBX details so the softphone and call recording can be connected. Passwords are never stored here; they go into the server settings when we connect it." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="p-6">
          <ActionForm action={savePbx} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="PBX make" hint="e.g. Grandstream, Yeastar, 3CX, FreePBX, Panasonic"><input name="make" defaultValue={pbx.make} className="input" /></Field>
              <Field label="Model / version"><input name="model" defaultValue={pbx.model} className="input" /></Field>
              <Field label="PBX address" hint="IP or domain of its admin page"><input name="host" defaultValue={pbx.host} className="input" placeholder="192.168.1.10 or pbx.example.com" /></Field>
              <Field label="WebRTC / WSS address (if known)"><input name="wss" defaultValue={pbx.wss} className="input" placeholder="wss://pbx.example.com:8089/ws" /></Field>
              <Field label="Phone lines / SIP trunk provider"><input name="trunk" defaultValue={pbx.trunk} className="input" placeholder="e.g. PTCL lines, a SIP trunk from …" /></Field>
              <Field label="Agent extensions" hint="e.g. 201 Ali, 202 Sana"><input name="extensions" defaultValue={pbx.extensions} className="input" /></Field>
            </div>
            <Field label="Notes"><textarea name="notes" rows={3} defaultValue={pbx.notes} className="input" placeholder="Does it record calls already? Where are recordings stored? Any API / AMI access?" /></Field>
            <SubmitButton>Save details</SubmitButton>
          </ActionForm>
        </Card>
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
      </div>
    </>
  );
}
