// Next.js 16 "proxy" (formerly middleware): runs before matching pages render.
// It is the first line of defense: it keeps guests out of researcher pages and
// non-admins out of /admin. Every API route checks the role again on the server,
// so hiding a page is never the only protection.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

// /collections/:id is not listed: public collections are shareable; the API hides private ones.
const RESEARCHER_PAGES = ["/library", "/upload", "/my-papers"];
const ADMIN_PAGES = ["/admin"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const needsAdmin = matches(pathname, ADMIN_PAGES);
  const needsLogin = needsAdmin || matches(pathname, RESEARCHER_PAGES);
  if (!needsLogin) return NextResponse.next();

  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }
  if (needsAdmin && user.role !== "admin") {
    return NextResponse.redirect(new URL("/?denied=admin", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/library/:path*", "/upload/:path*", "/my-papers/:path*", "/admin/:path*"],
};
