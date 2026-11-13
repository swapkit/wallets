import { type LimitOrderTokensResponse, ProviderName } from "@swapkit/helpers";
import { canonicalAssetIdentifier } from "../../../lib/asset-aliases";

export type LimitAssetOption = { identifier: string };

function normalize(identifier: string) {
  return canonicalAssetIdentifier(identifier).toLowerCase();
}

function chainOf(identifier: string) {
  return normalize(identifier).split(".")[0] ?? "";
}

function hasAsset(assets: string[], identifier: string) {
  const target = normalize(identifier);
  return assets.some((asset) => normalize(asset) === target);
}

function byProvider<T extends { provider: string }>(groups: T[], providers?: readonly ProviderName[] | null) {
  return providers ? groups.filter((group) => providers.some((provider) => provider === group.provider)) : groups;
}

export function isLimitPairSupported({
  buyAsset,
  sellAsset,
  tokens,
}: {
  buyAsset: string;
  sellAsset: string;
  tokens: LimitOrderTokensResponse;
}) {
  if (normalize(sellAsset) === normalize(buyAsset)) return false;
  const sameChain = tokens.singleChain.some(({ assets }) => hasAsset(assets, sellAsset) && hasAsset(assets, buyAsset));
  if (sameChain) return true;
  const isCrossChain = chainOf(sellAsset) !== chainOf(buyAsset);
  return tokens.crossChain.some(
    ({ assets, provider }) =>
      (isCrossChain || provider !== ProviderName.HARBOR) && hasAsset(assets, sellAsset) && hasAsset(assets, buyAsset),
  );
}

export function getLimitInputAllowlist(tokens: LimitOrderTokensResponse) {
  const seen = new Map<string, LimitAssetOption>();
  for (const { assets } of [...tokens.singleChain, ...tokens.crossChain]) {
    for (const identifier of assets) {
      const key = normalize(identifier);
      if (!seen.has(key)) seen.set(key, { identifier });
    }
  }
  return [...seen.values()];
}

export function getLimitOutputAllowlist({
  providers,
  sellAsset,
  tokens,
}: {
  providers?: readonly ProviderName[] | null;
  sellAsset: string;
  tokens: LimitOrderTokensResponse;
}) {
  const sellKey = normalize(sellAsset);
  const sellChain = chainOf(sellAsset);
  const options = new Map<string, LimitAssetOption>();

  for (const { assets } of byProvider(tokens.singleChain, providers)) {
    if (!hasAsset(assets, sellAsset)) continue;
    for (const identifier of assets) {
      const key = normalize(identifier);
      if (key !== sellKey) options.set(key, { identifier });
    }
  }

  for (const { assets, provider } of byProvider(tokens.crossChain, providers)) {
    if (!hasAsset(assets, sellAsset)) continue;
    for (const identifier of assets) {
      const key = normalize(identifier);
      const isSameChain = chainOf(identifier) === sellChain;
      if (key === sellKey || options.has(key) || (isSameChain && provider === ProviderName.HARBOR)) continue;
      options.set(key, { identifier });
    }
  }

  return [...options.values()];
}
