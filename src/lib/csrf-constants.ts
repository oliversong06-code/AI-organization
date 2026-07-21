// Plain constants only — safe to import from Client Components.
// session-token.ts (server-only, uses next/headers) and mutationFetch.ts
// (client-only) both import from here instead of each other.
export const SESSION_COOKIE_NAME = "coa_session";
export const SESSION_HEADER_NAME = "x-coa-session";
