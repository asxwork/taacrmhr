"use client";

/**
 * An uploaded photo that hides itself if the file is missing (e.g. deleted from the server), so the card's
 * placeholder background shows instead of a broken-image icon.
 */
export function SafeImg(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- user uploads served from /api/files; callers pass alt
  return <img {...props} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />;
}
