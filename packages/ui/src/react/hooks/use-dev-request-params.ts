"use client";

import { useEffect, useMemo, useState } from "react";
import { isDevToolingEnabled } from "../lib/node-env";

/**
 * Parse one of the studio's "Additional Request Params" fields from localStorage.
 * Returns null unless the studio toggle is on AND the text parses to a plain
 * JSON object — the controls form validates on input, but localStorage can
 * hold stale/hand-edited data.
 */
function parseRequestParamsFromLocalStorage(fieldKey: "quoteParams" | "swapParams"): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;

  try {
    const formValues = localStorage.getItem("formValues");
    if (!formValues) return null;

    const parsedFormValues: unknown = JSON.parse(formValues);
    if (!parsedFormValues || typeof parsedFormValues !== "object" || Array.isArray(parsedFormValues)) return null;
    const storedValues = parsedFormValues as Record<string, unknown>;
    if (storedValues.requestParamsEnabled !== true) return null;

    const requestParams = storedValues[fieldKey];
    if (!requestParams || typeof requestParams !== "string") return null;

    const parsed: unknown = JSON.parse(requestParams);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (Object.keys(parsed).length === 0) return null;

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Extra request parameters the Widget Studio merges into the /quote and /swap
 * request bodies. Studio-only testing escape hatch: sourced from the settings
 * sidebar (persisted in localStorage) and applied ONLY where dev tooling is
 * enabled (non-production NODE_ENV builds, plus the deployed dev/stage studio
 * hosts) while the studio's "Additional Request Params" toggle is on —
 * returns null everywhere else, including production embeds. Requests keep
 * going to the configured API / Dev API endpoints; only the bodies change.
 */
export function useDevRequestParams(): {
  quoteParams: Record<string, unknown> | null;
  swapParams: Record<string, unknown> | null;
} {
  // Same re-read triggers as SwapKitConfigProvider: cross-tab `storage` events
  // and the same-tab `swapkit-settings-changed` custom event from the form.
  const [localStorageVersion, setLocalStorageVersion] = useState(0);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "formValues") setLocalStorageVersion((v) => v + 1);
    };
    const handleLocalUpdate = () => setLocalStorageVersion((v) => v + 1);

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("swapkit-settings-changed", handleLocalUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("swapkit-settings-changed", handleLocalUpdate);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: localStorageVersion triggers re-read of localStorage
  return useMemo(
    () =>
      isDevToolingEnabled()
        ? {
            quoteParams: parseRequestParamsFromLocalStorage("quoteParams"),
            swapParams: parseRequestParamsFromLocalStorage("swapParams"),
          }
        : { quoteParams: null, swapParams: null },
    [localStorageVersion],
  );
}
