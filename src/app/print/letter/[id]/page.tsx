import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { employeeAllows } from "@/lib/hr";
import { PrintButton } from "../../employee/[id]/print-button";

export const metadata = { title: "Letter" };

/** An issued letter on the company letterhead, ready to print or save as PDF. The employee can open their own. */
export default async function LetterPrint({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const l = await db.employeeLetter.findUnique({ where: { id }, include: { employee: true } });
  if (!l) notFound();
  if (l.employee.userId !== user.id && !(can(user, "hr.employees") && (await employeeAllows(user, l.employee, "view")))) notFound();
  const company = (await db.setting.findUnique({ where: { key: "company.name" } }))?.value || "The Advisor Associates";
  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-white p-10 text-[#0a223c] print:p-0">
      <style>{`@page { size: A4; margin: 18mm } body { background: #fff !important }`}</style>
      <div className="mb-8 flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-500">{l.title} · issued {format(l.issuedAt, "d MMM yyyy")}</p>
        <PrintButton />
      </div>
      <header className="mb-10 flex items-center justify-between border-b-2 border-[#d4b26a] pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/logo-blue.svg" alt={company} className="h-14" />
        <p className="text-right text-[10px] leading-snug text-slate-500">{company}<br />Human Resources</p>
      </header>
      <article className="whitespace-pre-line font-serif text-[15px] leading-7">{l.body}</article>
      <footer className="mt-16 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">Ref {l.id.slice(-8).toUpperCase()} · {company}</footer>
    </main>
  );
}
