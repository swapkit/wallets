import { describe, expect, test } from "bun:test";

import { buildRuntimeSdkConfigPatch, buildSdkConfigPatch } from "../build-sdk-config-patch";

describe("Ledger Wallet credentials", () => {
  test("the snippet patch leaves empty credentials out", () => {
    expect(buildSdkConfigPatch({ integrations: { ledgerWalletProvider: { apiKey: "", dAppIdentifier: "" } } })).toEqual(
      {},
    );
  });

  test("the runtime patch clears credentials the user emptied", () => {
    const patch = buildRuntimeSdkConfigPatch({
      integrations: { ledgerWalletProvider: { apiKey: "", dAppIdentifier: "x" } },
    });

    expect(patch.integrations?.ledgerWalletProvider).toEqual({ apiKey: "", dAppIdentifier: "x" });
  });
});
