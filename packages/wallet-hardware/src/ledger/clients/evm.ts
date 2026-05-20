import type EthereumApp from "@ledgerhq/hw-app-eth";
import type Transport from "@ledgerhq/hw-transport";
import {
  ChainId,
  type DerivationPathArray,
  derivationPathToString,
  NetworkDerivationPath,
  SwapKitError,
} from "@swapkit/helpers";
import {
  AbstractSigner,
  type Provider,
  type TransactionRequest,
  type TypedDataDomain,
  type TypedDataField,
} from "ethers";

import { getLedgerTransport } from "../helpers/getLedgerTransport";

function parseLedgerSignatureV(v: number | string) {
  if (typeof v === "number") return v;

  const hex = v.startsWith("0x") ? v.slice(2) : v;
  return Number.parseInt(hex || "0", 16);
}

class EVMLedgerInterface extends AbstractSigner {
  chainId: ChainId = ChainId.Ethereum;
  derivationPath = "";
  ledgerApp: InstanceType<typeof EthereumApp> | null = null;
  ledgerTimeout = 50000;
  private transport?: Transport;
  private readonly injectedTransport?: Transport;

  constructor({
    provider,
    derivationPath = NetworkDerivationPath.OP,
    chainId = ChainId.Optimism,
    transport,
  }: { provider: Provider; derivationPath?: DerivationPathArray | string; chainId?: ChainId; transport?: Transport }) {
    super(provider);

    this.chainId = chainId || ChainId.Ethereum;
    this.derivationPath = typeof derivationPath === "string" ? derivationPath : derivationPathToString(derivationPath);
    this.injectedTransport = transport;

    Object.defineProperty(this, "provider", { enumerable: true, value: provider || null, writable: false });
  }

  connect = (provider: Provider) =>
    new EVMLedgerInterface({
      chainId: this.chainId,
      derivationPath: this.derivationPath,
      provider,
      transport: this.transport ?? this.injectedTransport,
    });

  checkOrCreateTransportAndLedger = async () => {
    await this.createTransportAndLedger();
  };

  createTransportAndLedger = async () => {
    if (this.ledgerApp) return;

    this.transport ||= this.injectedTransport ?? (await getLedgerTransport());
    const EthereumApp = (await import("@ledgerhq/hw-app-eth")).default;

    this.ledgerApp = new EthereumApp(this.transport);
  };

  getAddress = async () => {
    const response = await this.getAddressAndPubKey();
    if (!response) throw new SwapKitError("wallet_ledger_failed_to_get_address");
    return response.address;
  };

  getAddressAndPubKey = async () => {
    await this.createTransportAndLedger();
    return this.ledgerApp?.getAddress(this.derivationPath);
  };

  showAddressAndPubKey = async () => {
    await this.createTransportAndLedger();
    return this.ledgerApp?.getAddress(this.derivationPath, true);
  };

  signMessage = async (messageHex: string) => {
    const { Signature } = await import("ethers");
    await this.createTransportAndLedger();

    const sig = await this.ledgerApp?.signPersonalMessage(this.derivationPath, messageHex);

    if (!sig) throw new SwapKitError("wallet_ledger_signing_error");

    sig.r = `0x${sig.r}`;
    sig.s = `0x${sig.s}`;
    return Signature.from(sig).serialized;
  };

  sendTransaction = async (tx: TransactionRequest): Promise<any> => {
    if (!this.provider) throw new SwapKitError("wallet_ledger_no_provider");

    const signedTxHex = await this.signTransaction(tx);

    return await this.provider.broadcastTransaction(signedTxHex);
  };

