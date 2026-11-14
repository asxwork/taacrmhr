import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { categoryTree } from "@/lib/finance";
import { readReceipt, receiptReadingOn } from "@/lib/finance-receipt";

// POST a bill photo/PDF (field "file") → { amount, date, payee, description, categoryId } to fill the expense form.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "finance", "create")) return Response.json({ error: "Not allowed." }, { status: 403 });
  if (!receiptReadingOn()) return Response.json({ error: "off" }, { status: 404 });
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "No file." }, { status: 400 });
  const tree = (await categoryTree()).filter((c) => !c.personal);
  const options = tree.flatMap((c) => [{ id: c.id, label: c.name }, ...c.subs.map((s) => ({ id: s.id, label: `${c.name} › ${s.name}` }))]);
  const r = await readReceipt(file, options.map((o) => o.label));
  if ("error" in r) return Response.json(r, { status: 422 });
  return Response.json({ amount: r.amount || null, date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null, payee: r.payee || null, description: r.description || null, categoryId: options.find((o) => o.label === r.category)?.id ?? null });
}
