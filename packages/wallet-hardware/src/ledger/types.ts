import type { BitcoinLedger } from "./clients/bitcoin";
import type { CosmosLedger } from "./clients/cosmos";
import type {
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
} from "./clients/evm";
import type { SuiLedger } from "./clients/sui";
import type { THORChainLedger } from "./clients/thorchain";
import type { TronLedger } from "./clients/tron";
import type { BitcoinCashLedger, DashLedger, DogecoinLedger, LitecoinLedger } from "./clients/utxo";
import type { ZcashLedger } from "./clients/zcash";

export type UTXOLedgerClients =
  | ReturnType<typeof BitcoinLedger>
  | ReturnType<typeof BitcoinCashLedger>
  | ReturnType<typeof DashLedger>
  | ReturnType<typeof DogecoinLedger>
  | ReturnType<typeof LitecoinLedger>
  | ReturnType<typeof ZcashLedger>;
export type CosmosLedgerClients = CosmosLedger | THORChainLedger;
export type EVMLedgerClients =
  | ReturnType<typeof ArbitrumLedger>
  | ReturnType<typeof AuroraLedger>
  | ReturnType<typeof AvalancheLedger>
  | ReturnType<typeof BaseLedger>
  | ReturnType<typeof BerachainLedger>
  | ReturnType<typeof BinanceSmartChainLedger>
  | ReturnType<typeof GnosisLedger>
  | ReturnType<typeof EthereumLedger>
  | ReturnType<typeof MonadLedger>
  | ReturnType<typeof OptimismLedger>
  | ReturnType<typeof PolygonLedger>
  | ReturnType<typeof XLayerLedger>;
export type TronLedgerClient = ReturnType<typeof TronLedger>;
export type SuiLedgerClient = ReturnType<typeof SuiLedger>;
