import { useEffect, useState } from "react";

export const FIRST_LOAD_CAP_MS = 3_000;

export function useFirstLoad(key: string, isLoading: boolean, capMs = FIRST_LOAD_CAP_MS) {
  const [expiredKeys, setExpiredKeys] = useState<ReadonlySet<string>>(() => new Set());
  const isWaiting = isLoading && !expiredKeys.has(key);

  useEffect(() => {
    if (!isWaiting) return;
    const id = setTimeout(() => setExpiredKeys((prev) => new Set(prev).add(key)), capMs);
    return () => clearTimeout(id);
  }, [capMs, isWaiting, key]);

  return isWaiting;
}
