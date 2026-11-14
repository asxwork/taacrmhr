import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { EntriesView, type EntrySP } from "../entries-view";

export const metadata = { title: "Entries · Finance" };

export default async function EntriesPage({ searchParams }: { searchParams: Promise<EntrySP> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  // Opened plainly (menu, after saving an edit from an entry page): go to the user's default money holder.
  if (!Object.keys(sp).length) {
    const def = (await db.setting.findUnique({ where: { key: `fin.defaultHolder.${user.id}` } }))?.value;
    if (def) redirect(`/finance/entries?holder=${def}`);
  }
  return <EntriesView user={user} sp={sp} personal={false} base="/finance/entries" />;
}
