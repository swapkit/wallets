import { describe, expect, test } from "bun:test";

import { DEFAULT_THEME_TOKENS, getThemeTokenCssVariables } from "../components/config";
import { PRESETS } from "../controls/theme-presets";

type Rgb = [number, number, number];

const AA_NORMAL_TEXT = 4.5;
const STATUSES = [
  ["success", "colorSuccess"],
  ["warning", "colorWarning"],
  ["error", "colorError"],
  ["info", "colorInfo"],
] as const;

function parseHsl(hsl: string) {
  const [color, alpha] = hsl.split("/").map((part) => part.trim());
  const [h, s, l] = (color ?? "").split(" ").map((part) => Number.parseFloat(part));
  if (h === undefined || s === undefined || l === undefined) throw new Error(`Bad HSL: ${hsl}`);
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return {
    alpha: alpha === undefined ? 1 : Number.parseFloat(alpha),
    rgb: [channel(0), channel(8), channel(4)] as Rgb,
  };
}

function luminance(rgb: Rgb) {
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Status text is shown on the bare surface and on its own tint, derived exactly as the widget does
function expectStatusReadable(status: "success" | "warning" | "error" | "info", value: string, surface: string) {
  const text = parseHsl(value).rgb;
  const base = parseHsl(surface).rgb;
  const tint = parseHsl(getThemeTokenCssVariables({ [status]: value })[`--sk-ui-${status}`] as string);
  const tinted = text.map((c, i) => c * tint.alpha + (base[i] ?? 0) * (1 - tint.alpha)) as Rgb;

  expect(contrast(text, base), `${status} on ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  expect(contrast(text, tinted), `${status} on its tint over ${surface}`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
}

describe("status colour contrast", () => {
  test("default theme: status colours read on the background, surface and their tint", () => {
    for (const [status] of STATUSES) {
      for (const surface of [DEFAULT_THEME_TOKENS.background, DEFAULT_THEME_TOKENS.surface]) {
        expectStatusReadable(status, DEFAULT_THEME_TOKENS[status], surface);
      }
    }
  });

  for (const preset of PRESETS) {
    for (const mode of ["dark", "light"] as const) {
      test(`${preset.name} ${mode}: status colours read on the background, surface and their tint`, () => {
        const colors = preset[mode];
        for (const [status, field] of STATUSES) {
          const value = colors[field];
          expect(value, `${field} missing`).toBeDefined();
          for (const surface of [colors.colorPrimary, colors.colorSecondary]) {
            expect(surface, "surface missing").toBeDefined();
            expectStatusReadable(status, value as string, surface as string);
          }
        }
      });
    }
  }
});
