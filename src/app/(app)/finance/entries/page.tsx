import { redirect } from "next/navigation";
import { defaultViewFor } from "../entry-view-prefs";
import { requirePermission } from "@/lib/permissions";
import { EntriesView, type EntrySP } from "../entries-view";

export const metadata = { title: "Entries · Finance" };

export default async function EntriesPage({ searchParams }: { searchParams: Promise<EntrySP> }) {
  const user = await requirePermission("finance");
  const sp = await searchParams;
  // Opened plainly (menu, after saving an edit from an entry page): go to the user's default money holder.
  if (!Object.keys(sp).length) {
    const def = await defaultViewFor(user.id);
    if (def) redirect(`/finance/entries?${def}`);
  }
  return <EntriesView user={user} sp={sp} personal={false} base="/finance/entries" />;
}
