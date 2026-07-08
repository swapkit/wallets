import { describe, expect, test } from "bun:test";
import { WalletOption } from "@swapkit/helpers";
import { detectMissingWalletConfig, getDisallowedWallets } from "../wallet-config-requirements";

describe("wallet config requirements", () => {
  test("tracks shared required fields for wallets backed by the same config", () => {
    const summaries = detectMissingWalletConfig({ apiKeys: { walletConnectProjectId: "" } }, [
      WalletOption.WALLETCONNECT,
      WalletOption.TRUSTWALLET_WEB,
    ]);

    expect(summaries.map((summary) => summary.wallet).sort()).toEqual(
      [WalletOption.TRUSTWALLET_WEB, WalletOption.WALLETCONNECT].sort(),
    );
    expect(new Set(summaries.flatMap((summary) => summary.missingRequired.map((field) => field.path)))).toEqual(
      new Set(["apiKeys.walletConnectProjectId"]),
    );
  });

  test("disallows wallets from the current config state", () => {
    const disallowed = getDisallowedWallets({
      apiKeys: { passkeys: "", walletConnectProjectId: "project-id", xaman: "" },
      integrations: { radix: { applicationName: "", applicationVersion: "", dAppDefinitionAddress: "" } },
    });

    expect(disallowed.has(WalletOption.WALLETCONNECT)).toBe(false);
    expect(disallowed.has(WalletOption.TRUSTWALLET_WEB)).toBe(false);
    expect(disallowed.has(WalletOption.XAMAN)).toBe(true);
    expect(disallowed.has(WalletOption.PASSKEYS)).toBe(true);
    expect(disallowed.has(WalletOption.KEEPKEY)).toBe(false);
    expect(disallowed.has(WalletOption.RADIX_WALLET)).toBe(true);
  });
});
