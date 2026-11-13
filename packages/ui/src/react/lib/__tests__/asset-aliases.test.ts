import { describe, expect, test } from "bun:test";

import { canonicalAssetIdentifier, isAssetIdentifierAlias } from "../asset-aliases";

const ARC_ERC20_USDC = "ARC.USDC-0x3600000000000000000000000000000000000000";

describe("asset identifier aliases", () => {
  test("maps Arc's ERC-20 USDC to the native gas asset", () => {
    expect(isAssetIdentifierAlias(ARC_ERC20_USDC)).toBe(true);
    expect(canonicalAssetIdentifier(ARC_ERC20_USDC)).toBe("ARC.USDC");
  });

  test("matches the alias regardless of address casing", () => {
    expect(isAssetIdentifierAlias(ARC_ERC20_USDC.toLowerCase())).toBe(true);
    expect(canonicalAssetIdentifier(ARC_ERC20_USDC.toUpperCase())).toBe("ARC.USDC");
  });

  test("leaves the canonical identifier and unrelated assets untouched", () => {
    expect(isAssetIdentifierAlias("ARC.USDC")).toBe(false);
    expect(canonicalAssetIdentifier("ARC.USDC")).toBe("ARC.USDC");
    expect(isAssetIdentifierAlias("ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")).toBe(false);
    expect(canonicalAssetIdentifier("ETH.ETH")).toBe("ETH.ETH");
  });
});
