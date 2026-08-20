import type Transport from "@ledgerhq/hw-transport";
import {
  Chain,
  type DerivationPathArray,
  type EVMChain,
  EVMChains,
  NetworkDerivationPath,
  SwapKitError,
  WalletOption,
} from "@swapkit/helpers";
import { BitcoinLedger } from "../clients/bitcoin";
import { CosmosLedger } from "../clients/cosmos";
import {
  ArbitrumLedger,
  AuroraLedger,
  AvalancheLedger,
  BaseLedger,
  BerachainLedger,
  BinanceSmartChainLedger,
  EthereumLedger,
  GnosisLedger,
  MonadLedger,
  OptimismLedger,
  PolygonLedger,
  XLayerLedger,
} from "../clients/evm";
import { getNearLedgerClient } from "../clients/near";
import { SuiLedger } from "../clients/sui";
import { THORChainLedger } from "../clients/thorchain";
import { TronLedger } from "../clients/tron";
import { BitcoinCashLedger, DashLedger, DogecoinLedger, LitecoinLedger } from "../clients/utxo";
import { XRPLedger } from "../clients/xrp";
import { ZcashLedger } from "../clients/zcash";
import { getLedgerDMKSession, type LedgerDMKSession } from "./dmk";
import type { LedgerDeviceActionStateHandler } from "./executeDeviceAction";

type LedgerSignerMap = {
  [Chain.Arbitrum]: ReturnType<typeof ArbitrumLedger>;
  [Chain.Aurora]: ReturnType<typeof AuroraLedger>;
  [Chain.Avalanche]: ReturnType<typeof AvalancheLedger>;
  [Chain.Base]: ReturnType<typeof BaseLedger>;
  [Chain.Berachain]: ReturnType<typeof BerachainLedger>;
  [Chain.BinanceSmartChain]: ReturnType<typeof BinanceSmartChainLedger>;
  [Chain.BitcoinCash]: ReturnType<typeof BitcoinCashLedger>;
  [Chain.Bitcoin]: ReturnType<typeof BitcoinLedger>;
  [Chain.Cosmos]: CosmosLedger;
  [Chain.Dash]: ReturnType<typeof DashLedger>;
  [Chain.Dogecoin]: ReturnType<typeof DogecoinLedger>;
  [Chain.Ethereum]: ReturnType<typeof EthereumLedger>;
  [Chain.Gnosis]: ReturnType<typeof GnosisLedger>;
  [Chain.Litecoin]: ReturnType<typeof LitecoinLedger>;
  [Chain.Monad]: ReturnType<typeof MonadLedger>;
  [Chain.Near]: ReturnType<typeof getNearLedgerClient>;
  [Chain.Optimism]: ReturnType<typeof OptimismLedger>;
  [Chain.Polygon]: ReturnType<typeof PolygonLedger>;
  [Chain.Ripple]: ReturnType<typeof XRPLedger>;
  [Chain.Sui]: ReturnType<typeof SuiLedger>;
  [Chain.THORChain]: THORChainLedger;
  [Chain.Tron]: ReturnType<typeof TronLedger>;
  [Chain.XLayer]: ReturnType<typeof XLayerLedger>;
  [Chain.Zcash]: ReturnType<typeof ZcashLedger>;
};

type LedgerSupportedChain = keyof LedgerSignerMap;

export async function getLedgerClient<T extends LedgerSupportedChain>({
  chain,
  dmkSession,
  derivationPath,
  onDeviceActionState,
  originToken,
  transport,
}: {
  chain: T;
  dmkSession?: LedgerDMKSession;
  derivationPath?: DerivationPathArray;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  originToken?: string;
  transport?: Transport;
}): Promise<LedgerSignerMap[T]> {
  const isEVMChain = EVMChains.includes(chain as EVMChain);

  if (dmkSession && transport) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      message: "Provide either a Ledger DMK session or a LedgerJS transport, not both",
    });
  }

  if (isEVMChain && transport) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      message: "Ledger EVM clients require a DMK session instead of a LedgerJS transport",
    });
  }

  const resolvedDMKSession = transport ? undefined : (dmkSession ?? (await getLedgerDMKSession()));
  const clientParams = {
    derivationPath: derivationPath ?? NetworkDerivationPath[chain],
    dmkSession: resolvedDMKSession,
    onDeviceActionState,
    transport,
  };
  const { match } = await import("ts-pattern");

  return match(chain as LedgerSupportedChain)
    .returnType<Promise<LedgerSignerMap[T]>>()
    .with(Chain.THORChain, () => Promise.resolve(new THORChainLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Cosmos, () => Promise.resolve(new CosmosLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Bitcoin, () => Promise.resolve(BitcoinLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.BitcoinCash, () => Promise.resolve(BitcoinCashLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Dash, () => Promise.resolve(DashLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Dogecoin, () => Promise.resolve(DogecoinLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Litecoin, () => Promise.resolve(LitecoinLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Zcash, () => Promise.resolve(ZcashLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Ripple, () => Promise.resolve(XRPLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Tron, () => Promise.resolve(TronLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Sui, () => Promise.resolve(SuiLedger(clientParams) as LedgerSignerMap[T]))
    .with(Chain.Near, () => Promise.resolve(getNearLedgerClient(clientParams) as LedgerSignerMap[T]))
    .with(
      Chain.Arbitrum,
      Chain.Aurora,
      Chain.Avalanche,
      Chain.Berachain,
      Chain.BinanceSmartChain,
      Chain.Ethereum,
      Chain.Gnosis,
      Chain.Monad,
      Chain.Optimism,
      Chain.Polygon,
      Chain.Base,
      Chain.XLayer,
      async () => {
        const { getProvider } = await import("@swapkit/toolboxes/evm");

        if (!resolvedDMKSession) {
          throw new SwapKitError("wallet_ledger_connection_error");
        }

        const params = {
          derivationPath,
          dmkSession: resolvedDMKSession,
          onDeviceActionState,
          originToken,
          provider: await getProvider(chain as EVMChain),
        };

        return match(chain as Chain)
          .with(Chain.BinanceSmartChain, () => BinanceSmartChainLedger(params) as LedgerSignerMap[T])
          .with(Chain.Avalanche, () => AvalancheLedger(params) as LedgerSignerMap[T])
          .with(Chain.Arbitrum, () => ArbitrumLedger(params) as LedgerSignerMap[T])
          .with(Chain.Berachain, () => BerachainLedger(params) as LedgerSignerMap[T])
          .with(Chain.Optimism, () => OptimismLedger(params) as LedgerSignerMap[T])
          .with(Chain.Polygon, () => PolygonLedger(params) as LedgerSignerMap[T])
          .with(Chain.Base, () => BaseLedger(params) as LedgerSignerMap[T])
          .with(Chain.Aurora, () => AuroraLedger(params) as LedgerSignerMap[T])
          .with(Chain.Gnosis, () => GnosisLedger(params) as LedgerSignerMap[T])
          .with(Chain.Monad, () => MonadLedger(params) as LedgerSignerMap[T])
          .with(Chain.XLayer, () => XLayerLedger(params) as LedgerSignerMap[T])
          .otherwise(() => EthereumLedger(params) as LedgerSignerMap[T]);
      },
    )
    .otherwise(() => {
      throw new SwapKitError("wallet_chain_not_supported", { chain, wallet: WalletOption.LEDGER });
    });
}
