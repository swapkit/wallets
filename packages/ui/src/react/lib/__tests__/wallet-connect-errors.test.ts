import { describe, expect, test } from "bun:test";
import { SwapKitError } from "@swapkit/helpers";
import { getWalletConnectErrorDescription } from "../wallet-connect-errors";

describe("the description a failed wallet connect shows", () => {
  test("explains a locked TronLink even after the connect flow wraps the error", () => {
    const sdkError = new SwapKitError({ errorKey: "wallet_tronlink_locked", info: { message: "locked" } });
    const wrapped = new Error("Failed to connect TRONLINK", { cause: sdkError });

    expect(getWalletConnectErrorDescription(wrapped)).toContain("TronLink is locked");
  });

  test("leaves unknown errors to the generic fallback", () => {
    expect(getWalletConnectErrorDescription(new Error("boom"))).toBeUndefined();
  });
});
