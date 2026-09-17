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
import {
  fetchLedgerNetworkCertificate,
  fetchLedgerNetworkDescriptor,
  getRegisteredLedgerNetworks,
  provideLedgerCertificate,
  provideLedgerNetworkInformation,
} from "../helpers/ledgerNetworkInfo";

const LOG_PREFIX = "[ledger/evm]";

// Ethereum app status word returned when it rejects an APDU payload, e.g. a token
// descriptor for a chain missing from the app's hardcoded network table.
const LEDGER_INCORRECT_DATA = 0x6a80;

type LedgerTransactionResolution = Awaited<
  ReturnType<typeof import("@ledgerhq/hw-app-eth")["ledgerService"]["resolveTransaction"]>
>;

function isLedgerIncorrectDataError(error: unknown) {
  return (
    error instanceof Error &&
    "statusCode" in error &&
    (error as { statusCode: number }).statusCode === LEDGER_INCORRECT_DATA
  );
}

function hasClearSigningPayload(resolution: LedgerTransactionResolution | null) {
  if (!resolution) return false;

  return [
    resolution.erc20Tokens,
    resolution.externalPlugin,
    resolution.plugin,
    resolution.nfts,
    resolution.domains,
  ].some((entries) => entries?.length);
}

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

    const nonce = tx.nonce ?? undefined;
    const transactionCount =
      nonce === undefined ? await this.provider?.getTransactionCount(tx.from || (await this.getAddress())) : undefined;

    const baseTx = {
      chainId: tx.chainId || this.chainId,
      data: tx.data,
      gasLimit: tx.gasLimit,
      ...(tx.gasPrice && { gasPrice: tx.gasPrice }),
      ...(!tx.gasPrice &&
        tx.maxFeePerGas && { maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas }),
      nonce: nonce !== undefined ? Number(nonce.toString()) : transactionCount,
      to: tx.to?.toString(),
      type: tx.type && !Number.isNaN(tx.type) ? tx.type : tx.maxFeePerGas ? 2 : 0,
      value: tx.value,
    };

    // ledger expects the tx to be serialized without the 0x prefix
    const unsignedTx = Transaction.from(baseTx).unsignedSerialized.slice(2);

    const { ledgerService } = await import("@ledgerhq/hw-app-eth");

    // Clear-signing metadata (ERC20 descriptors, plugins) is best effort: if Ledger's
    // asset list can't be reached we fall back to blind signing instead of failing.
    const resolution = await ledgerService
      .resolveTransaction(unsignedTx, {}, { erc20: true, externalPlugins: true })
      .catch(() => null);

    const signature = await this.signWithLedgerApp(unsignedTx, resolution, Number(baseTx.chainId));

    if (!signature) throw new SwapKitError("wallet_ledger_signing_error");

    const { r, s, v } = signature;

    return Transaction.from({ ...baseTx, signature: { r: `0x${r}`, s: `0x${s}`, v: parseLedgerSignatureV(v) } })
      .serialized;
  };

  /**
   * Signs with clear-signing metadata first.
   *
   * The app rejects token descriptors for chains missing from its hardcoded table (e.g. ARC)
   * with INCORRECT_DATA before the transaction is displayed. Without the descriptor the
   * internal ERC20 plugin falls back and the device demands blind signing, so we register
   * the chain with its Ledger-signed network descriptor and retry. Only if the chain cannot
   * be registered do we sign without metadata, which is what forces blind signing.
   * `null` (not `undefined`) tells hw-app-eth to skip auto-resolution.
   */
  private signWithLedgerApp = async (
    unsignedTx: string,
    resolution: LedgerTransactionResolution | null,
    chainId: number,
  ) => {
    try {
      return await this.ledgerApp?.signTransaction(this.derivationPath, unsignedTx, resolution);
    } catch (error) {
      if (!(isLedgerIncorrectDataError(error) && hasClearSigningPayload(resolution))) throw error;

      if (await this.registerNetworkOnDevice(chainId)) {
        try {
          return await this.ledgerApp?.signTransaction(this.derivationPath, unsignedTx, resolution);
        } catch (retryError) {
          if (!isLedgerIncorrectDataError(retryError)) throw retryError;

          console.warn(
            `${LOG_PREFIX} app still rejected clear-signing metadata for chain ${chainId} after registering it — signing blind`,
          );
        }
      }

      return await this.ledgerApp?.signTransaction(this.derivationPath, unsignedTx, null);
    }
  };

  /**
   * Registers the chain on the device so it accepts clear-signing metadata for it.
   * Best effort: returns whether it succeeded, and reports why it did not. Diagnostics
   * matter here because every failure path silently degrades to blind signing.
   */
  private registerNetworkOnDevice = async (chainId: number) => {
    const deviceModelId = this.transport?.deviceModel?.id;
    const appConfiguration = await this.ledgerApp?.getAppConfiguration().catch(() => undefined);
    const context = `chain ${chainId}, device ${deviceModelId ?? "unknown"}, app ${appConfiguration?.version ?? "unknown"} (needs >= 1.13.0), blind signing ${appConfiguration?.arbitraryDataEnabled ? "on" : "off"}`;

    if (!(this.transport && deviceModelId)) {
      console.warn(`${LOG_PREFIX} cannot register network, no device model on transport — ${context}`);
      return false;
    }

    try {
      const [descriptor, certificate] = await Promise.all([
        fetchLedgerNetworkDescriptor(chainId, deviceModelId),
        fetchLedgerNetworkCertificate(deviceModelId),
      ]);

      if (!descriptor) {
        console.warn(`${LOG_PREFIX} Ledger publishes no network descriptor for this device — ${context}`);
        return false;
      }

      // Recent app versions verify the descriptor against a certificate loaded at runtime,
      // so this has to go first or the descriptor is rejected as invalid data.
      if (certificate) {
        await provideLedgerCertificate(this.transport, certificate);
      } else {
        console.warn(`${LOG_PREFIX} no network certificate published for this device — ${context}`);
      }

      const { iconAccepted } = await provideLedgerNetworkInformation(this.transport, descriptor);

      // Ask the device what it actually holds instead of trusting the status words.
      const registered = await getRegisteredLedgerNetworks(this.transport).catch(() => null);

      if (registered && !registered.includes(chainId)) {
        console.warn(
          `${LOG_PREFIX} device accepted the descriptor but did not register the chain (holds: ${registered.join(", ") || "none"}) — ${context}`,
        );
        return false;
      }

      if (!iconAccepted) {
        console.warn(`${LOG_PREFIX} chain registered without its icon, the device will show no logo — ${context}`);
      }

      return true;
    } catch (error) {
      console.warn(`${LOG_PREFIX} device refused the network descriptor — ${context}`, error);
      return false;
    }
  };
}

type LedgerParams = { provider: Provider; derivationPath?: DerivationPathArray; transport?: Transport };

export const ArbitrumLedger = (params: LedgerParams) =>
  new EVMLedgerInterface({ ...params, chainId: ChainId.Arbitrum });
export const ArcLedger = (params: LedgerParams) => new EVMLedgerInterface({ ...params, chainId: ChainId.Arc });
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
