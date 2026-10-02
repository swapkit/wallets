import type {
  LegacyCreateTransactionArg,
  LegacyTransaction,
  LegacyTransactionInput,
  LegacyTransactionOutput,
  SignerZcash,
} from "@ledgerhq/device-signer-kit-zcash";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import {
  type DerivationPathArray,
  derivationPathToString,
  NetworkDerivationPath,
  SwapKitError,
} from "@swapkit/helpers";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import type { ZcashTransaction } from "@swapkit/utxo-signer";

import type { LedgerDMKSession } from "../helpers/dmk";
import { createLedgerSessionSigner, getLedgerDMKSession } from "../helpers/dmk";
import { executeLedgerDeviceAction, type LedgerDeviceActionStateHandler } from "../helpers/executeDeviceAction";
import { runLedgerJsOperation } from "../helpers/ledgerJsDmkBridge";
import { ZcashLedger as LegacyZcashLedger } from "./utxo";

// @swapkit/utxo-signer 3.1.0 exports only the Ironwood activation height.
const NU6_2_ACTIVATION_HEIGHT = 3_364_600;

interface ZcashLedgerParams {
  derivationPath?: DerivationPathArray | string;
  dmkSession?: LedgerDMKSession;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  transport?: Transport;
}

interface GetExtendedPublicKeyParams {
  path?: string;
  xpubVersion?: number;
}

interface SignZcashTransactionParams {
  changePath?: string;
  derivationPaths?: string[];
  inputUtxos: UTXOType[];
  tx: ZcashTransaction;
}

interface SignZcashTransactionWithMultiplePathsParams extends Omit<SignZcashTransactionParams, "derivationPaths"> {
  derivationPaths: string[];
}

interface ParsedZcashPath {
  account: number;
  accountPath: string;
  fullPath: string;
}

function normalizePath(path: DerivationPathArray | string) {
  return (typeof path === "string" ? path : derivationPathToString(path)).replace(/^m\//, "").replace(/^\/+/, "");
}

function parseZcashPath(path: DerivationPathArray | string): ParsedZcashPath {
  const normalized = normalizePath(path);
  const match = /^44'\/133'\/(\d+)'(?:\/(0|1)\/(\d+))?$/.exec(normalized);

  if (!match) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      path: normalized,
      reason: "Expected a Zcash BIP44 path with coin type 133",
    });
  }

  const account = Number(match[1]);
  const accountPath = `44'/133'/${account}'`;
  return { account, accountPath, fullPath: `${accountPath}/${match[2] ?? 0}/${match[3] ?? 0}` };
}

