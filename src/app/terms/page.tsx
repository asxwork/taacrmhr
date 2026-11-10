import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Terms of service" };

/** Public terms of service (required by Google for the Drive backup sign-in). */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="10 November 2026">
      <p>AMS is the internal CRM and HR system of The Advisor Associates. By signing in you agree to these terms.</p>
      <h2>Who may use AMS</h2>
      <p>Only staff and administrators of The Advisor Associates who have been given an account. Accounts are personal: do not share your password or let anyone else use your account.</p>
      <h2>Acceptable use</h2>
      <ul>
        <li>Use AMS only for your work at The Advisor Associates.</li>
        <li>Keep customer and staff information confidential and use it only for the purpose it was collected.</li>
        <li>Do not try to access information your role does not allow, or to disrupt the system.</li>
      </ul>
      <h2>Google Drive backups</h2>
      <p>A Super Admin may connect a company Google account so AMS can save daily backups to Google Drive. AMS only uses access to the backup files it creates. The connection can be removed at any time in Settings → Backup or in the Google account’s permissions.</p>
      <h2>Availability</h2>
      <p>We work to keep AMS available and backed up, but it may occasionally be unavailable for maintenance or updates. Administrators are told in advance where possible.</p>
      <h2>Changes</h2>
      <p>We may update these terms; the date above shows the latest version.</p>
      <h2>Contact</h2>
      <p>Questions: contact The Advisor Associates through our office or website, theadvisorassociates.com.</p>
    </LegalPage>
  );
}
