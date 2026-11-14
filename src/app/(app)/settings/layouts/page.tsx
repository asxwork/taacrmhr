import { LayoutsView } from "./layouts-view";

export const metadata = { title: "Layouts" };

export default function LayoutsPage({ searchParams }: { searchParams: Promise<{ new?: string; edit?: string; app?: string; aud?: string; role?: string }> }) {
  return <LayoutsView searchParams={searchParams} base="/settings/layouts" />;
}