function uint32LE(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function uint64LE(value: bigint) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

// Keeps the failure context in the error info, and so in its message, rather than only in its cause.
function invalidParams(info: Record<string, unknown>, cause?: unknown) {
  return new SwapKitError({ errorKey: "wallet_ledger_invalid_params", info }, cause);
}

function readUint32LE({ bytes, offset }: { bytes: Uint8Array; offset: number }) {
  if (offset + 4 > bytes.length) throw new Error("Unexpected end of previous transaction");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

// @swapkit/utxo-signer 3.1.0 has no bounds-checked, v5-aware decoder (ZcashTransaction.fromBytes reads only the
// v4 layout and its Reader is not exported), so previous transactions are read here.
function createPreviousTransactionReader(bytes: Uint8Array) {
  let offset = 0;

  function take(length: number) {
    if (offset + length > bytes.length) throw new Error(`Previous transaction ends before byte ${offset + length}`);
    offset += length;
    return bytes.slice(offset - length, offset);
  }

  function compactSize() {
    const prefix = take(1)[0] ?? 0;
    if (prefix < 0xfd) return prefix;

    const view = new DataView(take(prefix === 0xfd ? 2 : prefix === 0xfe ? 4 : 8).buffer);
    const value =
      view.byteLength === 2
        ? view.getUint16(0, true)
        : view.byteLength === 4
          ? view.getUint32(0, true)
          : Number(view.getBigUint64(0, true));
    if (!Number.isSafeInteger(value)) throw new Error("Previous transaction compact-size value exceeds safe range");
    return value;
  }

  return { compactSize, rest: () => take(bytes.length - offset), take, varBytes: () => take(compactSize()) };
}

// Fields are read into locals in wire order: object keys are kept sorted, which is not the order on the wire.
function parsePreviousTransaction({ bytes, version }: { bytes: Uint8Array; version: number }) {
  const reader = createPreviousTransactionReader(bytes);
  const header = reader.take(version === 4 ? 8 : 20);

  const inputs: LegacyTransactionInput[] = [];
  for (let count = reader.compactSize(); inputs.length < count; ) {
    const prevout = reader.take(36);
    const script = reader.varBytes();
    const sequence = reader.take(4);
    inputs.push({ prevout, script, sequence });
  }

  const outputs: LegacyTransactionOutput[] = [];
  for (let count = reader.compactSize(); outputs.length < count; ) {
    const amount = reader.take(8);
    const script = reader.varBytes();
    outputs.push({ amount, script });
  }

  const transparentFields = { inputs, nVersionGroupId: header.slice(4, 8), outputs, version: header.slice(0, 4) };
  if (version >= 5) {
    return {
      ...transparentFields,
      consensusBranchId: header.slice(8, 12),
      locktime: header.slice(12, 16),
      nExpiryHeight: header.slice(16, 20),
    };
  }

  const locktime = reader.take(4);
  const nExpiryHeight = reader.take(4);
  // Value balance, Sapling spends and outputs, JoinSplits and the binding signature follow nExpiryHeight.
  return { ...transparentFields, extraData: reader.rest(), locktime, nExpiryHeight };
}

// Either byte order binds a txid equally: toolbox-built transactions keep display-order txids, while
// ZcashTransaction.fromBytes keeps them in wire order.
function matchesTxid({ hash, txid }: { hash: string; txid: Uint8Array }) {
  const normalized = hash.toLowerCase();
  return normalized === hex.encode(txid) || normalized === hex.encode(txid.slice().reverse());
}

async function serializeOutputs(tx: ZcashTransaction) {
  const { CompactSize, utils } = await import("@swapkit/utxo-signer");
  const outputs = Array.from({ length: tx.outputsLength }, (_, index) => tx.getOutput(index));
  return utils.concatBytes(
    CompactSize.encode(BigInt(outputs.length)),
    ...outputs.flatMap(({ amount, script }) => [uint64LE(amount), CompactSize.encode(BigInt(script.length)), script]),
  );
}

async function activationHeight(consensusBranchId: number) {
  const { ZCASH_IRONWOOD_ACTIVATION_HEIGHT, ZcashConsensusBranchId } = await import("@swapkit/utxo-signer");

  switch (consensusBranchId) {
    case ZcashConsensusBranchId.NU6_2:
      return NU6_2_ACTIVATION_HEIGHT;
    case ZcashConsensusBranchId.IRONWOOD:
      return ZCASH_IRONWOOD_ACTIVATION_HEIGHT;
    default:
      throw new SwapKitError("wallet_ledger_invalid_params", {
        consensusBranchId,
        reason: "Ledger Zcash DSK signing supports NU6.2 and Ironwood target branches",
      });
  }
}

async function previousTransaction({
  inputIndex,
  utxo,
}: {
  inputIndex: number;
  utxo: UTXOType;
}): Promise<LegacyTransaction> {
  const { hash: txid, index: outputIndex, txHex } = utxo;
  const context = { inputIndex, outputIndex, txid };
  if (!txHex) {
    throw invalidParams({
      ...context,
      reason: "Zcash Ledger signing requires the full previous transaction txHex for every input",
    });
  }

  function readPrevious<T>(read: () => T) {
    try {
      return read();
    } catch (error) {
      throw invalidParams({ ...context, reason: error instanceof Error ? error.message : String(error) }, error);
    }
  }

  const raw = readPrevious(() => hex.decode(txHex.replace(/^0x/i, "")));
  const header = readPrevious(() => readUint32LE({ bytes: raw, offset: 0 }));
  const version = header & 0x7fffffff;
  // The Zcash DSK can stream only v4 (Sapling) and v5/v6 previous transactions into a trusted input.
  if ((header & 0x80000000) === 0 || version < 4 || version > 6) {
    throw invalidParams({
      ...context,
      reason: "Ledger Zcash signing supports only overwintered v4, v5 and v6 previous transactions",
      version,
    });
  }

  const parsed = readPrevious(() => parsePreviousTransaction({ bytes: raw, version }));
  if (outputIndex < 0 || outputIndex >= parsed.outputs.length) {
    throw invalidParams({
      ...context,
      outputCount: parsed.outputs.length,
      reason: "Zcash input references an output outside its previous transaction",
    });
  }

  // The DSK streams a v5/v6 previous transaction from its wire bytes and the device computes its ZIP-244 txid.
  // Override bytes must use that layout, so the DSK frames a v4 itself from the parsed fields instead.
  if (version >= 5) return { ...parsed, serializedPreviousTransactionOverride: raw };

  // A v4 txid is the double SHA-256 of its bytes, so bind the transaction to the planned input before the
  // device trusts its amounts.
  const { utils } = await import("@swapkit/utxo-signer");
  const previousTxid = utils.sha256x2(raw);
  if (!matchesTxid({ hash: txid, txid: previousTxid })) {
    throw invalidParams({
      ...context,
      previousTxid: hex.encode(previousTxid.reverse()),
      reason: "Previous transaction does not hash to the input txid",
    });
  }

  return parsed;
}

function validateSigningParams({
  accountPath,
  derivationPaths,
  inputUtxos,
  tx,
}: {
  accountPath: string;
  derivationPaths: string[];
  inputUtxos: UTXOType[];
  tx: ZcashTransaction;
}) {
  if (inputUtxos.length !== tx.inputsLength || derivationPaths.length !== tx.inputsLength) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      derivationPathCount: derivationPaths.length,
      inputCount: tx.inputsLength,
      inputUtxoCount: inputUtxos.length,
      reason: "Zcash input UTXOs and derivation paths must match the transaction input count",
    });
  }

  inputUtxos.forEach((utxo, inputIndex) => {
    const input = tx.getInput(inputIndex);
    if (!matchesTxid({ hash: utxo.hash, txid: input.txid }) || utxo.index !== input.index) {
      throw invalidParams({
        inputIndex,
        reason: "Zcash input UTXO does not match the transaction input",
        transactionInput: { index: input.index, txid: hex.encode(input.txid) },
        utxo: { hash: utxo.hash, index: utxo.index },
      });
    }
  });

  return derivationPaths.map((path) => {
    const parsedPath = parseZcashPath(path);
    if (parsedPath.accountPath !== accountPath) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        accountPath,
        path: parsedPath.fullPath,
        reason: "All Zcash input derivation paths must belong to the configured account",
      });
    }
    return parsedPath.fullPath;
  });
}

