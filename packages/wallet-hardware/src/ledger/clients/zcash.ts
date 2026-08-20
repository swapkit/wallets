import type { LegacyCreateTransactionArg, LegacyTransaction, SignerZcash } from "@ledgerhq/device-signer-kit-zcash";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import {
  type DerivationPathArray,
  derivationPathToString,
  NetworkDerivationPath,
  SwapKitError,
} from "@swapkit/helpers";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import type { Transaction, ZcashTransaction } from "@swapkit/utxo-signer";

import type { LedgerDMKSession } from "../helpers/dmk";
import { getLedgerDMKSession } from "../helpers/dmk";
import { executeLedgerDeviceAction, type LedgerDeviceActionStateHandler } from "../helpers/executeDeviceAction";
import { runLedgerJsOperation } from "../helpers/ledgerJsDmkBridge";
import { ZcashLedger as LegacyZcashLedger } from "./utxo";

const NU6_2_ACTIVATION_HEIGHT = 3_364_600;
const IRONWOOD_ACTIVATION_HEIGHT = 3_428_143;

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

function compactSize(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SwapKitError("wallet_ledger_invalid_params", { reason: `Invalid compact-size value: ${value}` });
  }
  if (value < 0xfd) return Uint8Array.of(value);
  if (value <= 0xffff) return Uint8Array.of(0xfd, value & 0xff, (value >>> 8) & 0xff);
  if (value <= 0xffffffff) {
    return Uint8Array.of(0xfe, value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24);
  }

  const bytes = new Uint8Array(9);
  bytes[0] = 0xff;
  new DataView(bytes.buffer).setBigUint64(1, BigInt(value), true);
  return bytes;
}

function readCompactSize({ bytes, offset }: { bytes: Uint8Array; offset: number }) {
  const prefix = bytes[offset];
  if (prefix === undefined) throw new Error("Unexpected end of previous transaction");
  if (prefix < 0xfd) return { offset: offset + 1, value: prefix };

  const byteLength = prefix === 0xfd ? 2 : prefix === 0xfe ? 4 : 8;
  if (offset + 1 + byteLength > bytes.length) throw new Error("Truncated compact-size value");
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, byteLength);
  const value =
    byteLength === 2
      ? view.getUint16(0, true)
      : byteLength === 4
        ? view.getUint32(0, true)
        : Number(view.getBigUint64(0, true));
  if (!Number.isSafeInteger(value)) throw new Error("Previous transaction compact-size value exceeds safe range");
  return { offset: offset + 1 + byteLength, value };
}

