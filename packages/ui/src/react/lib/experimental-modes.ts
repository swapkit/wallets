import type { WidgetMode } from "../types";

export const EXPERIMENTAL_MODES: ReadonlySet<WidgetMode> = new Set<WidgetMode>(["limit"]);

export function isExperimentalMode(mode: WidgetMode): boolean {
  return EXPERIMENTAL_MODES.has(mode);
}
