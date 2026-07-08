import { Chain, WalletOption } from "@swapkit/helpers";

export const EVM_CHAINS: ReadonlyArray<Chain> = [
  Chain.Ethereum,
  Chain.Arbitrum,
  Chain.Base,
  Chain.Optimism,
  Chain.Polygon,
  Chain.Avalanche,
  Chain.BinanceSmartChain,
  Chain.Gnosis,
  Chain.XLayer,
  Chain.Berachain,
  Chain.Monad,
];

export const UTXO_CHAINS: ReadonlyArray<Chain> = [
  Chain.Bitcoin,
  Chain.BitcoinCash,
  Chain.Dogecoin,
  Chain.Litecoin,
  Chain.Dash,
  Chain.Zcash,
];

/** Keplr / Leap need at least one of these enabled to function. */
export const COSMOS_CHAINS: ReadonlyArray<Chain> = [Chain.Cosmos, Chain.Kujira, Chain.THORChain, Chain.Maya];

export type ChainCatalogEntry = { chain: Chain; name: string; color: string };

/** Order mirrors `API_SUPPORTED_CHAINS` so the studio grid reads top-to-bottom by importance. */
export const CHAIN_CATALOG: ReadonlyArray<ChainCatalogEntry> = [
  { chain: Chain.Bitcoin, color: "#f7931a", name: "Bitcoin" },
  { chain: Chain.Ethereum, color: "#627eea", name: "Ethereum" },
  { chain: Chain.Tron, color: "#ff060a", name: "Tron" },
  { chain: Chain.BinanceSmartChain, color: "#f3ba2f", name: "BNB Chain" },
  { chain: Chain.Solana, color: "#9945ff", name: "Solana" },
  { chain: Chain.Zcash, color: "#ecb244", name: "Zcash" },
  { chain: Chain.Ripple, color: "#23292f", name: "XRP" },
  { chain: Chain.Arbitrum, color: "#28a0f0", name: "Arbitrum" },
  { chain: Chain.Base, color: "#0052ff", name: "Base" },
  { chain: Chain.Optimism, color: "#ff0420", name: "Optimism" },
  { chain: Chain.Polygon, color: "#8247e5", name: "Polygon" },
  { chain: Chain.Avalanche, color: "#e84142", name: "Avalanche" },
  { chain: Chain.Cardano, color: "#0033ad", name: "Cardano" },
  { chain: Chain.Cosmos, color: "#6f7390", name: "Cosmos" },
  { chain: Chain.Sui, color: "#4ca3ff", name: "Sui" },
  { chain: Chain.Near, color: "#88e1c7", name: "NEAR" },
  { chain: Chain.Dogecoin, color: "#c2a633", name: "Dogecoin" },
  { chain: Chain.Litecoin, color: "#345d9d", name: "Litecoin" },
  { chain: Chain.BitcoinCash, color: "#0ac18e", name: "Bitcoin Cash" },
  { chain: Chain.Dash, color: "#008ce7", name: "Dash" },
  { chain: Chain.Gnosis, color: "#3e6957", name: "Gnosis" },
  { chain: Chain.XLayer, color: "#1f2937", name: "X Layer" },
  { chain: Chain.THORChain, color: "#33ff99", name: "THORChain" },
  { chain: Chain.Maya, color: "#9f63ff", name: "Maya" },
  { chain: Chain.Berachain, color: "#824a18", name: "Berachain" },
  { chain: Chain.Monad, color: "#7c4dff", name: "Monad" },
  { chain: Chain.Radix, color: "#06d6a0", name: "Radix" },
  { chain: Chain.Kujira, color: "#e36b3b", name: "Kujira" },
  { chain: Chain.Ton, color: "#0098ea", name: "TON" },
  { chain: Chain.Starknet, color: "#ff9c2a", name: "Starknet" },
  { chain: Chain.Stellar, color: "#0f0f0f", name: "Stellar" },
];

export const ALL_CONTROLLABLE_CHAINS: ReadonlyArray<Chain> = CHAIN_CATALOG.map((c) => c.chain);

export type ChainPresetId = "all" | "evm" | "btcEth" | "cosmos" | "utxo";

export const CHAIN_PRESETS: ReadonlyArray<{ id: ChainPresetId; label: string; chains: ReadonlyArray<Chain> }> = [
  { chains: ALL_CONTROLLABLE_CHAINS, id: "all", label: "All" },
  { chains: EVM_CHAINS, id: "evm", label: "EVM only" },
  { chains: [Chain.Bitcoin, Chain.Ethereum], id: "btcEth", label: "BTC + ETH" },
  { chains: COSMOS_CHAINS, id: "cosmos", label: "Cosmos" },
  { chains: UTXO_CHAINS, id: "utxo", label: "UTXO" },
];

/**
 * Wallets that throw at connect time when none of their listed chains are
 * enabled. Wallets not in this map are multi-chain and survive as long as one
 * of their chains stays on (handled by the regular walletChainsMap pipeline).
 */
export const WALLET_REQUIRED_CHAINS: ReadonlyMap<WalletOption, ReadonlyArray<Chain>> = new Map([
  [WalletOption.XAMAN, [Chain.Ripple]],
  [WalletOption.RADIX_WALLET, [Chain.Radix]],
  [WalletOption.KEPLR, COSMOS_CHAINS],
  [WalletOption.LEAP, COSMOS_CHAINS],
]);

export function computeWalletsBlockedByChains(enabledChains: ReadonlyArray<Chain> | "all"): WalletOption[] {
  if (enabledChains === "all") return [];
  const enabledSet = new Set(enabledChains);
  const blocked: WalletOption[] = [];
  for (const [wallet, requiredChains] of WALLET_REQUIRED_CHAINS) {
    const hasAny = requiredChains.some((c) => enabledSet.has(c));
    if (!hasAny) blocked.push(wallet);
  }
  return blocked;
}

