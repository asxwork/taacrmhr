import { fileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";

/** Employee photo when there is one, otherwise initials. */
export function PersonAvatar({ name, photo, className }: { name: string; photo: string | null; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return photo ? <img src={fileUrl(photo)} alt="" className={cn("size-8 shrink-0 rounded-full object-cover", className)} /> : <Avatar name={name} className={className} />;
}
