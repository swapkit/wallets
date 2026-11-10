import { describe, expect, test } from "bun:test";
import { AssetValue, Chain } from "@swapkit/helpers";

import { getGasAsset, getGasShortfall, isInsufficientNetworkFeeError } from "../network-fee";

const SOL_USDC = "SOL.USDC-EPJFWDD5AUFQSSQEM2QN1XZYBAPC8G4WEGGKZWYTDT1V";
const ETH_USDT = "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7";

const solFee = { amount: "0.00001", asset: "SOL.SOL", type: "inbound" };
const sol = (value: string) => AssetValue.from({ chain: Chain.Solana, value });

const shortfall = ({
  balances,
  fees = [solFee],
  isSweep,
  sellAmount = "10",
  sellAsset = SOL_USDC,
}: {
  balances: AssetValue[];
  fees?: { amount: string; asset: string; type: string }[];
  isSweep?: boolean;
  sellAmount?: string;
  sellAsset?: string;
}) => getGasShortfall({ balances, fees, isSweep, sellAmount, sellAsset });

describe("getGasAsset", () => {
  test("resolves the gas asset of the sell asset's chain", () => {
    expect(getGasAsset(SOL_USDC).toString()).toBe("SOL.SOL");
    expect(getGasAsset(ETH_USDT).ticker).toBe("ETH");
  });
});

describe("getGasShortfall", () => {
  test("flags a missing gas balance when a fee is quoted", () => {
    expect(shortfall({ balances: [] })).toBe("SOL");
  });

  test("flags a zero gas balance when a fee is quoted", () => {
    expect(shortfall({ balances: [sol("0")] })).toBe("SOL");
  });

  test("flags a gas balance below the quoted fee", () => {
    expect(shortfall({ balances: [sol("0.000005")] })).toBe("SOL");
  });

  test("accepts a gas balance that covers the quoted fee", () => {
    expect(shortfall({ balances: [sol("0.00001")] })).toBeNull();
    expect(shortfall({ balances: [sol("0.01")] })).toBeNull();
  });

  test("adds the sell amount when selling the gas asset", () => {
    expect(shortfall({ balances: [sol("1.5")], sellAmount: "1.5", sellAsset: "SOL.SOL" })).toBe("SOL");
    expect(shortfall({ balances: [sol("1.50001")], sellAmount: "1.5", sellAsset: "SOL.SOL" })).toBeNull();
  });

  test("skips the check only when the user sweeps the gas asset", () => {
    const btc = (value: string) => AssetValue.from({ chain: Chain.Bitcoin, value });
    const btcFee = { amount: "0.00002", asset: "BTC.BTC", type: "inbound" };
    const params = { balances: [btc("0.1")], fees: [btcFee], sellAmount: "0.1", sellAsset: "BTC.BTC" };
    expect(shortfall({ ...params, isSweep: true })).toBeNull();
    expect(shortfall(params)).toBe("BTC");
  });

  test("still checks token sells while sweeping", () => {
    const tronFee = { amount: "15", asset: "TRON.TRX", type: "inbound" };
    const trx = (value: string) => AssetValue.from({ chain: Chain.Tron, value });
    expect(
      shortfall({
        balances: [trx("1")],
        fees: [tronFee],
        isSweep: true,
        sellAsset: "TRON.USDT-TR7NHQJEKQXGTCI8Q8ZY4PL8OTSZGJLJ6T",
      }),
    ).toBe("TRX");
  });

  test("doesn't block when the quote has no inbound gas fee", () => {
    expect(
      getGasShortfall({ balances: [sol("0")], fees: undefined, sellAmount: "10", sellAsset: SOL_USDC }),
    ).toBeNull();
    expect(shortfall({ balances: [], fees: [] })).toBeNull();
    expect(
      shortfall({
        balances: [sol("0")],
        fees: [
          { amount: "0.5", asset: "SOL.SOL", type: "liquidity" },
          { amount: "3", asset: SOL_USDC, type: "inbound" },
        ],
      }),
    ).toBeNull();
  });
});

describe("isInsufficientNetworkFeeError", () => {
  test("matches the Solana rent simulation failure", () => {
    const error = new Error(
      "Simulation failed. \nMessage: Transaction simulation failed: Transaction results in an account (0) with insufficient funds for rent.",
    );
    expect(isInsufficientNetworkFeeError(error)).toBe(true);
  });

  test("matches an empty fee payer and EVM gas errors, including via cause", () => {
    expect(
      isInsufficientNetworkFeeError(
        new Error("Transaction simulation failed: Attempt to debit an account but found no record of a prior credit."),
      ),
    ).toBe(true);
    expect(
      isInsufficientNetworkFeeError(
        new Error("wrapped", { cause: new Error("insufficient funds for gas * price + value") }),
      ),
    ).toBe(true);
  });

  test("ignores unrelated errors", () => {
    expect(isInsufficientNetworkFeeError(new Error("User rejected the request"))).toBe(false);
    expect(isInsufficientNetworkFeeError("insufficient funds for rent")).toBe(false);
  });
});