export function filterChainsByEnabled<T extends Chain>(
  chains: ReadonlyArray<T>,
  enabledChains: ReadonlyArray<Chain> | "all",
): T[] {
  if (enabledChains === "all") return [...chains];
  const enabledSet = new Set(enabledChains);
  return chains.filter((c) => enabledSet.has(c));
}

// Per-chain asset identifiers — kept in sync with minimal-tokens.ts. Used only
// by pickDefaultAssetPair to land defaults on chains the integrator has enabled.
const CHAIN_NATIVE_ASSET: Partial<Record<Chain, string>> = {
  [Chain.Arbitrum]: "ARB.ETH",
  [Chain.Avalanche]: "AVAX.AVAX",
  [Chain.Base]: "BASE.ETH",
  [Chain.Berachain]: "BERA.BERA",
  [Chain.BinanceSmartChain]: "BSC.BNB",
  [Chain.Bitcoin]: "BTC.BTC",
  [Chain.BitcoinCash]: "BCH.BCH",
  [Chain.Cardano]: "ADA.ADA",
  [Chain.Cosmos]: "GAIA.ATOM",
  [Chain.Dash]: "DASH.DASH",
  [Chain.Dogecoin]: "DOGE.DOGE",
  [Chain.Ethereum]: "ETH.ETH",
  [Chain.Gnosis]: "GNO.xDAI",
  [Chain.Kujira]: "KUJI.KUJI",
  [Chain.Litecoin]: "LTC.LTC",
  [Chain.Maya]: "MAYA.CACAO",
  [Chain.Monad]: "MONAD.MON",
  [Chain.Near]: "NEAR.NEAR",
  [Chain.Optimism]: "OP.ETH",
  [Chain.Polygon]: "POL.POL",
  [Chain.Radix]: "XRD.XRD",
  [Chain.Ripple]: "XRP.XRP",
  [Chain.Solana]: "SOL.SOL",
  [Chain.Starknet]: "STRK.STRK",
  [Chain.Stellar]: "XLM.XLM",
  [Chain.Sui]: "SUI.SUI",
  [Chain.THORChain]: "THOR.RUNE",
  [Chain.Ton]: "TON.TON",
  [Chain.Tron]: "TRON.TRX",
  [Chain.XLayer]: "XLAYER.OKB",
  [Chain.Zcash]: "ZEC.ZEC",
};

const CHAIN_STABLE_USDC: Partial<Record<Chain, string>> = {
  [Chain.Arbitrum]: "ARB.USDC-0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  [Chain.Avalanche]: "AVAX.USDC-0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  [Chain.Base]: "BASE.USDC-0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  [Chain.BinanceSmartChain]: "BSC.USDC-0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  [Chain.Ethereum]: "ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [Chain.Optimism]: "OP.USDC-0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  [Chain.Polygon]: "POL.USDC-0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  [Chain.Solana]: "SOL.USDC-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

const CHAIN_STABLE_USDT: Partial<Record<Chain, string>> = {
  [Chain.Arbitrum]: "ARB.USDT-0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  [Chain.Avalanche]: "AVAX.USDT-0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
  [Chain.Base]: "BASE.USDT-0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  [Chain.BinanceSmartChain]: "BSC.USDT-0x55d398326f99059fF775485246999027B3197955",
  [Chain.Ethereum]: "ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7",
  [Chain.Optimism]: "OP.USDT-0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
  [Chain.Polygon]: "POL.USDT-0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  [Chain.Solana]: "SOL.USDT-Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  [Chain.Tron]: "TRON.USDT-TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
};

export type DefaultAssetPair = {
  input: string;
  output: string;
  /** False for native-only single-chain selections and the zero-chain case — drives the studio warning. */
  hasUsableDefault: boolean;
};

/**
 * Pick the input/output pair for a given chain selection. Input is always the
 * gas asset of the input chain — on-chain swaps settle by paying gas in the
 * native token, so a stablecoin input would leave the user unable to fund.
 *
 * `chains` is expected in `API_SUPPORTED_CHAINS` order (importance-ranked).
 */
export function pickDefaultAssetPair(chains: ReadonlyArray<Chain>): DefaultAssetPair {
  const legacyInput = "BTC.BTC";
  const legacyOutput = "ETH.USDT-0xdAC17F958D2ee523a2206206994597C13D831ec7";

  // Destructure once with a guard so TS narrows both ends to Chain.
  const [first, second] = chains;
  if (first === undefined) return { hasUsableDefault: false, input: legacyInput, output: legacyOutput };

  if (second !== undefined) {
    const set = new Set(chains);
    if (set.has(Chain.Bitcoin) && set.has(Chain.Ethereum)) {
      return { hasUsableDefault: true, input: legacyInput, output: legacyOutput };
    }
    const input = CHAIN_NATIVE_ASSET[first] ?? legacyInput;
    const output = CHAIN_STABLE_USDT[second] ?? CHAIN_STABLE_USDC[second] ?? CHAIN_NATIVE_ASSET[second] ?? legacyOutput;
    return { hasUsableDefault: true, input, output };
  }

  const usdc = CHAIN_STABLE_USDC[first];
  const usdt = CHAIN_STABLE_USDT[first];
  const native = CHAIN_NATIVE_ASSET[first];

  if (native && usdc) return { hasUsableDefault: true, input: native, output: usdc };
  if (native && usdt) return { hasUsableDefault: true, input: native, output: usdt };
  if (native) return { hasUsableDefault: false, input: native, output: native };
  return { hasUsableDefault: false, input: legacyInput, output: legacyOutput };
}
