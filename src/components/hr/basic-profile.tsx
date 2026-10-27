import Link from "next/link";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { fileUrl } from "@/lib/files";
import { fmtDate } from "@/lib/utils";
import { Badge, Card } from "@/components/ui";

type Emp = {
  fullName: string; code: string; status: string; photo: string | null; phone: string | null; officialEmail: string | null; joiningDate: Date;
  department: { name: string } | null; designation: { name: string } | null; branch: { name: string } | null; manager: { fullName: string } | null;
};

/**
 * What a line manager sees for a team member they can see in attendance or leave but whose full HR record they
 * can't open: name, role, team and work contact only (no salary, documents or personal details).
 */
export function BasicProfile({ emp, back }: { emp: Emp; back: { href: string; label: string } }) {
  const initials = emp.fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const rows: [string, React.ReactNode][] = [
    ["Designation", emp.designation?.name], ["Department", emp.department?.name], ["Branch", emp.branch?.name],
    ["Reports to", emp.manager?.fullName], ["Joined", fmtDate(emp.joiningDate)],
  ];
  return (
    <>
      <Link href={back.href} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> {back.label}</Link>
      <Card className="max-w-2xl p-6">
        <div className="flex flex-wrap items-center gap-4">
          {emp.photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={fileUrl(emp.photo)} alt="" className="size-16 rounded-full object-cover" />
            : <span className="flex size-16 items-center justify-center rounded-full bg-navy-900 text-lg font-semibold text-white">{initials}</span>}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold">{emp.fullName}</h1>
            <p className="text-sm text-muted">{emp.designation?.name ?? "—"} · {emp.code}</p>
          </div>
          <Badge tone={emp.status === "left" ? "red" : emp.status === "probation" ? "amber" : "green"}>{emp.status}</Badge>
        </div>
        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>)}
        </dl>
        {(emp.phone || emp.officialEmail) && (
          <div className="mt-6 flex flex-wrap gap-2">
            {emp.phone && <a href={`tel:${emp.phone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas"><Phone className="size-4" /> {emp.phone}</a>}
            {emp.officialEmail && <a href={`mailto:${emp.officialEmail}`} className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas"><Mail className="size-4 shrink-0" /> <span className="truncate">{emp.officialEmail}</span></a>}
          </div>
        )}
        <p className="mt-6 text-xs text-muted">You see this person through your team’s attendance or leave. Full HR records are available to HR.</p>
      </Card>
    </>
  );
}
