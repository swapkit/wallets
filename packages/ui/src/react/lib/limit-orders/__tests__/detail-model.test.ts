import { describe, expect, test } from "bun:test";
import { Chain, type LimitOrder, ProviderName } from "@swapkit/helpers";

import { getLimitOrderDetailModel } from "../detail-model";
import { makeOrder } from "./fixtures";

const NOW = Date.parse("2026-10-01T12:00:00.000Z");
const USDT = "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7";

function entry(type: NonNullable<LimitOrder["txHashes"]>[number]["type"], chainId = "1", index = 0) {
  return { chainId, txHash: `0x${type}${index}${"a".repeat(60)}`, type } as NonNullable<LimitOrder["txHashes"]>[number];
}

function fee(type: string, amount: string, asset: string, amountBps?: number) {
  return { amount, amountBps, asset, chain: "ETH", protocol: "ONEINCH", type } as LimitOrder["fees"][number];
}

describe("getLimitOrderDetailModel", () => {
  test("open: estimated fees, market chip, empty transactions, Cancel slot", () => {
    const order = makeOrder({
      expiresAt: "2026-10-08T09:00:00.000Z",
      fees: [
        fee("liquidity", "7.95", "ETH.USDC", 30),
        fee("affiliate", "1.06", "ETH.USDC", 4),
        fee("network", "0", "ETH.ETH", 0),
      ],
      receiver: "0xreceiver",
    });
    const model = getLimitOrderDetailModel(order, { buy: 1, sell: 2412 }, NOW);

    expect(model.statusLine).toBe("Open · waiting on the market");
    expect(model.limitPrice).toBe("2,650.00 USDC per ETH");
    expect(model.market).toEqual({ chip: "+9.9% to go", fillableNow: false, status: "ready", value: "2,412.00" });
    expect(model.summary).toEqual([{ key: "open", label: "Value still open", value: "≈ $2,412.00" }]);
    expect(model.progress?.value).toBe("0% · 1 ETH remaining");
    expect(model.progress?.caption).toBe("This order can be filled in more than one go. No fills yet.");
    expect(model.fees.stage).toBe("estimated");
    expect(model.fees.title).toBe("Estimated fees");
    expect(model.fees.sumBps).toBe("0.34%");
    expect(model.fees.rows.map(({ amount, isFree, label }) => [label, amount, isFree])).toEqual([
      ["Liquidity fee", "7.95 USDC", false],
      ["Exchange fee", "1.06 USDC", false],
      ["Network fee", null, true],
    ]);
    expect(model.fees.caption).toBe(
      "What this order will cost if it fills. Charged to the filler, not deducted from your 2,650 USDC.",
    );
    expect(model.timeline).toEqual([]);
    expect(model.timelineEmpty).toStartWith("No transactions yet.");
    expect(model.expiry).toEqual({ countdown: "6d 21h", time: Date.parse(order.expiresAt) });
    expect(model.address).toEqual({ label: "Receiving at", value: "0xreceiver" });
    expect(model.action).toBe("cancel");
  });

  test("partly filled, same chain: fees so far, fills timeline, Cancel slot", () => {
    const order = makeOrder({
      buyAmount: "5400",
      filledBuyAmount: "2430",
      filledSellAmount: "0.9",
      limitPrice: "2700",
      sellAmount: "2",
      status: "PARTIAL",
      txHashes: [entry("fill", "1", 0), entry("fill", "1", 1)],
    });
    const model = getLimitOrderDetailModel(order, { buy: 1, sell: 2412 }, NOW);

    expect(model.statusLine).toBe("In Progress · partly filled");
    expect(model.summary.map(({ label, value }) => [label, value])).toEqual([
      ["Value still open", "≈ $2,653.20"],
      ["Received so far", "≈ $2,430.00"],
    ]);
    expect(model.progress?.value).toBe("45% · 1.1 ETH remaining");
    expect(model.progress?.isHighlighted).toBe(true);
    expect(model.progress?.caption).toBe(
      "0.9 ETH sold so far for 2,430 USDC, across two fills. The rest is still on the book.",
    );
    expect(model.fees.title).toBe("Fees so far");
    expect(model.timeline.map(({ title }) => title)).toEqual(["Fill", "Fill"]);
    expect(model.timeline[0]?.chainName).toBe("Ethereum");
    expect(model.timeline[0]?.chain).toBe(Chain.Ethereum);
    expect(model.action).toBe("cancel");
  });

  test("deposited cross-chain: deposit on the BTC chain, fills on chain 1, the still-held caption", () => {
    const order = makeOrder({
      buyAmount: "13.93",
      buyAsset: "ETH.ETH",
      depositHash: "4b1c9d02",
      filledBuyAmount: "5.85",
      filledSellAmount: "0.21",
      limitPrice: "27.86",
      provider: ProviderName.HARBOR,
      sellAmount: "0.5",
      sellAsset: "BTC.BTC",
      status: "PARTIAL",
      txHashes: [entry("deposit", "bitcoin"), entry("fill", "1", 0), entry("fill", "1", 1)],
    });
    const model = getLimitOrderDetailModel(order, { buy: 2412, sell: 64_000 }, NOW);

    expect(model.limitPrice).toBe("27.86 ETH per BTC");
    expect(model.market?.status === "ready" && model.market.chip).toBe("+5.0% to go");
    expect(model.timeline.map(({ chainName, title }) => [title, chainName])).toEqual([
      ["Deposit", "Bitcoin"],
      ["Fill", "Ethereum"],
      ["Fill", "Ethereum"],
    ]);
    expect(model.timeline[0]?.markerAsset).toBe("BTC.BTC");
    expect(model.timeline[1]?.markerAsset).toBe("ETH.ETH");
    expect(model.progress?.caption).toBe(
      "0.21 BTC sold so far for 5.85 ETH, across two fills. Your remaining 0.29 BTC is still held against this order.",
    );
    expect(model.fees.caption).toBe(
      "Taken from the 5.85 ETH already sent to you, not added on top. It grows with each fill.",
    );
  });

  test("cancelled with refund: refund block, flat final fees, returned to the maker, value when placed", () => {
    const order = makeOrder({
      buyAmount: "7.1",
      buyAsset: "ETH.ETH",
      depositHash: "9a2e7b41",
      fees: [fee("outbound", "0.00004", "BTC.BTC"), fee("liquidity", "0", "ETH.ETH"), fee("affiliate", "0", "ETH.ETH")],
      limitPrice: "28.4",
      maker: "bc1qmaker",
      provider: ProviderName.HARBOR,
      receiver: "0xreceiver",
      sellAmount: "0.25",
      sellAsset: "BTC.BTC",
      status: "CANCELLED",
      txHashes: [entry("deposit", "bitcoin"), entry("refund", "bitcoin")],
      usdValueClose: "0",
      usdValueOpen: "16000",
    });
    const model = getLimitOrderDetailModel(order, {}, NOW);

    expect(model.statusLine).toBe("Cancelled · funds returned");
    expect(model.market).toBeNull();
    expect(model.progress).toBeNull();
    expect(model.refund?.text).toBe("Your remaining BTC was returned to your wallet");
    expect(model.refund?.entry?.txHash).toBe(order.txHashes?.[1]?.txHash ?? "missing");
    expect(model.fees.stage).toBe("flat");
    expect(model.fees.flatValue).toBe("0.00004 BTC");
    expect(model.fees.caption).toStartWith("Returning your funds cost a network fee.");
    expect(model.summary).toEqual([{ key: "placed", label: "Value when placed", value: "≈ $16,000.00" }]);
    expect(model.timeline.map(({ title }) => title)).toEqual(["Deposit", "Refund"]);
    expect(model.address).toEqual({ label: "Returned to", value: "bc1qmaker" });
    expect(model.expiry).toBeNull();
    expect(model.action).toBe("placeNew");
  });

  test("expired with a refund: refund block, funds-returned status and flat fees", () => {
    const order = makeOrder({
      depositHash: "9a2e7b41",
      fees: [fee("outbound", "0.00004", "BTC.BTC")],
      provider: ProviderName.HARBOR,
      sellAsset: "BTC.BTC",
      status: "EXPIRED",
      txHashes: [entry("deposit", "bitcoin"), entry("refund", "bitcoin")],
    });
    const model = getLimitOrderDetailModel(order, {}, NOW);

    expect(model.statusLine).toBe("Expired · funds returned");
    expect(model.refund?.text).toBe("Your remaining BTC was returned to your wallet");
    expect(model.refund?.entry?.txHash).toBe(order.txHashes?.[1]?.txHash ?? "missing");
    expect(model.progress).toBeNull();
    expect(model.fees.stage).toBe("flat");
  });

  test("expired with a partial fill: filled before expiry, muted bar, received from usdValueClose, no market", () => {
    const order = makeOrder({
      buyAmount: "1.1765",
      buyAsset: "ETH.ETH",
      expiresAt: "2026-09-26T06:00:00.000Z",
      filledBuyAmount: "0.4",
      filledSellAmount: "1020",
      limitPrice: "0.000392156862745098",
      receiver: "0xreceiver",
      sellAmount: "3000",
      sellAsset: USDT,
      status: "EXPIRED",
      txHashes: [entry("fill")],
      updatedAt: "2026-09-26T06:10:00.000Z",
      usdValueClose: "965",
      usdValueOpen: "3000",
    });
    const model = getLimitOrderDetailModel(order, { buy: 2412, sell: 1 }, NOW);

    expect(model.statusLine).toBe("Expired · partly filled");
    expect(model.limitPrice).toBe("2,550.00 USDT per ETH");
    expect(model.market).toBeNull();
    expect(model.progress?.label).toBe("Filled before expiry");
    expect(model.progress?.value).toBe("34%");
    expect(model.progress?.barClass).toBe("sk-ui-bg-muted-foreground");
    expect(model.progress?.caption).toBe(
      "1,020 of 3,000 USDT was sold for 0.4 ETH. The rest expired unfilled and is still in your wallet.",
    );
    expect(model.summary).toEqual([{ key: "received", label: "Received", value: "≈ $965.00" }]);
    expect(model.fees.title).toBe("Final fees");
    expect(model.fees.caption).toBe(
      "Charged on the 0.4 ETH that actually filled. The unfilled 1,980 USDT cost you nothing.",
    );
    expect(model.timeline.map(({ title }) => title)).toEqual(["Fill"]);
    expect(model.address).toEqual({ label: "Received at", value: "0xreceiver" });
    expect(model.expiry).toBeNull();
    expect(model.action).toBe("placeNew");
  });

  test("expired on a native 1inch sell does not claim the rest is in the wallet", () => {
    const order = makeOrder({
      filledBuyAmount: "900",
      filledSellAmount: "0.34",
      status: "EXPIRED",
      txHashes: [entry("fill")],
    });

    expect(getLimitOrderDetailModel(order, {}, NOW).progress?.caption).toBe(
      "0.34 of 1 ETH was sold for 900 USDC. The rest expired unfilled.",
    );
  });

  test("failed: failure panel, fees charged none, no fee block, no progress", () => {
    const order = makeOrder({
      buyAmount: "1060",
      sellAmount: "0.4",
      sellAsset: USDT,
      status: "FAILED",
      usdValueOpen: "965",
    });
    const model = getLimitOrderDetailModel(order, {}, NOW);

    expect(model.statusLine).toBe("Failed · nothing traded");
    expect(model.failure).toEqual({
      body: "Nothing was traded and your 0.4 USDT never left your wallet. Place a new order to try again.",
      title: "This order can no longer be filled",
    });
    expect(model.feesChargedNone).toBe(true);
    expect(model.fees.stage).toBe("none");
    expect(model.progress).toBeNull();
    expect(model.summary).toEqual([{ key: "placed", label: "Value when placed", value: "≈ $965.00" }]);
    expect(model.timelineEmpty).toBe("No transactions. Nothing ever moved on-chain, so there is nothing to look up.");
    expect(model.address).toBeNull();
    expect(model.action).toBe("placeNew");
  });

  test("failed on a native 1inch sell drops the never-left-your-wallet claim", () => {
    const model = getLimitOrderDetailModel(makeOrder({ status: "FAILED" }), {}, NOW);

    expect(model.failure?.body).toBe("Nothing was traded. Place a new order to try again.");
  });

  test("a live order with a cancel request reads Cancelling and leaves the action to the cancel gate", () => {
    const model = getLimitOrderDetailModel(makeOrder({ cancelRequestedAt: "2026-10-01T11:00:00.000Z" }), {}, NOW);

    expect(model.statusLine).toBe("Cancelling…");
    expect(model.isCancelling).toBe(true);
    expect(model.action).toBe("cancel");
  });

  test("a live order without prices keeps the market and value rows pending", () => {
    const model = getLimitOrderDetailModel(makeOrder(), {}, NOW);

    expect(model.market).toEqual({ status: "pending" });
    expect(model.summary).toEqual([{ key: "open", label: "Value still open", value: null }]);
  });
});
