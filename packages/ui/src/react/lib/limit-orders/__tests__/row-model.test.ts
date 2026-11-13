import { describe, expect, test } from "bun:test";
import { type LimitOrder, ProviderName } from "@swapkit/helpers";

import { formatOrderAmount, getLimitOrderRowModel } from "../row-model";
import { makeOrder } from "./fixtures";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const USDC = "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48";
const USDT = "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7";

function txs(...types: NonNullable<LimitOrder["txHashes"]>[number]["type"][]) {
  return types.map((type, index) => ({ chainId: "1", txHash: `0x${index}`, type })) as LimitOrder["txHashes"];
}

describe("formatOrderAmount", () => {
  test("keeps up to 10 significant digits", () => {
    expect(formatOrderAmount("1234567.89")).toBe("1,234,567.89");
  });
});

describe("getLimitOrderRowModel", () => {
  test("OPEN prices the whole order now and counts down in days", () => {
    const order = makeOrder({ expiresAt: "2026-10-08T09:00:00.000Z", status: "OPEN" });
    const row = getLimitOrderRowModel(order, { buy: 1, sell: 2412 }, NOW);

    expect(row.chip).toBe("Open · 0% filled");
    expect(row.chipClass).toBe("sk-ui-text-muted-foreground");
    expect(row.trailing).toEqual({ kind: "countdown", text: "6d 21h left" });
    expect(row.bar).toBeNull();
    expect(row.usd).toEqual({ pending: false, text: "≈ $2,412.00 now" });
  });

  test("PARTIAL adds what was received to what is still open, with a live bar", () => {
    const order = makeOrder({
      buyAmount: "13.93",
      buyAsset: "ETH.ETH",
      expiresAt: "2026-10-06T15:00:00.000Z",
      filledBuyAmount: "5.85",
      filledSellAmount: "0.21",
      sellAmount: "0.5",
      sellAsset: "BTC.BTC",
      status: "PARTIAL",
    });
    const row = getLimitOrderRowModel(order, { buy: 3000, sell: 60_000 }, NOW);

    expect(row.chip).toBe("In Progress · 42% filled");
    expect(row.chipClass).toBe("sk-ui-text-warning-foreground");
    expect(row.trailing).toEqual({ kind: "countdown", text: "5d 3h left" });
    expect(row.bar).toEqual({ className: "sk-ui-bg-warning-foreground", percent: 42 });
    expect(row.usd).toEqual({ pending: false, text: "≈ $34,950.00 now" });
  });

  test("SUBMITTED counts down in hours and waits for a missing price instead of printing $0", () => {
    const order = makeOrder({
      buyAmount: "0.215",
      buyAsset: "ETH.ETH",
      expiresAt: "2026-10-01T15:05:00.000Z",
      sellAmount: "500",
      sellAsset: USDT,
      status: "SUBMITTED",
    });
    const row = getLimitOrderRowModel(order, {}, NOW);

    expect(row.chip).toBe("Submitting · 0% filled");
    expect(row.chipClass).toBe("sk-ui-text-warning-foreground");
    expect(row.trailing).toEqual({ kind: "countdown", text: "3h 5m left" });
    expect(row.bar).toBeNull();
    expect(row.usd).toEqual({ pending: true, text: null });
  });

  test("FILLED reports 100%, counts fills and shows what was received", () => {
    const order = makeOrder({
      buyAmount: "5400",
      filledBuyAmount: "5400",
      filledSellAmount: "1.97",
      sellAmount: "2",
      status: "FILLED",
      txHashes: txs("fill", "fill", "fill"),
      usdValueClose: "5400",
    });
    const row = getLimitOrderRowModel(order, { buy: 1, sell: 2412 }, NOW);

    expect(row.chip).toBe("Completed · 100% filled");
    expect(row.chipClass).toBe("sk-ui-text-success-foreground");
    expect(row.trailing).toEqual({ kind: "fills", text: "3 fills" });
    expect(row.bar).toBeNull();
    expect(row.usd).toEqual({ pending: false, text: "≈ $5,400.00" });
  });

  test("CANCELLED with a refund shows the returned amount and no figure for zero fills", () => {
    const order = makeOrder({
      buyAmount: "7.1",
      buyAsset: "ETH.ETH",
      provider: ProviderName.HARBOR,
      sellAmount: "0.25",
      sellAsset: "BTC.BTC",
      status: "CANCELLED",
      txHashes: txs("deposit", "refund"),
      usdValueClose: "0",
      usdValueOpen: "16000",
    });
    const row = getLimitOrderRowModel(order, { buy: 3000, sell: 64_000 }, NOW);

    expect(row.chip).toBe("Cancelled · 0% filled");
    expect(row.chipClass).toBe("sk-ui-text-muted-foreground");
    expect(row.trailing).toEqual({ kind: "refund", text: "BTC returned" });
    expect(row.bar).toBeNull();
    expect(row.usd).toBeNull();
  });

  test("EXPIRED with a refund shows the refund", () => {
    const order = makeOrder({
      provider: ProviderName.HARBOR,
      sellAsset: "BTC.BTC",
      status: "EXPIRED",
      txHashes: txs("deposit", "refund"),
    });

    expect(getLimitOrderRowModel(order, {}, NOW).trailing).toEqual({ kind: "refund", text: "BTC returned" });
  });

  test("CANCELLED with fills shows what was sold, a muted bar and the stored close value", () => {
    const order = makeOrder({
      buyAmount: "4050",
      filledBuyAmount: "2470.5",
      filledSellAmount: "0.92",
      sellAmount: "1.5",
      status: "CANCELLED",
      txHashes: txs("fill", "cancel"),
      usdValueClose: "3618",
    });
    const row = getLimitOrderRowModel(order, { buy: 1, sell: 2412 }, NOW);

    expect(row.chip).toBe("Cancelled · 61% filled");
    expect(row.trailing).toEqual({ kind: "sold", text: "0.92 ETH sold" });
    expect(row.bar).toEqual({ className: "sk-ui-bg-muted-foreground", percent: 61 });
    expect(row.usd).toEqual({ pending: false, text: "≈ $3,618.00" });
  });

  test("EXPIRED with fills shows what was sold and omits a missing close value", () => {
    const order = makeOrder({
      buyAmount: "1.18",
      buyAsset: "ETH.ETH",
      filledBuyAmount: "0.4",
      filledSellAmount: "1020",
      sellAmount: "3000",
      sellAsset: USDT,
      status: "EXPIRED",
      txHashes: txs("fill"),
      updatedAt: "2026-10-08T10:00:00.000Z",
      usdValueClose: null,
    });
    const row = getLimitOrderRowModel(order, { buy: 3000, sell: 1 }, NOW);

    expect(row.chip).toBe("Expired · 34% filled");
    expect(row.chipClass).toBe("sk-ui-text-muted-foreground");
    expect(row.trailing).toEqual({ kind: "sold", text: "1,020 USDT sold" });
    expect(row.bar).toEqual({ className: "sk-ui-bg-muted-foreground", percent: 34 });
    expect(row.usd).toBeNull();
  });

  test("FAILED reads never filled, with nothing on the right and no figure", () => {
    const order = makeOrder({ buyAsset: USDC, status: "FAILED", usdValueOpen: "965" });
    const row = getLimitOrderRowModel(order, { buy: 1, sell: 2412 }, NOW);

    expect(row.chip).toBe("Failed · never filled");
    expect(row.chipClass).toBe("sk-ui-text-error-foreground");
    expect(row.trailing).toBeNull();
    expect(row.bar).toBeNull();
    expect(row.usd).toBeNull();
  });
});
