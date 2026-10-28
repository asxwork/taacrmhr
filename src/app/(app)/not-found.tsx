import { SearchX } from "lucide-react";
import { Card, LinkButton } from "@/components/ui";

/**
 * Shown inside the app shell when a record can't be opened: it was deleted, reassigned to someone else
 * (e.g. an on-hold lead), or is outside what this user may see. Old notification links often land here.
 */
export default function NotFound() {
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-canvas text-muted" aria-hidden><SearchX className="size-6" /></span>
      <h1 className="text-lg font-semibold">This isn’t available to you</h1>
      <p className="mt-2 text-sm text-muted">
        It may have been deleted or reassigned to someone else, or it’s outside what your role can see. Ask your manager if you think you should have access.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <LinkButton href="/home?all=1" variant="secondary">Go to apps</LinkButton>
        <LinkButton href="/notifications" variant="secondary">Notifications</LinkButton>
      </div>
    </Card>
  );
}
