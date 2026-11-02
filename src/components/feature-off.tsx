import { PowerOff } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";

/** Shown instead of a page whose feature is switched off company-wide (Settings → Features). */
export function FeatureOff({ label, canManage }: { label: string; canManage: boolean }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-canvas text-muted" aria-hidden><PowerOff className="size-6" /></span>
      <h1 className="text-lg font-semibold">{label} is switched off</h1>
      <p className="mt-2 text-sm text-muted">This feature isn’t used by your company right now. Its data is kept and comes back when it’s switched on.</p>
      <div className="mt-6 flex justify-center gap-2">
        {canManage && <LinkButton href="/settings/features" variant="secondary">Manage features</LinkButton>}
        <LinkButton href="/home?all=1" variant="secondary">Go to apps</LinkButton>
      </div>
    </Card>
  );
}
