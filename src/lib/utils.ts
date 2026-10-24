import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export const fmtDate = (d: Date | null | undefined) => (d ? format(d, "d MMM yyyy") : "—");
export const fmtDateTime = (d: Date | null | undefined) => (d ? format(d, "d MMM yyyy, h:mm a") : "—");
export const fmtAgo = (d: Date | null | undefined) => (d ? formatDistanceToNow(d, { addSuffix: true }) : "Never");

/** Shared shape returned by form server actions. */
export type FormState = { error?: string; ok?: boolean } | undefined;

export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
