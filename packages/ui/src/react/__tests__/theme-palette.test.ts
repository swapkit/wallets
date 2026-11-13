import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";

// Raw Tailwind palette classes (sk-ui-text-red-400, sk-ui-bg-yellow-500/10, ...) only look right
// on the default dark background. Colours must go through the theme tokens so integrators'
// light presets keep their contrast. Status colours: success, warning, error and info.
const RAW_PALETTE_CLASS =
  /sk-ui-(?:text|bg|border|ring|fill|stroke|from|via|to|outline|decoration|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}(?:\/\d+)?/g;

// White and black have no shade (sk-ui-text-white, sk-ui-bg-white/[0.04]) and turn invisible on a
// light background. The lookahead keeps sk-ui-whitespace-* out.
const RAW_WHITE_BLACK_CLASS =
  /sk-ui-(?:(?:text|bg|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|divide|placeholder)-)?(?:white|black)(?![a-z-])(?:\/(?:\d+|\[[^\]]+\]))?/g;

// Opacity utilities only ever paired with white/black here; token colours take a /NN modifier instead.
const OPACITY_UTILITY_CLASS = /sk-ui-(?:text|bg|border|ring|divide|placeholder)-opacity-\d+/g;

// Files allowed to use white/black, relative to src/react. Everything else goes through tokens.
const WHITE_BLACK_ALLOWED: Record<string, string> = {
  "components/simple/asset-icon.tsx": "white initials on a fixed-colour fallback circle",
  "components/ui/font-family-field.tsx": "Studio only, always dark",
  "components/ui/radius-field.tsx": "Studio only, always dark",
  "components/ui/snippet-generator.tsx": "Studio only, always dark",
  "components/ui/toggle-field.tsx": "Studio only, always dark",
};
const STUDIO_DIR = "controls/";

const REACT_SRC = join(import.meta.dir, "..");

async function findOffenders(pattern: RegExp, isAllowed: (file: string) => boolean = () => false) {
  const offenders: string[] = [];

  for await (const file of new Glob("**/*.tsx").scan({ cwd: REACT_SRC })) {
    if (file.includes("__tests__") || isAllowed(file)) continue;
    const source = await Bun.file(join(REACT_SRC, file)).text();
    const matches = source.match(pattern);
    if (matches) offenders.push(`${file}: ${[...new Set(matches)].join(", ")}`);
  }

  return offenders;
}

describe("theme palette", () => {
  test("widget sources use theme tokens instead of raw Tailwind palette colours", async () => {
    expect(await findOffenders(RAW_PALETTE_CLASS)).toEqual([]);
  });

  test("widget sources use theme tokens instead of white or black", async () => {
    const isAllowed = (file: string) => file.startsWith(STUDIO_DIR) || file in WHITE_BLACK_ALLOWED;
    expect(await findOffenders(RAW_WHITE_BLACK_CLASS, isAllowed)).toEqual([]);
  });

  test("widget sources do not use opacity utilities", async () => {
    expect(await findOffenders(OPACITY_UTILITY_CLASS)).toEqual([]);
  });

  test("every white/black exception still exists", async () => {
    for (const file of Object.keys(WHITE_BLACK_ALLOWED)) {
      expect(await Bun.file(join(REACT_SRC, file)).exists(), file).toBe(true);
    }
  });
});
