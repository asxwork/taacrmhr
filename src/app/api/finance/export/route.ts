import ExcelJS from "exceljs";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { categoryTree, entryWhere, financeLimit } from "@/lib/finance";

// Excel download of finance entries, with the same filters as the entries list.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const personal = sp.personal === "1";
  if (!can(user, personal ? "finance.personal" : "finance", "export")) return new Response("Forbidden", { status: 403 });
  const limit = financeLimit(user);
  const where = limit ? { AND: [entryWhere(sp, personal, await categoryTree()), limit] } : entryWhere(sp, personal, await categoryTree());
  const rows = await db.finEntry.findMany({ where, include: { account: true, toAccount: true, category: { include: { parent: true } }, _count: { select: { proofs: true } } }, orderBy: [{ date: "asc" }, { createdAt: "asc" }], take: 50000 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(personal ? "Sir personal" : "Entries");
  ws.columns = [
    { header: "Date", key: "date", width: 12 }, { header: "Type", key: "kind", width: 10 }, { header: "Category", key: "cat", width: 20 }, { header: "Sub category", key: "sub", width: 22 },
    { header: "Description", key: "desc", width: 40 }, { header: "Amount (PKR)", key: "amount", width: 14, style: { numFmt: "#,##0" } }, { header: "Paid by / holder", key: "from", width: 20 },
    { header: "Paid to", key: "to", width: 22 }, { header: "Notes", key: "notes", width: 30 }, { header: "Tags", key: "tags", width: 20 }, { header: "Status", key: "status", width: 12 }, { header: "Proof files", key: "proof", width: 11 }, { header: "Proof checked", key: "checked", width: 13 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const e of rows) {
    const main = e.category?.parent ?? e.category, sub = e.category?.parent ? e.category : null;
    ws.addRow({ date: e.date, kind: e.kind === "in" ? "Money in" : e.kind === "transfer" ? "Transfer" : "Expense", cat: main?.name ?? "", sub: sub?.name ?? "", desc: e.description, amount: e.amount, from: e.account.name, to: e.kind === "transfer" ? e.toAccount?.name ?? "" : e.party ?? "", notes: e.notes ?? "", tags: e.tags ?? "", status: e.status, proof: e._count.proofs + (e.receipt ? 1 : 0), checked: e.verifiedAt ? "Yes" : "" });
  }
  ws.getColumn("date").numFmt = "dd-mmm-yyyy";
  ws.views = [{ state: "frozen", ySplit: 1 }];
  await audit(user.id, "export", "finEntry", null, `Exported ${rows.length} finance entries`);
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="finance-${format(new Date(), "yyyy-MM-dd")}.xlsx"` } });
}
