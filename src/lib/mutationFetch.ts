"use client";

import { SESSION_COOKIE_NAME, SESSION_HEADER_NAME } from "./csrf-constants";

function readSessionToken(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Use for every mutating (POST/PATCH/DELETE) fetch from client
 * components — attaches the CSRF double-submit header. Plain GETs don't
 * need it. */
export async function mutationFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = readSessionToken();
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), [SESSION_HEADER_NAME]: token ?? "" },
  });
}
