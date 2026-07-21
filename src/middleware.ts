import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "coa_session";

/** Issues the double-submit CSRF token cookie on first visit. Non-httpOnly
 * on purpose — client code reads it via document.cookie and echoes it back
 * as a header on mutation requests (src/lib/mutationFetch.ts); the
 * mutation routes verify header === cookie (src/lib/session-token.ts).
 * A cross-origin page can't read our cookie value (browser same-origin
 * policy), so it can't forge a matching header even though the cookie
 * itself isn't httpOnly. */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get(COOKIE_NAME)) {
    const token = crypto.randomUUID().replace(/-/g, "");
    res.cookies.set(COOKIE_NAME, token, { httpOnly: false, sameSite: "lax", path: "/" });
  }
  return res;
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