  signTypedData = async (
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
    explicitPrimaryType?: string,
  ) => {
    const { buildEIP712DomainType } = await import("@swapkit/toolboxes/evm");
    const { Signature, TypedDataEncoder } = await import("ethers");
    await this.createTransportAndLedger();

    const { EIP712Domain: _, ...filteredTypes } = types;
    const primaryType = explicitPrimaryType ?? TypedDataEncoder.from(filteredTypes).primaryType;

    let sig: { v: number; s: string; r: string } | undefined;

    try {
      sig = await this.ledgerApp?.signEIP712Message(this.derivationPath, {
        domain: domain as Record<string, unknown>,
        message: value,
        primaryType,
        types: { EIP712Domain: buildEIP712DomainType(domain), ...filteredTypes },
      });
    } catch (error) {
      const isLedgerDeviceError = error instanceof Error && "statusCode" in error;
      if (!isLedgerDeviceError || (isLedgerDeviceError && (error as { statusCode: number }).statusCode === 0x6985)) {
        throw error;
      }

      const domainSeparator = TypedDataEncoder.hashDomain(domain).slice(2);
      const messageHash = TypedDataEncoder.from(filteredTypes).hash(value).slice(2);

      sig = await this.ledgerApp?.signEIP712HashedMessage(this.derivationPath, domainSeparator, messageHash);
    }

    if (!sig) throw new SwapKitError("wallet_ledger_signing_error");

    sig.r = `0x${sig.r}`;
    sig.s = `0x${sig.s}`;
    return Signature.from(sig).serialized;
  };

  signTransaction = async (tx: TransactionRequest) => {
    const { Transaction } = await import("ethers");
    await this.createTransportAndLedger();

    const transactionCount =
      tx.nonce === undefined
        ? await this.provider?.getTransactionCount(tx.from || (await this.getAddress()))
        : undefined;

    const baseTx = {
      chainId: tx.chainId || this.chainId,
      data: tx.data,
      gasLimit: tx.gasLimit,
      ...(tx.gasPrice && { gasPrice: tx.gasPrice }),
      ...(!tx.gasPrice &&
        tx.maxFeePerGas && { maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas }),
      nonce: tx.nonce !== undefined ? Number(tx.nonce.toString()) : transactionCount,
      to: tx.to?.toString(),
      type: tx.type && !Number.isNaN(tx.type) ? tx.type : tx.maxFeePerGas ? 2 : 0,
      value: tx.value,
    };

    // ledger expects the tx to be serialized without the 0x prefix
    const unsignedTx = Transaction.from(baseTx).unsignedSerialized.slice(2);

    const { ledgerService } = await import("@ledgerhq/hw-app-eth");

    const resolution = await ledgerService.resolveTransaction(unsignedTx, {}, { erc20: true, externalPlugins: true });

    const signature = await this.ledgerApp?.signTransaction(this.derivationPath, unsignedTx, resolution);

    if (!signature) throw new SwapKitError("wallet_ledger_signing_error");

    const { r, s, v } = signature;

    return Transaction.from({ ...baseTx, signature: { r: `0x${r}`, s: `0x${s}`, v: parseLedgerSignatureV(v) } })
      .serialized;
  };
}

type LedgerParams = { provider: Provider; derivationPath?: DerivationPathArray; transport?: Transport };

export const ArbitrumLedger = (params: LedgerParams) =>
  new EVMLedgerInterface({ ...params, chainId: ChainId.Arbitrum });
export const AuroraLedger = (params: LedgerParams) => new EVMLedgerInterface({ ...params, chainId: ChainId.Aurora });
export const AvalancheLedger = (params: LedgerParams) =>
  new EVMLedgerInterface({ ...params, chainId: ChainId.Avalanche });
export const BaseLedger = (params: LedgerParams) => new EVMLedgerInterface({ ...params, chainId: ChainId.Base });
export const EthereumLedger = (params: LedgerParams) =>
  new EVMLedgerInterface({ ...params, chainId: ChainId.Ethereum });
export const GnosisLedger = (params: LedgerParams) => new EVMLedgerInterface({ ...params, chainId: ChainId.Gnosis });
export const OptimismLedger = (params: LedgerParams) =>
  new EVMLedgerInterface({ ...params, chainId: ChainId.Optimism });
export const PolygonLedger = (params: LedgerParams) => new EVMLedgerInterface({ ...params, chainId: ChainId.Polygon });
export const BinanceSmartChainLedger = (params: LedgerParams) =>
  new EVMLedgerInterface({ ...params, chainId: ChainId.BinanceSmartChain });
export const MonadLedger = (params: LedgerParams) => new EVMLedgerInterface({ ...params, chainId: ChainId.Monad });
export const XLayerLedger = (params: LedgerParams) => new EVMLedgerInterface({ ...params, chainId: ChainId.XLayer });
export const BerachainLedger = (params: LedgerParams) =>
  new EVMLedgerInterface({ ...params, chainId: ChainId.Berachain });
