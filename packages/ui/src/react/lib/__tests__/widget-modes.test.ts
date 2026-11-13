import { describe, expect, test } from "bun:test";

import { resolveWidgetModes } from "../widget-modes";

describe("resolveWidgetModes", () => {
  const cases: Array<{ name: string; modes?: string[]; isDev: boolean; expected: string[] }> = [
    { expected: ["swap"], isDev: false, name: "defaults to swap" },
    { expected: ["limit", "swap"], isDev: true, modes: ["limit", "swap"], name: "keeps list order" },
    { expected: ["swap"], isDev: false, modes: ["swap", "limit"], name: "hides limit outside dev" },
    {
      expected: ["swap", "limit"],
      isDev: true,
      modes: ["swap", "limit", "bridge", "swap"],
      name: "allows experimental modes in dev and drops unknown values and duplicates",
    },
    { expected: ["swap"], isDev: false, modes: ["limit"], name: "falls back to swap instead of resolving empty" },
  ];

  for (const { name, modes, isDev, expected } of cases) {
    test(name, () => {
      expect(resolveWidgetModes({ isDev, modes })).toEqual(expected as ReturnType<typeof resolveWidgetModes>);
    });
  }
});
