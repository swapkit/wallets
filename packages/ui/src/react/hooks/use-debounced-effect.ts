"use client";

import { type DependencyList, useEffect, useRef } from "react";

export function useDebouncedEffect(
  effect: () => void,
  deps: DependencyList,
  options?: { delay: number; runImmediately: boolean },
) {
  const { delay = 700, runImmediately = true } = options || {};

  const hasRunImmediatelyRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps handling is different for "debounce" effect
  useEffect(() => {
    if (!runImmediately) return;
    if (hasRunImmediatelyRef.current) return;

    hasRunImmediatelyRef.current = true;
    effect();
  }, [...deps, runImmediately]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps handling is different for "debounce" effect
  useEffect(() => {
    // prevent duplicate runs if `runImmediately` is true and the effect has not been run yet
    if (runImmediately && !hasRunImmediatelyRef.current) return;

    const handler = setTimeout(() => {
      effect();
    }, delay);

    return () => clearTimeout(handler);
  }, [...deps, delay]);
}
