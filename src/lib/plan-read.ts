// Reads brochures and payment plans in the browser (free, no key): a PDF's own text, and the free reader (Tesseract)
// for photos and for PDF pages that are only pictures. Then finds the payment plan and the project's details.
// Client-safe; parsePlanText is plain text work and is tested on its own.

export type PlanRead = {
  downPct: number | null; installments: number | null; frequency: "monthly" | "quarterly" | "biannual" | null; possessionPct: number | null;
  developer: string | null; location: string | null; handover: string | null; unitTypes: string[]; sizes: string | null; startingPrice: string | null; amenities: string[];
  text: string;
};

const pct = (s: string | undefined) => { if (!s) return null; const n = Number(s); return Number.isFinite(n) && n > 0 && n <= 100 ? n : null; };

/** Finds the payment plan and project details in the text of a brochure / payment plan. */
export function parsePlanText(raw: string): PlanRead {
  const text = raw.replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const all = lines.join("\n");
  const one = (re: RegExp) => all.match(re);

  // Down payment / booking: "Down Payment 20%", "Booking 10% + Confirmation 10%", "20% down payment".
  const down = one(/(?:down\s*payment|booking(?:\s*amount)?|on\s*booking|advance)\D{0,20}?(\d{1,2}(?:\.\d+)?)\s*%/i) ?? one(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:down\s*payment|on\s*booking|booking|advance)/i);
  const confirm = one(/confirmation\D{0,15}?(\d{1,2}(?:\.\d+)?)\s*%/i);
  const downPct = pct(down?.[1]) != null ? pct(down?.[1])! + (pct(confirm?.[1]) ?? 0) : null;
  // Possession / handover: "On Possession 30%", "30% on handover", "Balloon payment 20%".
  const poss = one(/(?:on\s*)?(?:possession|handover|completion|balloon)\D{0,20}?(\d{1,2}(?:\.\d+)?)\s*%/i) ?? one(/(\d{1,2}(?:\.\d+)?)\s*%\s*(?:on\s*)?(?:possession|handover|completion|balloon)/i);
  // Installments: "36 Monthly Installments", "12 quarterly installments", "Installments: 48 months", "4 years plan".
  const inst = one(/(\d{1,3})\s*(monthly|quarterly|half[\s-]*yearly|bi[\s-]*annual|6[\s-]*monthly|yearly|annual)\s*instal?l?ments?/i);
  const months = one(/instal?l?ments?\D{0,20}?(\d{1,3})\s*months?/i) ?? one(/(\d{1,3})\s*months?\s*(?:easy\s*)?(?:payment\s*)?(?:plan|instal)/i);
  const years = one(/(\d{1,2})\s*years?\s*(?:easy\s*)?(?:payment\s*)?(?:plan|instal)/i);
  let installments: number | null = null; let frequency: PlanRead["frequency"] = null;
  if (inst) {
    installments = Number(inst[1]);
    const f = inst[2]!.toLowerCase();
    frequency = /quarter/.test(f) ? "quarterly" : /half|bi|6/.test(f) ? "biannual" : /year|annual/.test(f) ? null : "monthly";
    if (/year|annual/.test(f)) { installments = Number(inst[1]) * 2; frequency = "biannual"; }
  } else if (months) { installments = Number(months[1]); frequency = "monthly"; }
  else if (years) { installments = Number(years[1]) * 12; frequency = "monthly"; }
  if (installments != null && (installments < 1 || installments > 240)) { installments = null; frequency = null; }

  const developer = one(/(?:developed\s*by|developer|a\s*project\s*(?:of|by)|by)\s*[:\-–]?\s*([A-Z][A-Za-z&.'\- ]{2,40}?(?:Developers?|Builders?|Group|Properties|Estates?|Associates)?)(?:\n|$|[,.|])/)?.[1]?.trim() ?? null;
  const location = one(/(?:location|located\s*(?:at|in)|address|site)\s*[:\-–]?\s*([A-Za-z0-9][^\n]{3,60})/i)?.[1]?.trim() ?? null;
  const handover = one(/(?:handover|possession|completion|delivery)\s*(?:date|by|in)?\s*[:\-–]?\s*((?:Q[1-4]\s*)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\s*20\d{2})/i)?.[1]?.trim() ?? null;
  const unitTypes = [...new Set([...all.matchAll(/\b(studio|[1-6]\s*(?:bed(?:room)?s?|bhk|br)|penthouse|duplex|townhouse|villa|shop|office|apartment|plot)\b/gi)].map((m) => m[1]!.replace(/\s+/g, " ").replace(/bedrooms?|beds?|br|bhk/i, "Bed").replace(/^(\d)\s*Bed/i, "$1 Bed").replace(/^\w/, (c) => c.toUpperCase())))].slice(0, 10);
  const sizeNums = [...all.matchAll(/([0-9][0-9,]{1,6})\s*(?:sq\.?\s*ft|sqft|square\s*feet|sft)/gi)].map((m) => Number(m[1]!.replace(/,/g, ""))).filter((n) => n > 50 && n < 100000);
  const sizes = sizeNums.length ? (Math.min(...sizeNums) === Math.max(...sizeNums) ? `${Math.min(...sizeNums).toLocaleString()} sq ft` : `${Math.min(...sizeNums).toLocaleString()} – ${Math.max(...sizeNums).toLocaleString()} sq ft`) : null;
  const startingPrice = one(/(?:starting\s*(?:from|price)|price\s*(?:starts?|from)|from)\s*[:\-–]?\s*((?:pkr|rs\.?|aed|usd|\$)\s*[0-9][0-9,.]*\s*(?:lac|lakh|crore|cr|million|m|k)?)/i)?.[1]?.trim() ?? null;
  const AMENITIES = ["Swimming pool", "Gym", "Mosque", "Parking", "Security", "Lift", "Elevator", "Park", "Kids play area", "Community centre", "Rooftop", "Backup generator", "CCTV", "Jogging track", "School", "Hospital", "Commercial area"];
  const amenities = AMENITIES.filter((a) => new RegExp(a.replace(/ /g, "\\s*"), "i").test(all)).slice(0, 12);
  return { downPct, installments, frequency, possessionPct: pct(poss?.[1]), developer, location, handover, unitTypes, sizes, startingPrice, amenities, text: lines.join("\n").slice(0, 6000) };
}

/** The text of a brochure / payment plan: a PDF's own text (pictures-only pages read with the free reader), or a photo's. */
export async function readDocumentText(file: File, onProgress?: (msg: string) => void): Promise<string> {
  const ocr = async (img: Blob | HTMLCanvasElement) => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr" });
    try { return (await worker.recognize(img)).data.text ?? ""; } finally { await worker.terminate(); }
  };
  if (/^image\//.test(file.type)) { onProgress?.("Reading the picture…"); return ocr(file); }
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return "";
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const parts: string[] = [];
  const pages = Math.min(doc.numPages, 12);
  for (let i = 1; i <= pages; i++) {
    onProgress?.(`Reading page ${i} of ${pages}…`);
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Keep the PDF's line breaks: items on a new line start a new line of text.
    let last = -1, line = "";
    const out: string[] = [];
    for (const it of content.items as { str: string; transform: number[] }[]) {
      const y = Math.round(it.transform[5] ?? 0);
      if (last !== -1 && Math.abs(y - last) > 2) { out.push(line); line = ""; }
      line += (line ? " " : "") + it.str; last = y;
    }
    out.push(line);
    let pageText = out.join("\n").trim();
    if (pageText.replace(/\s/g, "").length < 40) {
      // A designed page that's only a picture: draw it and read it with the free reader.
      const vp = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
      pageText = await ocr(canvas);
    }
    parts.push(pageText);
  }
  return parts.join("\n");
}
