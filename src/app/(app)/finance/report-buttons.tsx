import { Download, Printer } from "lucide-react";

/** Monthly report: Print (opens the report and the print dialog) and Download PDF (opens it and saves the PDF). */
export function ReportButtons({ month }: { month: string }) {
  const cls = "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-canvas";
  return (
    <>
      <a href={`/print/finance/${month}?auto=print`} target="_blank" rel="noreferrer" className={cls}><Printer className="size-4" /> Print report</a>
      <a href={`/print/finance/${month}?auto=pdf`} target="_blank" rel="noreferrer" className={cls}><Download className="size-4" /> Download PDF</a>
    </>
  );
}
