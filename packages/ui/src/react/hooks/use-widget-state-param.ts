"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useCallback } from "react";

export function useWidgetStateParam({
  key,
  defaultValue,
  syncUrl,
  value,
  onChange,
}: {
  key: string;
  defaultValue: string;
  syncUrl: boolean;
  value: string | null;
  onChange: (value: string) => void;
}): readonly [string, (value: string) => void] {
  const [queryValue, setQueryValue] = useQueryState(key, parseAsString.withDefault(defaultValue));

  const setValue = useCallback(
    (nextValue: string) => {
      if (syncUrl) {
        void setQueryValue(nextValue);
        return;
      }

      onChange(nextValue);
    },
    [setQueryValue, onChange, syncUrl],
  );

  return [syncUrl ? queryValue : (value ?? defaultValue), setValue] as const;
}
