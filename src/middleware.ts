import { NextResponse, type NextRequest } from "next/server";

// Cheap gate: no session cookie → login. Real validation happens server-side in getCurrentUser().
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("tad_session");
  const isPublic = req.nextUrl.pathname === "/login" || req.nextUrl.pathname === "/verify-email" || req.nextUrl.pathname === "/set-password" || req.nextUrl.pathname.startsWith("/onboard/") || req.nextUrl.pathname === "/api/status";
  if (!hasSession && !isPublic) return NextResponse.redirect(new URL("/login", req.url));
  // "View as" is read-only: refuse every change (server actions and API writes) until the Super Admin exits.
  if (req.cookies.has("taa_view_as") && !["GET", "HEAD", "OPTIONS"].includes(req.method) && !isPublic && !req.nextUrl.pathname.startsWith("/api/view-as")) {
    return new NextResponse("Read-only: you are viewing the app as another user. Exit “View as” to make changes.", { status: 403 });
  }
  // The layout reads this to pick the app (CRM/HR/…) and sidebar width before the page renders.
  const headers = new Headers(req.headers);
  headers.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|brand/|icon.png|manifest.webmanifest|sw.js|api/cron|api/webhooks|api/v1|iclock).*)"],
};
