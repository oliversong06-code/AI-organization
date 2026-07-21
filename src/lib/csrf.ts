import { NextResponse } from "next/server";
import { assertSessionToken, SessionTokenError } from "@/lib/session-token";

/**
 * Two-layer CSRF defense for every mutation API route (approve/reject,
 * direct control endpoints, settings changes): a same-origin check plus a
 * double-submit session-token check (src/lib/session-token.ts, cookie
 * issued by middleware.ts). The app only ever binds to 127.0.0.1, but a
 * malicious page open in another tab could still try to POST to
 * localhost — this blocks that.
 */
export class CrossOriginRequestError extends Error {
  constructor() {
    super("cross-origin request blocked");
  }
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin browser requests don't always send Origin; nothing to compare against
  const host = req.headers.get("host");
  const originHost = safeHost(origin);
  if (!originHost || originHost !== host) {
    throw new CrossOriginRequestError();
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Call at the top of every mutation route handler. Throws
 * CrossOriginRequestError or SessionTokenError — both map to HTTP 403. */
export async function assertMutationRequest(req: Request) {
  assertSameOrigin(req);
  await assertSessionToken(req);
}

/** Convenience for route handlers: `const blocked = await csrfGuard(req); if (blocked) return blocked;` */
export async function csrfGuard(req: Request): Promise<NextResponse | null> {
  try {
    await assertMutationRequest(req);
    return null;
  } catch (err) {
    if (err instanceof CrossOriginRequestError || err instanceof SessionTokenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}

export { SessionTokenError };
