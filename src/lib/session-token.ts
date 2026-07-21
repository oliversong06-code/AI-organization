import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_HEADER_NAME } from "./csrf-constants";

export { SESSION_COOKIE_NAME, SESSION_HEADER_NAME };

export class SessionTokenError extends Error {
  constructor() {
    super("missing or invalid session token");
  }
}

/** Double-submit CSRF check, second layer alongside the same-origin check
 * in csrf.ts. The cookie is set by middleware.ts; the client echoes it via
 * mutationFetch.ts. */
export async function assertSessionToken(req: Request) {
  const store = await cookies();
  const cookieToken = store.get(SESSION_COOKIE_NAME)?.value;
  const headerToken = req.headers.get(SESSION_HEADER_NAME);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new SessionTokenError();
  }
}
