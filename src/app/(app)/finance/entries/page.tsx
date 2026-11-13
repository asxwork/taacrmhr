import { requirePermission } from "@/lib/permissions";
import { EntriesView, type EntrySP } from "../entries-view";

export const metadata = { title: "Entries · Finance" };

export default async function EntriesPage({ searchParams }: { searchParams: Promise<EntrySP> }) {
  const user = await requirePermission("finance");
  return <EntriesView user={user} sp={await searchParams} personal={false} base="/finance/entries" />;
}
