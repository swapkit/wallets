import { describe, expect, test } from "bun:test";
import { findRouteIndexByBaseProvider } from "../use-swap-quote";

describe("findRouteIndexByBaseProvider", () => {
  test("returns the index of the route whose provider matches", () => {
    const routes = [{ providerName: "THORCHAIN" }, { providerName: "CHAINFLIP" }];

    expect(findRouteIndexByBaseProvider(routes, "CHAINFLIP")).toBe(1);
  });

  test("matches a streaming route by its base provider name", () => {
    const routes = [{ providerName: "MAYACHAIN" }, { providerName: "THORCHAIN_STREAMING" }];

    expect(findRouteIndexByBaseProvider(routes, "THORCHAIN")).toBe(1);
  });

  test("falls back to the first route when the provider is missing", () => {
    const routes = [{ providerName: "THORCHAIN" }, { providerName: null }];

    expect(findRouteIndexByBaseProvider(routes, "MAYACHAIN")).toBe(0);
    expect(findRouteIndexByBaseProvider(routes, null)).toBe(0);
    expect(findRouteIndexByBaseProvider(undefined, "CHAINFLIP")).toBe(0);
  });
});