function readUint32LE({ bytes, offset }: { bytes: Uint8Array; offset: number }) {
  if (offset + 4 > bytes.length) throw new Error("Unexpected end of previous transaction");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function parsePreviousTransactionOutput({ bytes, outputIndex }: { bytes: Uint8Array; outputIndex: number }) {
  const version = readUint32LE({ bytes, offset: 0 }) & 0x7fffffff;
  const overwintered = (readUint32LE({ bytes, offset: 0 }) & 0x80000000) !== 0;
  let offset = overwintered ? 8 : 4;
  let consensusBranchId = new Uint8Array();
  let expiryHeight = new Uint8Array();
  let locktime = new Uint8Array();

  if (version >= 5) {
    if (bytes.length < 20) throw new Error("Truncated Zcash v5 transaction header");
    consensusBranchId = bytes.slice(8, 12);
    locktime = bytes.slice(12, 16);
    expiryHeight = bytes.slice(16, 20);
    offset = 20;
  }

  const inputCount = readCompactSize({ bytes, offset });
  offset = inputCount.offset;
  for (let index = 0; index < inputCount.value; index += 1) {
    if (offset + 36 > bytes.length) throw new Error("Truncated previous transaction input");
    offset += 36;
    const scriptLength = readCompactSize({ bytes, offset });
    offset = scriptLength.offset + scriptLength.value + 4;
    if (offset > bytes.length) throw new Error("Truncated previous transaction input script");
  }

  const outputCount = readCompactSize({ bytes, offset });
  offset = outputCount.offset;
  if (outputIndex < 0 || outputIndex >= outputCount.value) {
    throw new Error("Zcash input references an output outside its previous transaction");
  }

  let referencedOutput: { amount: Uint8Array; script: Uint8Array } | undefined;
  for (let index = 0; index < outputCount.value; index += 1) {
    if (offset + 8 > bytes.length) throw new Error("Truncated previous transaction output amount");
    const amount = bytes.slice(offset, offset + 8);
    offset += 8;
    const scriptLength = readCompactSize({ bytes, offset });
    offset = scriptLength.offset;
    if (offset + scriptLength.value > bytes.length) throw new Error("Truncated previous transaction output script");
    const script = bytes.slice(offset, offset + scriptLength.value);
    offset += scriptLength.value;
    if (index === outputIndex) referencedOutput = { amount, script };
  }

  if (version < 5) {
    if (offset + 4 > bytes.length) throw new Error("Previous transaction is missing locktime");
    locktime = bytes.slice(offset, offset + 4);
    offset += 4;
    expiryHeight = overwintered ? bytes.slice(offset, offset + 4) : new Uint8Array();
  }

  if (!referencedOutput) throw new Error("Previous transaction output could not be parsed");
  return { consensusBranchId, expiryHeight, locktime, outputCount: outputCount.value, referencedOutput };
}

function concatBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function serializeOutputs(tx: ZcashTransaction) {
  const outputs = Array.from({ length: tx.outputsLength }, (_, index) => tx.getOutput(index));
  return concatBytes([
    compactSize(outputs.length),
    ...outputs.flatMap(({ amount, script }) => [uint64LE(amount), compactSize(script.length), script]),
  ]);
}

async function activationHeight(consensusBranchId: number) {
  const { ZcashConsensusBranchId } = await import("@swapkit/utxo-signer");

  switch (consensusBranchId) {
    case ZcashConsensusBranchId.NU6_2:
      return NU6_2_ACTIVATION_HEIGHT;
    case ZcashConsensusBranchId.IRONWOOD:
      return IRONWOOD_ACTIVATION_HEIGHT;
    default:
      throw new SwapKitError("wallet_ledger_invalid_params", {
        consensusBranchId,
        reason: "Ledger Zcash DSK signing supports NU6.2 and Ironwood target branches",
      });
  }
}

function previousTransaction({ inputIndex, utxo }: { inputIndex: number; utxo: UTXOType }): LegacyTransaction {
  if (!utxo.txHex) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      inputIndex,
      reason: "Zcash Ledger signing requires the full previous transaction txHex for every input",
    });
  }

  const raw = hex.decode(utxo.txHex.replace(/^0x/i, ""));
  const parsed = (() => {
    try {
      return parsePreviousTransactionOutput({ bytes: raw, outputIndex: utxo.index });
    } catch (error) {
      throw new SwapKitError("wallet_ledger_invalid_params", error);
    }
  })();

  const outputs = Array.from({ length: utxo.index + 1 }, (_, outputIndex) =>
    outputIndex === utxo.index ? parsed.referencedOutput : { amount: new Uint8Array(8), script: new Uint8Array() },
  );

  return {
    consensusBranchId: parsed.consensusBranchId,
    inputs: [],
    locktime: parsed.locktime,
    nExpiryHeight: parsed.expiryHeight,
    nVersionGroupId: (readUint32LE({ bytes: raw, offset: 0 }) & 0x80000000) !== 0 ? raw.slice(4, 8) : undefined,
    outputs,
    serializedPreviousTransactionOverride: raw,
    version: raw.slice(0, 4),
  };
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
  let signerPromise: Promise<SignerZcash> | undefined;

  function getSigner() {
    if (legacyClient) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        reason: "A Device Signer Kit operation is unavailable when a legacy transport is supplied",
      });
    }

    signerPromise ??= (async () => {
      const session = dmkSession ?? (await getLedgerDMKSession());
      const { SignerZcashBuilder } = await import("@ledgerhq/device-signer-kit-zcash");
      return new SignerZcashBuilder(session).build();
    })();
    return signerPromise;
  }

  async function getDskAddress({ checkOnDevice = false, path = configuredPath.fullPath } = {}) {
    const signer = await getSigner();
    return executeLedgerDeviceAction({ action: signer.getAddress(path, { checkOnDevice }), onDeviceActionState });
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

    if (legacyClient) {
      const legacyTx = { unsignedTx: tx.toBytes() } as Transaction;
      const signed =
        derivationPaths === undefined
          ? await legacyClient.signTransaction(legacyTx, inputUtxos)
          : await legacyClient.signTransactionWithMultiplePaths(
              legacyTx,
              inputUtxos,
              paths.map((path) => `m/${path}`),
            );
      return assertRawV5(signed);
    }

    const blockHeight = await activationHeight(tx.consensusBranchId);
    const args: LegacyCreateTransactionArg = {
      additionals: ["zcash", "sapling"],
      associatedKeysets: paths,
      blockHeight,
      changePath: changePath ? parseZcashPath(changePath).fullPath : configuredPath.fullPath,
      expiryHeight: uint32LE(tx.expiryHeight),
      inputs: inputUtxos.map((utxo, inputIndex) => [
        previousTransaction({ inputIndex, utxo }),
        utxo.index,
        null,
        tx.getInput(inputIndex).sequence ?? 0xffffffff,
      ]),
      lockTime: tx.lockTime,
      outputScriptHex: hex.encode(serializeOutputs(tx)),
    };
    const signer = await getSigner();
    const signed = await executeLedgerDeviceAction({ action: signer.signTransaction(args), onDeviceActionState });
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
