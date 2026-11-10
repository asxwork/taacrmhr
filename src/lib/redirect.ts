import { NextResponse } from "next/server";

/**
 * Redirect to a path on this site. The Location is relative ("/settings/backup"), so the browser stays on the
 * address it is already on: behind Hostinger's proxy `req.url` is the internal 0.0.0.0:3000, which must never
 * be sent back to the browser.
 */
export function redirectTo(path: string, status: 302 | 303 | 307 = 307) {
  return new NextResponse(null, { status, headers: { Location: path.startsWith("/") ? path : `/${path}` } });
}
