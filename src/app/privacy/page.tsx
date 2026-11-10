import { LegalPage } from "@/components/legal-page";

export const metadata = { title: "Privacy policy" };

/** Public privacy policy (required by Google for the Drive backup sign-in). */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="10 November 2026">
      <p>AMS is the internal CRM and HR system of The Advisor Associates (“we”). It is used only by our staff and administrators. This policy explains what AMS does with information, including the Google account used for backups.</p>
      <h2>Information AMS keeps</h2>
      <ul>
        <li>Staff records entered by our HR team or by staff themselves: name, contact details, employment, attendance, leave and payroll information, and uploaded documents.</li>
        <li>Customer and property records entered by our sales team: leads, contacts, deals and listings.</li>
        <li>Sign-in and activity records needed for security (for example, sign-in times and changes made).</li>
      </ul>
      <h2>Google account and Google Drive</h2>
      <p>A Super Admin can connect a Google account so AMS can save daily backups to Google Drive. When connected, AMS:</p>
      <ul>
        <li>Uses only the Google Drive “files created by this app” permission (drive.file). It can create, read and delete only the backup files it made in an “AMS backups” folder. It cannot see any other files in that Drive.</li>
        <li>Reads the connected account’s email address, only to show which account the backups go to.</li>
        <li>Stores the access token encrypted on our server. It is never shared with anyone.</li>
      </ul>
      <p>AMS’s use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Google data is used only to store and manage our own backups, never for advertising, never sold, and never shared with third parties.</p>
      <h2>Who can see information</h2>
      <p>Only our staff, according to the role and permissions an administrator gives them. We do not sell or rent information. We share it only when the law requires it.</p>
      <h2>Keeping and deleting information</h2>
      <p>Backups older than the period set by the administrator (30 days by default) are deleted automatically. A Super Admin can disconnect Google Drive at any time in Settings → Backup; access can also be removed at any time at myaccount.google.com/permissions.</p>
      <h2>Security</h2>
      <p>AMS uses encrypted connections (HTTPS), hashed passwords, optional two-step sign-in, role-based permissions and an audit log.</p>
      <h2>Contact</h2>
      <p>Questions about this policy or your information: contact The Advisor Associates through our office or website, theadvisorassociates.com.</p>
    </LegalPage>
  );
}
