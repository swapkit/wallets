import { createContext, useContext } from "react";

// Portaled content (dialogs, sheets, tooltips) renders outside the widget root and needs the theme re-applied
export const ThemeStyleContext = createContext<React.CSSProperties | undefined>(undefined);

export function useThemeStyle() {
  return useContext(ThemeStyleContext);
}
