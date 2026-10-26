import { NAV_ITEMS } from "@/lib/nav";
import { requirePermission } from "@/lib/permissions";
import { requireUser } from "@/lib/auth";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

/** Placeholder for a menu page that's planned but not built yet (nav item with `phase`); null for any other path. */
export async function comingSoon(href: string) {
  const item = NAV_ITEMS.find((i) => i.href === href && i.phase);
  if (!item) return null;
  if (item.module) await requirePermission(item.module);
  else await requireUser();
  return (
    <>
      <PageHeader title={item.label} />
      <Card>
        <EmptyState
          title="Coming soon"
          description="This page is planned and your access to it is already set up."
          action={<LinkButton href="/home" variant="secondary">Back to apps</LinkButton>}
        />
      </Card>
    </>
  );
}
