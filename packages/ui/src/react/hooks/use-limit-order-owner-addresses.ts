import { type Chain, type EVMChain, EVMChains, getChainConfig, type LimitOrderTokensResponse } from "@swapkit/helpers";
import { useMemo } from "react";
import { useSwapKit } from "../swapkit-context";
import { useLimitOrderTokens } from "./use-limit-order-tokens";

type OwnerWallet = { address?: string; chain: Chain };

function getLimitChainIds(tokens: LimitOrderTokensResponse | null) {
  if (!tokens) return null;
  return new Set<string>([
    ...tokens.singleChain.map(({ chainId }) => chainId),
    ...tokens.crossChain.flatMap(({ chainIds }) => chainIds),
  ]);
}

function getChainId(chain: Chain) {
  try {
    return getChainConfig(chain)?.chainId as string | undefined;
  } catch {
    return undefined;
  }
}

export function getLimitOrderOwnerAddresses(wallets: OwnerWallet[], tokens: LimitOrderTokensResponse | null) {
  const limitChainIds = getLimitChainIds(tokens);
  const addresses = new Set<string>();
  for (const { address, chain } of wallets) {
    if (!address) continue;
    if (limitChainIds) {
      const chainId = getChainId(chain);
      if (!chainId || !limitChainIds.has(chainId)) continue;
    }
    addresses.add(EVMChains.includes(chain as EVMChain) ? address.toLowerCase() : address);
  }
  return [...addresses].sort();
}

export function useLimitOrderOwnerAddresses() {
  const { connectedWallets, isWalletConnected } = useSwapKit();
  const { tokens } = useLimitOrderTokens();

  const wallets: OwnerWallet[] = isWalletConnected
    ? [...connectedWallets].map(([chain, { address }]) => ({ address, chain }))
    : [];
  const addressesKey = getLimitOrderOwnerAddresses(wallets, tokens).join(",");

  return useMemo(() => ({ addresses: addressesKey ? addressesKey.split(",") : [], addressesKey }), [addressesKey]);
}
