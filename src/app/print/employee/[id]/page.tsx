import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { employeeAllows } from "@/lib/hr";
import { loadProfile } from "@/lib/employee-profile";
import { fileUrl } from "@/lib/files";
import { PrintButton } from "./print-button";

export const metadata = { title: "Profile card" };

/** Printable profile card (Download profile card): ID-card front and back plus a one-page profile summary. */
export default async function ProfileCard({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await loadProfile(id);
  if (!p) notFound();
  const { emp } = p;
  const self = emp.userId === user.id;
  if (!self && !(can(user, "hr.employees") && (await employeeAllows(user, emp, "view")))) notFound();

  const d = (v: Date | null) => (v ? format(v, "d MMM yyyy") : "—");
  const rows: [string, string | null | undefined][] = [
    ["Employee code", emp.code], ["Designation", emp.jobTitle ?? emp.designation?.name], ["Department", emp.department?.name], ["Branch", emp.branch?.name],
    ["Line manager", emp.manager?.fullName], ["Joining date", d(emp.joiningDate)], ["Father / husband", emp.fatherName], ["Date of birth", d(emp.dob)],
    ["Age", p.ageText], ["CNIC", emp.cnic], ["Blood group", emp.bloodGroup], ["Mobile", emp.phone], ["Email", emp.officialEmail ?? emp.user?.email ?? emp.personalEmail],
    ["Address", [emp.address, emp.city].filter(Boolean).join(", ") || null], ["Emergency contact", emp.emergencyName ? `${emp.emergencyName}${emp.emergencyRelation ? ` (${emp.emergencyRelation})` : ""} · ${emp.emergencyPhone ?? ""}` : null],
    ["Total experience", p.experienceText],
  ];

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-[#0a223c] print:p-0">
      <style>{`@page { size: A4; margin: 14mm } body { background: #fff !important }`}</style>
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-500">Print or choose “Save as PDF” to download.</p>
        <PrintButton />
      </div>

      <div className="mb-8 flex flex-wrap justify-center gap-6">
        {/* Front */}
        <div className="flex h-[340px] w-[215px] flex-col items-center overflow-hidden rounded-2xl border border-slate-200 shadow-sm print:shadow-none">
          <div className="flex w-full justify-center bg-[#0a223c] py-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/brand/logo-gold.svg" alt="The Advisor Associates" className="h-9" />
          </div>
          {emp.photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- upload served from /api/files
            <img src={fileUrl(emp.photo)} alt="" className="-mb-1 mt-4 size-24 rounded-full border-4 border-[#d4b26a] object-cover" />
          ) : (
            <div className="mt-4 flex size-24 items-center justify-center rounded-full border-4 border-[#d4b26a] bg-slate-100 text-2xl font-semibold">{emp.fullName.split(" ").map((x) => x[0]).slice(0, 2).join("")}</div>
          )}
          <p className="mt-3 px-3 text-center text-base font-bold leading-tight">{emp.fullName}</p>
          <p className="mt-0.5 px-3 text-center text-[10px] uppercase tracking-widest text-slate-500">{emp.jobTitle ?? emp.designation?.name ?? ""}</p>
          <div className="mt-auto w-full space-y-0.5 bg-slate-50 px-4 py-3 text-[10px]">
            <p><b>ID:</b> {emp.code}</p>
            <p><b>Branch:</b> {emp.branch?.name ?? "—"}</p>
            <p><b>Blood group:</b> {emp.bloodGroup ?? "—"}</p>
          </div>
        </div>
        {/* Back */}
        <div className="flex h-[340px] w-[215px] flex-col overflow-hidden rounded-2xl border border-slate-200 text-[10px] shadow-sm print:shadow-none">
          <div className="bg-[#0a223c] py-2 text-center text-[11px] font-semibold uppercase tracking-widest text-[#d4b26a]">Employee card</div>
          <div className="space-y-1.5 p-4">
            <p><b>CNIC:</b> {emp.cnic ?? "—"}</p>
            <p><b>Joined:</b> {d(emp.joiningDate)}</p>
            <p><b>Mobile:</b> {emp.phone ?? "—"}</p>
            <p><b>Emergency:</b> {emp.emergencyName ? `${emp.emergencyName} · ${emp.emergencyPhone ?? ""}` : "—"}</p>
          </div>
          <p className="mt-auto px-4 pb-4 text-[9px] leading-snug text-slate-500">This card is the property of The Advisor Associates. If found, please return it to the nearest office.</p>
        </div>
      </div>

      <h1 className="mb-1 text-xl font-bold">{emp.salutation ? `${emp.salutation}. ` : ""}{emp.fullName}</h1>
      <p className="mb-4 text-xs text-slate-500">Profile {p.completion}% complete · printed {format(new Date(), "d MMM yyyy")}</p>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-slate-100">
              <td className="w-48 py-1.5 pr-4 text-xs font-semibold text-slate-500">{k}</td>
              <td className="py-1.5">{v || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
