import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { employeeAllows } from "@/lib/hr";
import { PrintButton } from "../../employee/[id]/print-button";
import { uploadAsDataUrl } from "@/lib/files";

export const metadata = { title: "Letter" };

/** An issued letter on the company letterhead, ready to print or save as PDF. The employee can open their own. */
export default async function LetterPrint({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const l = await db.employeeLetter.findUnique({ where: { id }, include: { employee: true } });
  if (!l) notFound();
  if (l.employee.userId !== user.id && !(can(user, "hr.employees") && (await employeeAllows(user, l.employee, "view")))) notFound();
  const company = (await db.setting.findUnique({ where: { key: "company.name" } }))?.value || "The Advisor Associates";
  const sign = l.signedAt ? await uploadAsDataUrl(l.signature) : null;
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-white p-10 text-[#0a223c] print:p-0">
      <style>{`@page { size: A4; margin: 18mm } body { background: #fff !important }`}</style>
      <div className="mb-8 flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-500">{l.title} · issued {format(l.issuedAt, "d MMM yyyy")}</p>
        <PrintButton target="main" fileName={`${l.title} ${l.employee.fullName}`} dark />
      </div>
      <header className="mb-10 flex items-center justify-between border-b-2 border-[#d4b26a] pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/logo-blue.svg" alt={company} className="h-14" />
        <p className="text-right text-[10px] leading-snug text-slate-500">{company}<br />Human Resources</p>
      </header>
      <article className="whitespace-pre-line font-serif text-[15px] leading-7">{l.body}</article>
      {l.signedAt && (
        <section className="mt-10 w-72 border-t border-slate-300 pt-2 text-xs text-slate-600">
          {/* eslint-disable-next-line @next/next/no-img-element -- the employee's drawn signature */}
          {sign && <img src={sign} alt="Signature" className="mb-1 h-16" />}
          <p className="font-medium text-[#0a223c]">{l.signedName}</p>
          <p>Signed electronically on {format(l.signedAt, "d MMM yyyy, h:mm a")}{l.signedIp ? ` · IP ${l.signedIp}` : ""}</p>
        </section>
      )}
      {!l.signedAt && l.requireSign && l.employee.userId === user.id && <p className="mt-8 print:hidden"><a href={`/me/documents/sign?letter=${l.id}`} className="rounded-lg bg-[#0a223c] px-4 py-2 text-sm text-white">Read and sign this letter</a></p>}
      <footer className="mt-16 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">Ref {l.id.slice(-8).toUpperCase()} · {company}</footer>
    </main>
  );
}
