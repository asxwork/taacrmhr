import { db } from "@/lib/db";
import { disabledFeatures } from "@/lib/features";
import { BLOOD_GROUPS } from "@/lib/hr-shared";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { submitOnboarding } from "./actions";

export const metadata = { title: "Welcome — your details" };

const file = "block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white";

/** Public onboarding form opened from the link HR sends a new hire. */
export default async function OnboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = (await disabledFeatures()).has("onboarding") ? null : await db.onboardingInvite.findUnique({ where: { token }, include: { employee: { select: { firstName: true, lastName: true, fullName: true, phone: true, personalEmail: true } } } });
  const valid = inv && !inv.submittedAt && inv.expiresAt > new Date();
  const e = inv?.employee;
  const F = ({ name, label, type = "text", req, def, ph }: { name: string; label: string; type?: string; req?: boolean; def?: string | null; ph?: string }) => (
    <label className="block text-sm"><span className="mb-1 block font-medium">{label}{req && <span className="text-red-600"> *</span>}</span>
      <input name={name} type={type} required={req} defaultValue={def ?? ""} placeholder={ph} className="input" /></label>
  );
  return (
    <main className="min-h-screen bg-canvas px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/logo-blue.svg" alt="The Advisor Associates" className="mx-auto mb-6 h-12" />
        {!valid ? (
          <div className="rounded-2xl bg-surface p-8 text-center shadow-sm">
            <h1 className="mb-2 text-lg font-semibold">{inv?.submittedAt ? "Already submitted — thank you!" : "This link doesn't work"}</h1>
            <p className="text-sm text-muted">{inv?.submittedAt ? "HR has your details. They'll be in touch." : "It may have expired. Ask HR for a new one."}</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-surface p-6 shadow-sm sm:p-8">
            <h1 className="font-display text-2xl font-semibold">Welcome{e?.firstName ? `, ${e.firstName}` : ""}!</h1>
            <p className="mb-6 text-sm text-muted">Please fill in your details for HR. It takes about 5 minutes. Fields marked * are required.</p>
            <ActionForm action={submitOnboarding} className="space-y-6">
              <input type="hidden" name="token" value={token} />
              <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">About you</legend>
                <F name="firstName" label="First name" req def={e?.firstName ?? e?.fullName.split(" ")[0]} />
                <F name="lastName" label="Last name" def={e?.lastName} />
                <F name="fatherName" label="Father's / husband's name" />
                <F name="motherName" label="Mother's name" />
                <F name="dob" label="Date of birth" type="date" />
                <label className="block text-sm"><span className="mb-1 block font-medium">Gender</span><select name="gender" className="input"><option value="">—</option><option value="male">Male</option><option value="female">Female</option></select></label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Marital status</span><select name="maritalStatus" className="input"><option value="">—</option><option value="single">Single</option><option value="married">Married</option></select></label>
                <label className="block text-sm"><span className="mb-1 block font-medium">Blood group</span><select name="bloodGroup" className="input"><option value="">—</option>{BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}</select></label>
                <F name="religion" label="Religion" />
                <F name="nationality" label="Nationality" def="Pakistani" />
              </fieldset>
              <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Contact</legend>
                <F name="phone" label="Mobile number" type="tel" req def={e?.phone} ph="0300 1234567" />
                <F name="personalEmail" label="Personal email" type="email" def={e?.personalEmail} />
                <F name="address" label="Current address" />
                <F name="permanentAddress" label="Permanent address" />
                <F name="city" label="City" />
              </fieldset>
              <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">CNIC &amp; photo</legend>
                <F name="cnic" label="CNIC number" req ph="42101-1234567-1" />
                <label className="block text-sm"><span className="mb-1 block font-medium">Your photo</span><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" capture="user" className={file} /></label>
                <label className="block text-sm"><span className="mb-1 block font-medium">CNIC front</span><input name="cnicFront" type="file" accept="image/*,application/pdf" className={file} /></label>
                <label className="block text-sm"><span className="mb-1 block font-medium">CNIC back</span><input name="cnicBack" type="file" accept="image/*,application/pdf" className={file} /></label>
              </fieldset>
              <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Emergency contact</legend>
                <F name="emergencyName" label="Name" />
                <F name="emergencyRelation" label="Relation" />
                <F name="emergencyPhone" label="Phone" type="tel" />
              </fieldset>
              <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Salary account</legend>
                <F name="bankName" label="Bank" />
                <F name="accountTitle" label="Account title" />
                <F name="accountNumber" label="Account / IBAN" />
              </fieldset>
              <SubmitButton pendingText="Sending…">Send to HR</SubmitButton>
            </ActionForm>
          </div>
        )}
      </div>
    </main>
  );
}
