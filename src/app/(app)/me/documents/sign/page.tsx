import Link from "@/components/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, PenLine } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fileUrl } from "@/lib/files";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { SignaturePad } from "@/components/invoices/signature-pad";
import { signMyDocument } from "./actions";

export const metadata = { title: "Read and sign" };

/** Read a letter or document HR asked you to sign, then sign it (drawn signature + typed name). */
export default async function SignPage({ searchParams }: { searchParams: Promise<{ letter?: string; doc?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const emp = await db.employee.findUnique({ where: { userId: user.id }, select: { id: true, fullName: true } });
  if (!emp) notFound();
  const letter = sp.letter ? await db.employeeLetter.findFirst({ where: { id: sp.letter, employeeId: emp.id } }) : null;
  const doc = !letter && sp.doc ? await db.employeeDocument.findFirst({ where: { id: sp.doc, employeeId: emp.id } }) : null;
  const item = letter ?? doc;
  if (!item) notFound();
  const isPdf = doc?.path.toLowerCase().endsWith(".pdf");
  return (
    <>
      <Link href="/me/documents" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" /> My Documents</Link>
      <PageHeader title={item.title} description={letter ? `Issued ${format(letter.issuedAt, "d MMMM yyyy")}` : `Added ${format(doc!.createdAt, "d MMMM yyyy")}`} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden">
          {letter ? <article className="whitespace-pre-line p-6 font-serif text-[15px] leading-7 sm:p-10">{letter.body}</article>
            : isPdf ? <iframe src={fileUrl(doc!.path)} title={item.title} className="h-[75vh] w-full" />
            // eslint-disable-next-line @next/next/no-img-element
            : <img src={fileUrl(doc!.path, 1200)} alt={item.title} className="w-full" />}
        </Card>
        <div>
          {item.signedAt ? (
            <Card className="p-5 text-sm">
              <p className="font-medium text-emerald-700">✓ You signed this on {format(item.signedAt, "d MMM yyyy, h:mm a")}</p>
              <p className="mt-1 text-muted">as {item.signedName}</p>
              {letter && <a href={`/print/letter/${letter.id}`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-navy-900 underline">Download / print the signed letter</a>}
            </Card>
          ) : (
            <Card className="sticky top-4 p-5">
              <h2 className="mb-1 flex items-center gap-2 font-medium"><PenLine className="size-4" /> Sign</h2>
              <p className="mb-4 text-xs text-muted">Read it fully first. Your signature, name, the time and your internet address are saved with it, the same as signing on paper.</p>
              <ActionForm action={signMyDocument} className="space-y-4">
                <input type="hidden" name="kind" value={letter ? "letter" : "doc"} />
                <input type="hidden" name="id" value={item.id} />
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" required className="mt-1" /> I have read this {letter ? "letter" : "document"} and agree to it.</label>
                <input name="name" required defaultValue={emp.fullName} className="input" aria-label="Your full name" placeholder="Your full name" />
                <SignaturePad label="Your signature" />
                <SubmitButton pendingText="Signing…">Sign</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
