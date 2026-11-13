import type { ControlsStoreFieldValues } from "../types";

export type PresetColors = Partial<
  Pick<
    ControlsStoreFieldValues,
    | "colorPrimary"
    | "colorSecondary"
    | "colorAccent"
    | "colorPrimaryButton"
    | "colorPrimaryButtonText"
    | "colorText"
    | "colorMutedText"
    | "colorBorder"
    | "colorBgHover"
    | "colorBgActive"
    | "colorBgOverlay"
    | "colorSuccess"
    | "colorWarning"
    | "colorError"
    | "colorInfo"
    | "borderRadius"
  >
>;

export type Mode = "dark" | "light";

export type Preset = { name: string; dark: PresetColors; light: PresetColors };

// Status colours tuned per mode: bright on dark backgrounds, darkened for AA contrast on light ones
const DARK_STATUS_COLORS = {
  colorError: "0 91% 74%",
  colorInfo: "213 94% 68%",
  colorSuccess: "142 71% 45%",
  colorWarning: "48 96% 53%",
} as const satisfies PresetColors;

const LIGHT_STATUS_COLORS = {
  colorError: "0 72% 40%",
  colorInfo: "221 83% 43%",
  colorSuccess: "160 69% 24%",
  colorWarning: "30 95% 29%",
} as const satisfies PresetColors;

// Dark variants share the same neutral text/border/hover layer (white-on-black with
// alpha) — defined once and reused so switching between dark presets, or Light → Dark,
// is a complete colour replacement instead of inheriting stale tokens.
const DARK_NEUTRALS = {
  borderRadius: "0.5rem",
  colorBgActive: "0 0% 100% / 0.12",
  colorBgHover: "0 0% 100% / 0.08",
  colorBgOverlay: "0 0% 0% / 0.8",
  colorBorder: "0 0% 100% / 0.12",
  colorMutedText: "0 0% 100% / 0.64",
  colorText: "0 0% 100% / 0.92",
} as const satisfies PresetColors;

export const PRESETS: ReadonlyArray<Preset> = [
  {
    dark: {
      ...DARK_NEUTRALS,
      ...DARK_STATUS_COLORS,
      colorAccent: "140 87% 79%",
      colorPrimary: "140 6% 8%",
      colorPrimaryButton: "0 0% 100% / 0.92",
      colorPrimaryButtonText: "140 6% 8%",
      colorSecondary: "120 3% 13%",
    },
    light: {
      ...LIGHT_STATUS_COLORS,
      borderRadius: "0.5rem",
      colorAccent: "140 70% 38%",
      colorBgActive: "140 8% 12% / 0.08",
      colorBgHover: "140 8% 12% / 0.05",
      colorBgOverlay: "0 0% 0% / 0.48",
      colorBorder: "140 8% 12% / 0.10",
      colorMutedText: "140 6% 40%",
      colorPrimary: "0 0% 100%",
      colorPrimaryButton: "140 8% 12%",
      colorPrimaryButtonText: "0 0% 100%",
      colorSecondary: "140 14% 96%",
      colorText: "140 8% 12%",
    },
    name: "Default",
  },
  {
    dark: {
      ...DARK_NEUTRALS,
      ...DARK_STATUS_COLORS,
      colorAccent: "210 95% 70%",
      colorPrimary: "230 25% 8%",
      colorPrimaryButton: "210 95% 70%",
      colorPrimaryButtonText: "230 25% 8%",
      colorSecondary: "230 18% 14%",
    },
    light: {
      ...LIGHT_STATUS_COLORS,
      borderRadius: "0.5rem",
      colorAccent: "230 75% 56%",
      colorBgActive: "230 30% 14% / 0.08",
      colorBgHover: "230 30% 14% / 0.05",
      colorBgOverlay: "0 0% 0% / 0.48",
      colorBorder: "230 30% 14% / 0.10",
      colorMutedText: "230 14% 42%",
      colorPrimary: "0 0% 100%",
      colorPrimaryButton: "230 35% 16%",
      colorPrimaryButtonText: "0 0% 100%",
      colorSecondary: "230 22% 96%",
      colorText: "230 30% 14%",
    },
    name: "Midnight",
  },
  {
    dark: {
      ...DARK_NEUTRALS,
      ...DARK_STATUS_COLORS,
      colorAccent: "22 95% 65%",
      colorPrimary: "20 18% 9%",
      colorPrimaryButton: "22 95% 65%",
      colorPrimaryButtonText: "20 18% 9%",
      colorSecondary: "20 12% 15%",
    },
    light: {
      ...LIGHT_STATUS_COLORS,
      borderRadius: "0.5rem",
      colorAccent: "18 80% 50%",
      colorBgActive: "20 30% 14% / 0.08",
      colorBgHover: "20 30% 14% / 0.05",
      colorBgOverlay: "0 0% 0% / 0.48",
      colorBorder: "20 30% 14% / 0.10",
      colorMutedText: "20 14% 42%",
      colorPrimary: "30 50% 99%",
      colorPrimaryButton: "18 80% 50%",
      colorPrimaryButtonText: "0 0% 100%",
      colorSecondary: "24 60% 96%",
      colorText: "20 30% 14%",
    },
    name: "Sunset",
  },
];
