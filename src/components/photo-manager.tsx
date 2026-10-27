import Link from "next/link";
import { ImagePlus, Star, X } from "lucide-react";
import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, EmptyState } from "@/components/ui";
import type { FormState } from "@/lib/utils";
import { SafeImg } from "@/components/safe-img";

type Photo = { id: string; path: string };

/**
 * Photo gallery for a unit or project: the big picture (?photo= picks one), thumbnails, and for editors an
 * uploader plus "make cover" / remove on each photo. The first photo is the cover used in lists and on deals.
 */
export function PhotoManager({ photos, title, path, selectedId, canEdit, owner, upload, setCover, remove }: {
  photos: Photo[];
  title: string;
  /** Page path, for the ?photo= thumbnail links. */
  path: string;
  selectedId?: string;
  canEdit: boolean;
  /** Hidden field naming the unit/project the upload belongs to. */
  owner: { name: string; value: string };
  upload: (state: FormState, fd: FormData) => Promise<FormState>;
  setCover: (fd: FormData) => Promise<void>;
  remove: (fd: FormData) => Promise<void>;
}) {
  const main = photos.find((p) => p.id === selectedId) ?? photos[0];
  return (
    <>
      <Card className="overflow-hidden">
        {main ? (
          <>
            { }
            <SafeImg src={fileUrl(main.path)} alt={title} className="aspect-[16/10] w-full bg-canvas object-cover" />
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto p-2">
                {photos.map((p, i) => (
                  <Link key={p.id} href={`${path}?photo=${p.id}`} scroll={false} className={cn("relative shrink-0 rounded-md", p.id === main.id && "ring-2 ring-navy-900")}>
                    { }
                    <SafeImg src={fileUrl(p.path)} alt="" className="size-16 rounded-md object-cover" loading="lazy" />
                    {i === 0 && <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] font-medium text-white">Cover</span>}
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <EmptyState title="No photos yet" description={canEdit ? "Add photos below. The first one becomes the cover." : undefined} />
        )}
      </Card>

      {canEdit && (
        <Card className="p-4">
          <ActionForm action={upload} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name={owner.name} value={owner.value} />
            <ImagePlus className="size-4 text-muted" />
            <input name="images" type="file" multiple required accept="image/jpeg,image/png,image/webp" aria-label="Photos" className="flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-1.5 file:text-white" />
            <SubmitButton variant="secondary" pendingText="Uploading…">Upload</SubmitButton>
          </ActionForm>
          {photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {photos.map((p, i) => (
                <div key={p.id} className="relative">
                  { }
                  <SafeImg src={fileUrl(p.path)} alt="" className={cn("size-16 rounded-md object-cover", i === 0 && "ring-2 ring-gold-400")} loading="lazy" />
                  <form action={remove} className="absolute -right-1.5 -top-1.5">
                    <input type="hidden" name="id" value={p.id} />
                    <button title="Remove photo" aria-label="Remove photo" className="rounded-full bg-surface p-0.5 text-muted shadow hover:text-red-600"><X className="size-3" /></button>
                  </form>
                  {i === 0 ? (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded bg-gold-400 px-1 text-[9px] font-semibold text-white">Cover</span>
                  ) : (
                    <form action={setCover} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2">
                      <input type="hidden" name="id" value={p.id} />
                      <button title="Make this the cover photo" className="flex items-center gap-0.5 whitespace-nowrap rounded bg-surface px-1 text-[9px] font-medium text-ink shadow hover:text-gold-600">
                        <Star className="size-2.5" /> Cover
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">JPG, PNG or WebP · up to 5 MB each · 12 photos max. The cover shows in lists and on deals.</p>
        </Card>
      )}
    </>
  );
}
