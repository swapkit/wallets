import { describe, expect, test } from "bun:test";
import { AssetValue } from "@swapkit/helpers";

import { getMaxAmountOption } from "../max-amount";

const ETH_USDT = "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7";

const option = (asset: string, value: string, isWalletConnected = true) =>
  getMaxAmountOption({ asset, balance: AssetValue.from({ asset, value }), isWalletConnected });

describe("getMaxAmountOption", () => {
  test("uses the full balance without sweep for tokens", () => {
    expect(option(ETH_USDT, "125.5")).toEqual({ amount: "125.5", enableSweep: false });
  });

  test("enables sweep for gas assets on sweep chains", () => {
    expect(option("BTC.BTC", "0.015")).toEqual({ amount: "0.015", enableSweep: true });
    expect(option("TON.TON", "3")).toEqual({ amount: "3", enableSweep: true });
  });

  test("is unavailable for gas assets the backend cannot sweep", () => {
    expect(option("ETH.ETH", "1")).toBeNull();
    expect(option("SOL.SOL", "1")).toBeNull();
  });

  test("is unavailable without a positive balance or a connected wallet", () => {
    expect(option("BTC.BTC", "0")).toBeNull();
    expect(option(ETH_USDT, "10", false)).toBeNull();
    expect(getMaxAmountOption({ asset: "BTC.BTC", balance: null, isWalletConnected: true })).toBeNull();
  });
});
