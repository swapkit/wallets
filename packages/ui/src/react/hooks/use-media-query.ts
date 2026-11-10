"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. SSR-safe — returns `false` on the server and
 * during the first client render, then resolves to the live `matchMedia` result
 * on mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handle = (event: MediaQueryListEvent | MediaQueryList) => setMatches(event.matches);
    handle(mql);
    mql.addEventListener("change", handle);
    return () => mql.removeEventListener("change", handle);
  }, [query]);

  return matches;
}
