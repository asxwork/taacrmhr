// Rows of an uploaded CSV or the first sheet of an .xlsx, with headers lower-cased ("Mobile_Phone" → "mobile phone").
import Papa from "papaparse";

export const normHeader = (h: string) => h.replace(/^﻿/, "").trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");

export async function readSheetFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  if (/\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return { headers: [], rows: [] };
    // A cell can be plain, a formula result, rich text, or a link whose text is itself rich text: read every layer.
    const text = (v: unknown): string => {
      if (v == null) return "";
      if (v instanceof Date) return v.toISOString();
      if (typeof v !== "object") return String(v);
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
      if ("text" in o) return text(o.text);
      if ("result" in o) return text(o.result);
      if ("hyperlink" in o) return String(o.hyperlink ?? "").replace(/^mailto:/, "");
      if ("error" in o) return "";
      return "";
    };
    // Every column with data gets a header: empty ones become "Column 5", repeated ones "Phone (2)".
    const width = Math.max(ws.columnCount, ws.getRow(1).cellCount);
    const headers: string[] = [];
    const seen = new Map<string, number>();
    for (let i = 1; i <= width; i++) {
      let h = normHeader(text(ws.getRow(1).getCell(i).value)) || `column ${i}`;
      const n = (seen.get(h) ?? 0) + 1;
      seen.set(h, n);
      if (n > 1) h = `${h} (${n})`;
      headers[i] = h;
    }
    const rows: Record<string, string>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const r: Record<string, string> = {};
      row.eachCell({ includeEmpty: false }, (c, i) => { if (headers[i]) r[headers[i]!] = text(c.value).trim(); });
      if (Object.values(r).some(Boolean)) rows.push(r);
    });
    // Leave out columns that are empty in every row (and have no real name).
    const used = headers.filter((h, i) => h && (!/^column \d+$/.test(h) || rows.some((r) => r[headers[i]!])));
    return { headers: used, rows };
  }
  const parsed = Papa.parse<Record<string, string>>((await file.text()).replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: normHeader });
  return { headers: parsed.meta.fields ?? [], rows: parsed.data };
}
