import type { TypedDataDomain as LedgerTypedDataDomain, SignerEth } from "@ledgerhq/device-signer-kit-ethereum";
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
  type TransactionLike,
  type TransactionRequest,
  type TypedDataDomain,
  type TypedDataField,
} from "ethers";

import type { LedgerDMKSession } from "../helpers/dmk";
import { executeLedgerDeviceAction, type LedgerDeviceActionStateHandler } from "../helpers/executeDeviceAction";

interface EVMLedgerParams {
  dmkSession: LedgerDMKSession;
  provider: Provider;
  derivationPath?: DerivationPathArray | string;
  chainId?: ChainId;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  originToken?: string;
}

function selectTypedDataTypes({
  primaryType,
  types,
}: {
  primaryType: string;
  types: Record<string, TypedDataField[]>;
}) {
  const selectedTypes: Record<string, TypedDataField[]> = {};

  function addType(typeName: string) {
    if (Object.hasOwn(selectedTypes, typeName) || !Object.hasOwn(types, typeName)) return;
    const fields = types[typeName];
    if (!fields) return;

    selectedTypes[typeName] = fields;
    for (const field of fields) addType(field.type.replace(/\[[0-9]*\]/g, ""));
  }

  addType(primaryType);

  if (!Object.hasOwn(selectedTypes, primaryType)) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      primaryType,
      reason: "The EIP-712 primary type is not defined",
    });
  }

  return selectedTypes;
}

class EVMLedgerInterface extends AbstractSigner {
  chainId: ChainId = ChainId.Ethereum;
  derivationPath = "";
  private readonly dmkSession: LedgerDMKSession;
  private ledgerSignerPromise?: Promise<SignerEth>;
  private readonly onDeviceActionState?: LedgerDeviceActionStateHandler;
  private readonly originToken?: string;

