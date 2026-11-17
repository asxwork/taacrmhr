/** Sample campaign file: one phone column is required; name and any other columns are shown to the agent. */
export function GET() {
  const csv = [
    "name,phone,area,source,budget,notes",
    "Ali Khan,03001234567,DHA Phase 6,Facebook,1.5 Cr,Asked for 5 marla plots",
    "Sara Ahmed,0321-7654321,Bahria Town,Zameen,90 Lac,",
    "Usman Tariq,+92 333 1112233,Scheme 33,Walk-in,,Call after 6 pm",
  ].join("\r\n");
  return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="campaign-numbers-sample.csv"' } });
}