function assertRawV5(rawTransaction: string) {
  const normalized = rawTransaction.replace(/^0x/i, "");
  const bytes = hex.decode(normalized);
  if (bytes.length < 4 || (new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true) & 0x7fffffff) !== 5) {
    throw new SwapKitError("wallet_ledger_invalid_response", {
      reason: "Ledger Zcash signer did not return a version 5 transaction",
    });
  }
  return normalized;
}

export function ZcashLedger({
  derivationPath = NetworkDerivationPath.ZEC,
  dmkSession,
  onDeviceActionState,
  transport,
}: ZcashLedgerParams = {}) {
  const configuredPath = parseZcashPath(derivationPath);
  const legacyClient = transport ? LegacyZcashLedger(derivationPath, transport) : undefined;
  const getSessionSigner = createLedgerSessionSigner<SignerZcash>({
    build: async (session) => {
      const { SignerZcashBuilder } = await import("@ledgerhq/device-signer-kit-zcash");
      return new SignerZcashBuilder(session).build();
    },
    dmkSession,
  });

  function getSigner() {
    if (legacyClient) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        reason: "A Device Signer Kit operation is unavailable when a legacy transport is supplied",
      });
    }

    return getSessionSigner();
  }

  async function getDskAddress({ checkOnDevice = false, path = configuredPath.fullPath } = {}) {
    const signer = await getSigner();
    return executeLedgerDeviceAction({ action: () => signer.getAddress(path, { checkOnDevice }), onDeviceActionState });
  }

  async function getExtendedPublicKey({
    path = configuredPath.accountPath,
    xpubVersion = 0x0488b21e,
  }: GetExtendedPublicKeyParams = {}) {
    const parsedAccount = parseZcashPath(path);
    if (parsedAccount.fullPath !== `${parsedAccount.accountPath}/0/0` || normalizePath(path).split("/").length !== 3) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        path,
        reason: "Zcash extended public keys are exported at account level",
      });
    }

    const connection = {
      dmkSession: transport ? undefined : (dmkSession ?? (await getLedgerDMKSession())),
      onDeviceActionState,
      transport,
    };
    const { default: BitcoinApp } = await import("@ledgerhq/hw-app-btc");
    return runLedgerJsOperation({
      appName: "Zcash",
      connection,
      createApp: (operationTransport) => new BitcoinApp({ currency: "zcash", transport: operationTransport }),
      operation: (app) => app.getWalletXpub({ path: parsedAccount.accountPath, xpubVersion }),
    });
  }

  async function signTransaction({ changePath, derivationPaths, inputUtxos, tx }: SignZcashTransactionParams) {
    const paths = validateSigningParams({
      accountPath: configuredPath.accountPath,
      derivationPaths: derivationPaths ?? Array.from({ length: tx.inputsLength }, () => configuredPath.fullPath),
      inputUtxos,
      tx,
    });

    // hw-app-btc picks a pre-Ironwood branch id without a block height and misparses v5 previous
    // transactions, so the legacy transport cannot produce a transaction the network accepts.
    if (legacyClient) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        reason: "Zcash signing requires a Ledger DMK session instead of a legacy transport",
      });
    }

    const blockHeight = await activationHeight(tx.consensusBranchId);
    const inputs = await Promise.all(
      inputUtxos.map(
        async (utxo, inputIndex): Promise<LegacyCreateTransactionArg["inputs"][number]> => [
          await previousTransaction({ inputIndex, utxo }),
          utxo.index,
          null,
          tx.getInput(inputIndex).sequence ?? 0xffffffff,
        ],
      ),
    );
    const args: LegacyCreateTransactionArg = {
      additionals: ["zcash", "sapling"],
      associatedKeysets: paths,
      blockHeight,
      changePath: changePath ? parseZcashPath(changePath).fullPath : configuredPath.fullPath,
      expiryHeight: uint32LE(tx.expiryHeight),
      inputs,
      lockTime: tx.lockTime,
      outputScriptHex: hex.encode(await serializeOutputs(tx)),
    };
    const signer = await getSigner();
    const signed = await executeLedgerDeviceAction({ action: () => signer.signTransaction(args), onDeviceActionState });
    return assertRawV5(signed);
  }

  return {
    connect: async () => {
      if (legacyClient) return legacyClient.connect();
      await getSigner();
    },
    disconnect: async () => legacyClient?.disconnect(),
    getAddress: async () => {
      if (legacyClient) return legacyClient.getAddress();
      return (await getDskAddress()).address;
    },
    getAddressAndPubKey: async () => {
      if (legacyClient) return { address: await legacyClient.getAddress() };
      const { address, chainCode, publicKey } = await getDskAddress();
      return { address, chainCode: hex.encode(chainCode), publicKey: hex.encode(publicKey) };
    },
    getExtendedPublicKey,
    showAddressAndPubKey: async () => {
      if (legacyClient) return { address: await legacyClient.getAddress() };
      const { address, chainCode, publicKey } = await getDskAddress({ checkOnDevice: true });
      return { address, chainCode: hex.encode(chainCode), publicKey: hex.encode(publicKey) };
    },
    signTransaction,
    signTransactionWithMultiplePaths: async (params: SignZcashTransactionWithMultiplePathsParams) =>
      signTransaction(params),
  };
}