  constructor({
    provider,
    dmkSession,
    derivationPath = NetworkDerivationPath.OP,
    chainId = ChainId.Optimism,
    onDeviceActionState,
    originToken,
  }: EVMLedgerParams) {
    super(provider);

    this.chainId = chainId || ChainId.Ethereum;
    this.derivationPath = (
      typeof derivationPath === "string" ? derivationPath : derivationPathToString(derivationPath)
    ).replace(/^m\//, "");
    this.dmkSession = dmkSession;
    this.onDeviceActionState = onDeviceActionState;
    this.originToken = originToken;

    Object.defineProperty(this, "provider", { enumerable: true, value: provider || null, writable: false });
  }

  private getLedgerSigner = () => {
    this.ledgerSignerPromise ??= import("@ledgerhq/device-signer-kit-ethereum").then(({ SignerEthBuilder }) =>
      new SignerEthBuilder({ ...this.dmkSession, originToken: this.originToken }).build(),
    );

    return this.ledgerSignerPromise;
  };

  connect = (provider: Provider) =>
    new EVMLedgerInterface({
      chainId: this.chainId,
      derivationPath: this.derivationPath,
      dmkSession: this.dmkSession,
      onDeviceActionState: this.onDeviceActionState,
      originToken: this.originToken,
      provider,
    });

  getAddress = async () => {
    const { address } = await this.getAddressAndPubKey();
    if (!address) throw new SwapKitError("wallet_ledger_failed_to_get_address");
    return address;
  };

  getAddressAndPubKey = async () => {
    const ledgerSigner = await this.getLedgerSigner();

    return executeLedgerDeviceAction({
      action: ledgerSigner.getAddress(this.derivationPath, { chainId: Number(this.chainId) }),
      onDeviceActionState: this.onDeviceActionState,
    });
  };

  showAddressAndPubKey = async () => {
    const ledgerSigner = await this.getLedgerSigner();

    return executeLedgerDeviceAction({
      action: ledgerSigner.getAddress(this.derivationPath, { chainId: Number(this.chainId), checkOnDevice: true }),
      onDeviceActionState: this.onDeviceActionState,
    });
  };

  signMessage = async (message: string | Uint8Array) => {
    const { Signature, toUtf8Bytes } = await import("ethers");
    const ledgerSigner = await this.getLedgerSigner();
    const signature = await executeLedgerDeviceAction({
      action: ledgerSigner.signMessage(
        this.derivationPath,
        typeof message === "string" ? toUtf8Bytes(message) : message,
      ),
      onDeviceActionState: this.onDeviceActionState,
    });

    return Signature.from(signature).serialized;
  };

  signTypedData = async (
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>,
    explicitPrimaryType?: string,
  ) => {
    const { buildEIP712DomainType } = await import("@swapkit/toolboxes/evm");
    const { hexlify, Signature, TypedDataEncoder } = await import("ethers");
    const { EIP712Domain: _, ...filteredTypes } = types;
    const primaryType = explicitPrimaryType ?? TypedDataEncoder.from(filteredTypes).primaryType;
    const resolutionTypes = selectTypedDataTypes({ primaryType, types: filteredTypes });
    const populated = await TypedDataEncoder.resolveNames(domain, resolutionTypes, value, async (name) => {
      const resolvedAddress = await this.resolveName(name);
      if (!resolvedAddress) throw new SwapKitError("wallet_ledger_invalid_params", { name });
      return resolvedAddress;
    });
    const chainId = populated.domain.chainId == null ? undefined : Number(populated.domain.chainId);

    if (chainId !== undefined && !Number.isSafeInteger(chainId)) {
      throw new SwapKitError("wallet_ledger_invalid_params", { chainId: populated.domain.chainId });
    }

    const ledgerDomain = {
      ...(populated.domain.chainId != null && { chainId }),
      ...(populated.domain.name != null && { name: populated.domain.name }),
      ...(populated.domain.salt != null && { salt: hexlify(populated.domain.salt) }),
      ...(populated.domain.verifyingContract != null && { verifyingContract: populated.domain.verifyingContract }),
      ...(populated.domain.version != null && { version: populated.domain.version }),
    } satisfies LedgerTypedDataDomain;

    const ledgerSigner = await this.getLedgerSigner();
    const signature = await executeLedgerDeviceAction({
      action: ledgerSigner.signTypedData(this.derivationPath, {
        domain: ledgerDomain,
        message: populated.value,
        primaryType,
        types: { EIP712Domain: buildEIP712DomainType(populated.domain), ...filteredTypes },
      }),
      onDeviceActionState: this.onDeviceActionState,
    });

    return Signature.from(signature).serialized;
  };

  signTransaction = async (tx: TransactionRequest) => {
    const { copyRequest, getAddress, getBytes, resolveAddress, resolveProperties, Transaction } = await import(
      "ethers"
    );
    const request = copyRequest(tx);

    if (request.type === 4 || request.authorizationList?.length) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        message: "Ledger Ethereum DSK does not support EIP-7702 transactions",
      });
    }

    const { from, to } = await resolveProperties({
      from: request.from ? resolveAddress(request.from, this) : undefined,
      to: request.to ? resolveAddress(request.to, this) : undefined,
    });
    const signerAddress = from || request.nonce == null ? await this.getAddress() : undefined;

    if (from && signerAddress && getAddress(from) !== getAddress(signerAddress)) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        message: "Transaction from address does not match the Ledger account",
      });
    }

    if (to) request.to = to;
    delete request.from;
    delete request.authorizationList;
    request.chainId ??= BigInt(this.chainId);
    request.nonce ??= await this.provider?.getTransactionCount(signerAddress ?? (await this.getAddress()));

    const baseTx = Transaction.from(request as TransactionLike<string>);
    const unsignedTransaction = getBytes(baseTx.unsignedSerialized);
    const ledgerSigner = await this.getLedgerSigner();
    const signature = await executeLedgerDeviceAction({
      action: ledgerSigner.signTransaction(this.derivationPath, unsignedTransaction),
      onDeviceActionState: this.onDeviceActionState,
    });

    baseTx.signature = signature;

    return baseTx.serialized;
  };
}

interface LedgerParams {
  dmkSession: LedgerDMKSession;
  provider: Provider;
  derivationPath?: DerivationPathArray;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  originToken?: string;
}

export function ArbitrumLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Arbitrum });
}

export function AuroraLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Aurora });
}

export function AvalancheLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Avalanche });
}

export function BaseLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Base });
}

export function EthereumLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Ethereum });
}

export function GnosisLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Gnosis });
}

export function OptimismLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Optimism });
}

export function PolygonLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Polygon });
}

export function BinanceSmartChainLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.BinanceSmartChain });
}

export function MonadLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Monad });
}

export function XLayerLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.XLayer });
}

export function BerachainLedger(params: LedgerParams) {
  return new EVMLedgerInterface({ ...params, chainId: ChainId.Berachain });
}
