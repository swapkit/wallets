import { afterEach, describe, expect, test } from "bun:test";

import { getChainLogoUrl, getProviderLogoUrl, getTokenLogoUrl, getWalletLogoUrl } from "../config";

// The legacy token-list-swapkit{,-dev} buckets were retired (DOP-253): the prod name is a private
// placeholder and the dev bucket is outside our control, so no logo URL may point at either.
const RETIRED = [
  "https://storage.googleapis.com/token-list-swapkit/",
  "https://storage.googleapis.com/token-list-swapkit-dev/",
];

// Bun maps import.meta.env to process.env, so MODE drives the development branch here.
const originalMode = process.env.MODE;
afterEach(() => {
  if (originalMode === undefined) delete process.env.MODE;
  else process.env.MODE = originalMode;
});

const urls = () => [
  getTokenLogoUrl("ETH.ETH"),
  getProviderLogoUrl("THORCHAIN_STREAMING"),
  getChainLogoUrl("ETH"),
  getWalletLogoUrl("METAMASK"),
];

describe("logo urls", () => {
  test("use the tokens CDN outside development", () => {
    delete process.env.MODE;
    expect(urls()).toEqual([
      "https://tokens.swapkit.dev/images/eth.eth.png",
      "https://tokens.swapkit.dev/images/providers/thorchain.png",
      "https://tokens.swapkit.dev/images/chains/eth.eth.png",
      "https://tokens.swapkit.dev/images/wallets/metamask.png",
    ]);
  });

  test("use the sk-apiv2 dev bucket in development", () => {
    process.env.MODE = "development";
    expect(urls()).toEqual([
      "https://storage.googleapis.com/sk-apiv2-dev-token-list-swapkit/images/eth.eth.png",
      "https://storage.googleapis.com/sk-apiv2-dev-token-list-swapkit/images/providers/thorchain.png",
      "https://storage.googleapis.com/sk-apiv2-dev-token-list-swapkit/images/chains/eth.eth.png",
      "https://storage.googleapis.com/sk-apiv2-dev-token-list-swapkit/images/wallets/metamask.png",
    ]);
  });

  test("never use the retired legacy token-list buckets in either mode", () => {
    for (const mode of [undefined, "development"]) {
      if (mode === undefined) delete process.env.MODE;
      else process.env.MODE = mode;
      for (const url of urls()) for (const prefix of RETIRED) expect(url.startsWith(prefix)).toBe(false);
    }
  });
});
