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
    const text = (v: unknown): string => {
      if (v == null) return "";
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        if ("text" in o) return String(o.text ?? "");
        if ("result" in o) return String(o.result ?? "");
        if ("richText" in o) return (o.richText as { text: string }[]).map((r) => r.text).join("");
        if ("hyperlink" in o) return String(o.hyperlink ?? "").replace(/^mailto:/, "");
        return "";
      }
      return String(v);
    };
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i] = normHeader(text(c.value)); });
    const rows: Record<string, string>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const r: Record<string, string> = {};
      row.eachCell({ includeEmpty: false }, (c, i) => { if (headers[i]) r[headers[i]!] = text(c.value).trim(); });
      rows.push(r);
    });
    return { headers: headers.filter(Boolean), rows };
  }
  const parsed = Papa.parse<Record<string, string>>((await file.text()).replace(/^﻿/, ""), { header: true, skipEmptyLines: "greedy", transformHeader: normHeader });
  return { headers: parsed.meta.fields ?? [], rows: parsed.data };
}
