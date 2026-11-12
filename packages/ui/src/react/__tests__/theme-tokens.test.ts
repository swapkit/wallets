import { describe, expect, test } from "bun:test";

import { getThemeTokenCssVariables } from "../components/config";

describe("getThemeTokenCssVariables", () => {
  test("status tokens set the text colour and derive the tinted background", () => {
    expect(getThemeTokenCssVariables({ warning: "32 95% 44%" })).toEqual({
      "--sk-ui-warning": "32 95% 44% / 0.16",
      "--sk-ui-warning-foreground": "32 95% 44%",
    });
  });

  test("an alpha channel on a status token does not leak into the tint", () => {
    expect(getThemeTokenCssVariables({ error: "0 72% 51% / 0.9" })["--sk-ui-error"]).toBe("0 72% 51% / 0.16");
  });
});
