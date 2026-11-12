import { describe, expect, test } from "bun:test";
import { AssetValue, Chain } from "@swapkit/helpers";
import type { SwapKitClient } from "../../swapkit-types";
import { walletTokenIds } from "../swapkit-context";

describe("walletTokenIds", () => {
  test("prices every chain that answered even when another chain fails", async () => {
    const swapKit = {
      getWalletWithBalance: (chain: Chain) =>
        chain === Chain.Bitcoin
          ? Promise.reject(new Error("rpc down"))
          : Promise.resolve({
              balance: [AssetValue.from({ asset: "ETH.ETH" }), AssetValue.from({ asset: "ETH.USDC" })],
            }),
    } as unknown as SwapKitClient;

    const ids = await walletTokenIds(swapKit, [Chain.Ethereum, Chain.Bitcoin]);

    expect(ids).toEqual(["ETH.ETH", "BTC.BTC", "ETH.ETH", "ETH.USDC"]);
  });
});
