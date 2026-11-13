import { createContext, useContext } from "react";
import { DEFAULT_WIDGET_MODES } from "../lib/widget-modes";
import type { WidgetMode } from "../types";

export type LimitFormPair = { buyAsset: string; sellAsset: string };

type WidgetModesContextValue = { modes: ReadonlyArray<WidgetMode>; openLimitForm: (pair: LimitFormPair) => void };

export const WidgetModesContext = createContext<WidgetModesContextValue>({
  modes: DEFAULT_WIDGET_MODES,
  openLimitForm: () => {},
});

export function useWidgetModes() {
  return useContext(WidgetModesContext).modes;
}

export function useOpenLimitForm() {
  return useContext(WidgetModesContext).openLimitForm;
}
