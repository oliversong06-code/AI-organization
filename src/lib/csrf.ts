/**
 * Same-origin check for mutation API routes (approve/reject, direct
 * control endpoints, settings changes). The app only ever binds to
 * 127.0.0.1, but a malicious page open in another tab could still try to
 * POST to localhost — this blocks that. The additional local
 * session-token layer mentioned in the plan is added in step 14 alongside
 * the settings screen; this same-origin check is the primary defense and
 * stands on its own until then.
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
