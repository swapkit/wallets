import type { WidgetMode } from "../types";
import { isExperimentalMode } from "./experimental-modes";

export const WIDGET_MODES: ReadonlyArray<WidgetMode> = ["swap", "limit"];
export const DEFAULT_WIDGET_MODES: readonly [WidgetMode, ...WidgetMode[]] = ["swap"];

export const WIDGET_MODE_LABELS: Record<WidgetMode, string> = { limit: "Limit", swap: "Swap" };

function isWidgetMode(value: unknown): value is WidgetMode {
  return WIDGET_MODES.includes(value as WidgetMode);
}

export function resolveWidgetModes({
  modes,
  isDev,
}: {
  modes?: ReadonlyArray<string> | null;
  isDev: boolean;
}): [WidgetMode, ...WidgetMode[]] {
  const resolved: WidgetMode[] = [];
  for (const mode of modes ?? DEFAULT_WIDGET_MODES) {
    if (!isWidgetMode(mode) || resolved.includes(mode)) continue;
    if (!isDev && isExperimentalMode(mode)) continue;
    resolved.push(mode);
  }
  const [first, ...rest] = resolved;
  return first ? [first, ...rest] : [...DEFAULT_WIDGET_MODES];
}
