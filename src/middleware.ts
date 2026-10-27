import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no session cookie → login. Real validation happens server-side in getCurrentUser().
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("tad_session");
  const isPublic = req.nextUrl.pathname === "/login" || req.nextUrl.pathname === "/verify-email";
  if (!hasSession && !isPublic) return NextResponse.redirect(new URL("/login", req.url));
  // The layout reads this to pick the app (CRM/HR/…) and sidebar width before the page renders.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|brand/|icon.png|manifest.webmanifest|api/cron|api/webhooks|api/v1|iclock).*)"],
};
