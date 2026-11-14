"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { buttonClass } from "./ui";

/**
 * Two buttons on every printable page: Print (the browser's print dialog) and Download PDF (an A4 PDF file, made in the
 * browser from the page). `target` = CSS selector of what goes in the PDF (default: [data-print-area], else <main>, else the page).
 */
export function PrintButton({ fileName = "document", target, dark = false, auto }: { fileName?: string; target?: string; dark?: boolean; label?: string; auto?: "print" | "pdf" }) {
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const cls = dark ? "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium" : "";
  const download = async () => {
    setBusy(true);
    const hidden: [HTMLElement, string][] = [];
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
      const el = (target && document.querySelector<HTMLElement>(target)) || document.querySelector<HTMLElement>("[data-print-area]") || document.querySelector<HTMLElement>("main") || document.body;
      // Leave out what isn't printed (buttons, back links…).
      document.querySelectorAll<HTMLElement>(".print\\:hidden").forEach((n) => { hidden.push([n, n.style.display]); n.style.display = "none"; });
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: Math.max(el.scrollWidth, 900) });
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = 210, pageH = 297, margin = 8;
      const w = pageW - margin * 2;
      const pxPerMm = canvas.width / w;
      const sliceH = Math.floor((pageH - margin * 2) * pxPerMm);
      for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
        const part = document.createElement("canvas");
        part.width = canvas.width; part.height = Math.min(sliceH, canvas.height - y);
        part.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
        if (page) pdf.addPage();
        pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, w, part.height / pxPerMm);
      }
      pdf.save(`${fileName.replace(/[^\w\- ]+/g, "").trim() || "document"}.pdf`);
    } catch {
      window.print(); // fall back to the print dialog ("Save as PDF")
    } finally {
      hidden.forEach(([n, d]) => { n.style.display = d; });
      setBusy(false);
    }
  };
  // Opened from a "Print report" / "Download PDF" button: do it straight away (after images load).
  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    const go = () => setTimeout(() => (auto === "print" ? window.print() : void download()), 400);
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);
  return (
    <span className="inline-flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className={dark ? `${cls} border border-[#0a223c] text-[#0a223c]` : buttonClass("secondary")}>
        <Printer className="size-4" aria-hidden /> Print
      </button>
      <button type="button" onClick={download} disabled={busy} className={dark ? `${cls} bg-[#0a223c] text-white disabled:opacity-60` : buttonClass("primary")}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} {busy ? "Making PDF…" : "Download PDF"}
      </button>
    </span>
  );
}
