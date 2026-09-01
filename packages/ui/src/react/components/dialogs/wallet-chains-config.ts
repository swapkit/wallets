import { Chain } from "@swapkit/helpers";

// Widget supported EVM chains - matches API_SUPPORTED_CHAINS from swapkit-context.tsx
export const WIDGET_SUPPORTED_EVM_CHAINS = [
  Chain.Ethereum,
  Chain.Arbitrum,
  Chain.Avalanche,
  Chain.Base,
  Chain.BinanceSmartChain,
  Chain.Berachain,
  Chain.Gnosis,
  Chain.Monad,
  Chain.Optimism,
  Chain.Polygon,
  Chain.XLayer,
] as const;
