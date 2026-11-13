import { describe, expect, test } from "bun:test";
import type { LimitOrderTokensResponse } from "@swapkit/helpers";

import { getLimitInputAllowlist, getLimitOutputAllowlist, isLimitPairSupported } from "../pairs";

const ETH = "ETH.ETH";
const USDT = "ETH.USDT-0XDAC17F958D2EE523A2206206994597C13D831EC7";
const USDC = "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48";
const BTC = "BTC.BTC";

const harborOnly = {
  crossChain: [{ assets: [BTC, ETH, USDT], chainIds: ["bitcoin", "1"], provider: "HARBOR" }],
  singleChain: [],
} as unknown as LimitOrderTokensResponse;

const tokens = {
  ...harborOnly,
  singleChain: [{ assets: [ETH, USDC], chainId: "1", provider: "ONEINCH" }],
} as unknown as LimitOrderTokensResponse;

describe("limit order pairs", () => {
  test("never builds a same-chain pair from the cross-chain group", () => {
    expect(isLimitPairSupported({ buyAsset: USDT, sellAsset: ETH, tokens: harborOnly })).toBe(false);
    expect(getLimitOutputAllowlist({ sellAsset: ETH, tokens: harborOnly })).toEqual([{ identifier: BTC }]);
  });

  test("accepts same-chain pairs from a NEAR cross-chain group", () => {
    const near = {
      crossChain: [{ assets: [BTC, ETH, USDT], chainIds: ["bitcoin", "1"], provider: "NEAR" }],
      singleChain: [],
    } as unknown as LimitOrderTokensResponse;
    expect(isLimitPairSupported({ buyAsset: USDT, sellAsset: ETH, tokens: near })).toBe(true);
  });

  test("accepts same-chain pairs from one group and cross-chain pairs across chains", () => {
    expect(isLimitPairSupported({ buyAsset: USDC.toLowerCase(), sellAsset: ETH, tokens })).toBe(true);
    expect(isLimitPairSupported({ buyAsset: ETH, sellAsset: BTC, tokens })).toBe(true);
    expect(isLimitPairSupported({ buyAsset: ETH, sellAsset: ETH, tokens })).toBe(false);
  });

  test("offers same-chain assets first, then other chains", () => {
    expect(getLimitOutputAllowlist({ sellAsset: ETH, tokens })).toEqual([{ identifier: USDC }, { identifier: BTC }]);
    expect(getLimitOutputAllowlist({ providers: ["ONEINCH"] as never, sellAsset: ETH, tokens })).toEqual([
      { identifier: USDC },
    ]);
  });

  test("the input allowlist is the union of every group", () => {
    expect(getLimitInputAllowlist(tokens).map(({ identifier }) => identifier)).toEqual([ETH, USDC, BTC, USDT]);
  });
});
