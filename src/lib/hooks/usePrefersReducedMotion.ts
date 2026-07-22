import { useEffect, useState } from "react";

/** Client-only — mirrors the OS/browser "reduce motion" accessibility
 * setting so animated office UI (status pulse rings, etc) can turn itself
 * off. The lazy useState initializer computes the correct value the
 * moment this mounts client-side (falling back to `false` during SSR,
 * where matchMedia doesn't exist) — the effect only subscribes to later
 * changes, it never sets state synchronously on mount itself. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return reduced;
}
