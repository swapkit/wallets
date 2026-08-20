import type { SignerBtc } from "@ledgerhq/device-signer-kit-bitcoin";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import { HDKey } from "@scure/bip32";
import {
  Chain,
  type DerivationPathArray,
  derivationPathToString,
  NetworkDerivationPath,
  SwapKitError,
} from "@swapkit/helpers";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import type { Transaction } from "@swapkit/utxo-signer";
import { match, P } from "ts-pattern";

import type { LedgerDMKSession } from "../helpers/dmk";
import { getLedgerDMKSession } from "../helpers/dmk";
import { executeLedgerDeviceAction, type LedgerDeviceActionStateHandler } from "../helpers/executeDeviceAction";
import { BitcoinLedger as LegacyBitcoinLedger } from "./utxo";
import { extractInputsFromPsbt, signLegacyPsbtTransaction } from "./utxo-legacy-adapter";

interface BitcoinLedgerParams {
  derivationPath?: DerivationPathArray | string;
  dmkSession?: LedgerDMKSession;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  transport?: Transport;
}

interface GetExtendedPublicKeyParams {
  checkOnDevice?: boolean;
  path?: string;
}

interface SignBitcoinTransactionParams {
  inputUtxos?: UTXOType[];
  tx: Transaction;
}

interface SignBitcoinTransactionWithMultiplePathsParams extends SignBitcoinTransactionParams {
  derivationPaths: string[];
}

interface ParsedBitcoinPath {
  accountPath: string;
  addressIndex: number;
  change: number;
  fullPath: string;
  purpose: 44 | 49 | 84 | 86;
}

function normalizePath(path: DerivationPathArray | string) {
  return (typeof path === "string" ? path : derivationPathToString(path)).replace(/^m\//, "").replace(/^\/+/, "");
}

function invalidPath({ path, reason }: { path: string; reason: string }) {
  return new SwapKitError("wallet_ledger_invalid_params", { path, reason });
}

function parseBitcoinPath(path: DerivationPathArray | string): ParsedBitcoinPath {
  const normalized = normalizePath(path);
  const match = /^(44|49|84|86)'\/0'\/(\d+)'(?:\/(0|1)\/(\d+))?$/.exec(normalized);

  if (!match) {
    throw invalidPath({
      path: normalized,
      reason: "Expected a Bitcoin path with purpose 44, 49, 84, or 86 and coin type 0",
    });
  }

  const purpose = Number(match[1]) as ParsedBitcoinPath["purpose"];
  const accountPath = `${purpose}'/0'/${match[2]}'`;
  const change = Number(match[3] ?? 0);
  const addressIndex = Number(match[4] ?? 0);

  return { accountPath, addressIndex, change, fullPath: `${accountPath}/${change}/${addressIndex}`, purpose };
}

function pathToNumberArray(path: string) {
  return path.split("/").map((segment) => {
    const hardened = segment.endsWith("'");
    const value = Number.parseInt(hardened ? segment.slice(0, -1) : segment, 10);
    return hardened ? (value | 0x80000000) >>> 0 : value;
  });
}

function fingerprintToNumber(fingerprint: Uint8Array) {
  if (fingerprint.length !== 4) {
    throw new SwapKitError("wallet_ledger_invalid_response", {
      reason: `Expected a 4-byte master fingerprint, received ${fingerprint.length}`,
    });
  }

  return new DataView(fingerprint.buffer, fingerprint.byteOffset, fingerprint.byteLength).getUint32(0, false);
}

function validateInputCount({ count, tx }: { count: number; tx: Transaction }) {
  if (count !== tx.inputsLength) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      reason: `Input metadata count (${count}) must match transaction inputs count (${tx.inputsLength})`,
    });
  }
}

function validateAccountPaths({
  accountPath,
  derivationPaths,
  tx,
}: {
  accountPath: string;
  derivationPaths: string[];
  tx: Transaction;
}) {
  validateInputCount({ count: derivationPaths.length, tx });
  const parsedPaths = derivationPaths.map(parseBitcoinPath);
  const mismatchedPath = parsedPaths.find((path) => path.accountPath !== accountPath);

  if (mismatchedPath) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      accountPath,
      path: mismatchedPath.fullPath,
      reason: "All input derivation paths must belong to the configured Bitcoin account",
    });
  }

  return parsedPaths;
}

function descriptorTemplate(purpose: ParsedBitcoinPath["purpose"]) {
  return import("@ledgerhq/device-signer-kit-bitcoin").then(({ DefaultDescriptorTemplate }) => {
    switch (purpose) {
      case 44:
        return DefaultDescriptorTemplate.LEGACY;
      case 49:
        return DefaultDescriptorTemplate.NESTED_SEGWIT;
      case 84:
        return DefaultDescriptorTemplate.NATIVE_SEGWIT;
      case 86:
        return DefaultDescriptorTemplate.TAPROOT;
    }
  });
}

function stripHexPrefix(value: string) {
  return value.replace(/^0x/i, "");
}

function signedInputParts({
  rawInput,
  purpose,
}: {
  rawInput: ReturnType<Transaction["getInput"]>;
  purpose: ParsedBitcoinPath["purpose"];
}) {
  return match(purpose)
    .with(86, () => {
      const [tapKeySig] = rawInput.finalScriptWitness ?? [];
      if (!tapKeySig) throw new SwapKitError("wallet_ledger_invalid_response", { reason: "Missing taproot signature" });
      return { tapKeySig };
    })
    .with(P.union(49, 84), (segwitPurpose) => {
      const [signature, publicKey] = rawInput.finalScriptWitness ?? [];
      if (!signature || !publicKey) {
        throw new SwapKitError("wallet_ledger_invalid_response", { reason: "Missing SegWit signature or public key" });
      }

      return match(segwitPurpose)
        .with(49, async () => {
          const { Script } = await import("@swapkit/utxo-signer");
          const [redeemScript] = Script.decode(rawInput.finalScriptSig ?? new Uint8Array());
          if (!(redeemScript instanceof Uint8Array)) {
            throw new SwapKitError("wallet_ledger_invalid_response", { reason: "Missing nested SegWit redeem script" });
          }
          return { partialSig: [[publicKey, signature]] as [[Uint8Array, Uint8Array]], redeemScript };
        })
        .with(84, () => ({ partialSig: [[publicKey, signature]] as [[Uint8Array, Uint8Array]] }))
        .exhaustive();
    })
    .with(44, async () => {
      const { Script } = await import("@swapkit/utxo-signer");
      const [signature, publicKey] = Script.decode(rawInput.finalScriptSig ?? new Uint8Array());
      if (!(signature instanceof Uint8Array) || !(publicKey instanceof Uint8Array)) {
        throw new SwapKitError("wallet_ledger_invalid_response", { reason: "Missing legacy signature or public key" });
      }
      return { partialSig: [[publicKey, signature]] as [[Uint8Array, Uint8Array]] };
    })
    .exhaustive();
}

async function restoreSignedPsbt({
  rawTransaction,
  tx,
  purpose,
}: {
  rawTransaction: string;
  tx: Transaction;
  purpose: ParsedBitcoinPath["purpose"];
}) {
  const { Transaction } = await import("@swapkit/utxo-signer");
  const parsedRaw = Transaction.fromRaw(hex.decode(rawTransaction));
  if (parsedRaw.inputsLength !== tx.inputsLength || parsedRaw.outputsLength !== tx.outputsLength) {
    throw new SwapKitError("wallet_ledger_invalid_response", {
      reason: "Signed Bitcoin transaction shape does not match the requested transaction",
    });
  }

  const signedPsbt = tx.clone();
  for (let inputIndex = 0; inputIndex < parsedRaw.inputsLength; inputIndex += 1) {
    signedPsbt.updateInput(inputIndex, await signedInputParts({ purpose, rawInput: parsedRaw.getInput(inputIndex) }));
  }
  return signedPsbt;
}

export function BitcoinLedger({
  derivationPath = NetworkDerivationPath.BTC,
  dmkSession,
  onDeviceActionState,
  transport,
}: BitcoinLedgerParams = {}) {
  const configuredPath = parseBitcoinPath(derivationPath);
  const legacyClient = transport ? LegacyBitcoinLedger(derivationPath, transport) : undefined;
  let signerPromise: Promise<SignerBtc> | undefined;
  let accountXpubPromise: Promise<string> | undefined;
  let fingerprintPromise: Promise<number> | undefined;

  function getSigner() {
    if (legacyClient) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        reason: "A Device Signer Kit operation is unavailable when a legacy transport is supplied",
      });
    }

    signerPromise ??= (async () => {
      const session = dmkSession ?? (await getLedgerDMKSession());
      const { SignerBtcBuilder } = await import("@ledgerhq/device-signer-kit-bitcoin");
      return new SignerBtcBuilder(session).build();
    })();

    return signerPromise;
  }

  function getAccountXpub() {
    accountXpubPromise ??= getSigner().then(async (signer) => {
      const { extendedPublicKey } = await executeLedgerDeviceAction({
        action: signer.getExtendedPublicKey(configuredPath.accountPath),
        onDeviceActionState,
      });
      return extendedPublicKey;
    });
    return accountXpubPromise;
  }

  function getMasterFingerprint() {
    fingerprintPromise ??= getSigner().then(async (signer) => {
      const { masterFingerprint } = await executeLedgerDeviceAction({
        action: signer.getMasterFingerprint(),
        onDeviceActionState,
      });
      return fingerprintToNumber(masterFingerprint);
    });
    return fingerprintPromise;
  }

  async function getWallet() {
    const [{ DefaultWallet }, template] = await Promise.all([
      import("@ledgerhq/device-signer-kit-bitcoin"),
      descriptorTemplate(configuredPath.purpose),
    ]);
    return new DefaultWallet(configuredPath.accountPath, template);
  }

  async function addInputDerivations({ paths, tx }: { paths: ParsedBitcoinPath[]; tx: Transaction }) {
    const [accountXpub, fingerprint] = await Promise.all([getAccountXpub(), getMasterFingerprint()]);
    const { p2wpkh } = await import("@swapkit/utxo-signer");
    const accountKey = HDKey.fromExtendedKey(accountXpub);
    const psbt = tx.clone();

    for (let inputIndex = 0; inputIndex < paths.length; inputIndex += 1) {
      const path = paths[inputIndex];
      if (!path) continue;
      const publicKey = accountKey.derive(`m/${path.change}/${path.addressIndex}`).publicKey;
      if (!publicKey) {
        throw new SwapKitError("wallet_ledger_invalid_response", {
          inputIndex,
          reason: "Could not derive a public key from the Ledger account xpub",
        });
      }

      const derivation = { fingerprint, path: pathToNumberArray(path.fullPath) };
      if (path.purpose === 86) {
        const xOnlyPublicKey = publicKey.slice(1);
        psbt.updateInput(inputIndex, {
          tapBip32Derivation: [[xOnlyPublicKey, { der: derivation, hashes: [] }]],
          tapInternalKey: xOnlyPublicKey,
        });
      } else {
        const input = psbt.getInput(inputIndex);
        psbt.updateInput(inputIndex, {
          bip32Derivation: [[publicKey, derivation]],
          ...(path.purpose === 49 && !input.redeemScript ? { redeemScript: p2wpkh(publicKey).script } : {}),
        });
      }
    }

    return psbt;
  }

  async function signWithPaths({ paths, tx }: { paths: ParsedBitcoinPath[]; tx: Transaction }) {
    const [signer, wallet, psbt] = await Promise.all([getSigner(), getWallet(), addInputDerivations({ paths, tx })]);
    const signedTransaction = await executeLedgerDeviceAction({
      action: signer.signTransaction(wallet, psbt.toPSBT(0)),
      onDeviceActionState,
    });
    return stripHexPrefix(signedTransaction);
  }

  function signTransactionHex({ tx, inputUtxos }: SignBitcoinTransactionParams) {
    if (inputUtxos) validateInputCount({ count: inputUtxos.length, tx });

    if (legacyClient) {
      return inputUtxos
        ? legacyClient.signTransaction(tx, inputUtxos)
        : signLegacyPsbtTransaction({ chain: Chain.Bitcoin, legacyClient, tx });
    }

    const paths = Array.from({ length: tx.inputsLength }, () => configuredPath);
    return signWithPaths({ paths, tx });
  }

  return {
    connect: async () => {
      if (legacyClient) return legacyClient.connect();
      await getSigner();
    },
    disconnect: async () => legacyClient?.disconnect(),
    getAddress: async () => {
      if (legacyClient) return legacyClient.getAddress();
      const signer = await getSigner();
      const wallet = await getWallet();
      const { address } = await executeLedgerDeviceAction({
        action: signer.getWalletAddress(wallet, configuredPath.addressIndex, { change: configuredPath.change === 1 }),
        onDeviceActionState,
      });
      if (!address) {
        throw new SwapKitError("wallet_ledger_get_address_error", { path: configuredPath.fullPath });
      }
      return address;
    },
    getExtendedPublicKey: async ({
      checkOnDevice = false,
      path = configuredPath.accountPath,
    }: GetExtendedPublicKeyParams = {}) => {
      if (legacyClient) return legacyClient.getExtendedPublicKey(path);
      const signer = await getSigner();
      const normalizedPath = normalizePath(path);
      const { extendedPublicKey } = await executeLedgerDeviceAction({
        action: signer.getExtendedPublicKey(normalizedPath, { checkOnDevice }),
        onDeviceActionState,
      });
      return extendedPublicKey;
    },
    showAddressAndPubKey: async () => {
      if (legacyClient) {
        const address = await legacyClient.getAddress();
        return { address };
      }
      const signer = await getSigner();
      const wallet = await getWallet();
      return executeLedgerDeviceAction({
        action: signer.getWalletAddress(wallet, configuredPath.addressIndex, {
          change: configuredPath.change === 1,
          checkOnDevice: true,
        }),
        onDeviceActionState,
      });
    },
    signTransaction: async (tx: Transaction) => {
      const signedTransaction = await signTransactionHex({ tx });
      return restoreSignedPsbt({ purpose: configuredPath.purpose, rawTransaction: signedTransaction, tx });
    },
    signTransactionHex,
    signTransactionWithMultiplePaths: async ({
      derivationPaths,
      inputUtxos,
      tx,
    }: SignBitcoinTransactionWithMultiplePathsParams) => {
      if (inputUtxos) validateInputCount({ count: inputUtxos.length, tx });
      const paths = validateAccountPaths({ accountPath: configuredPath.accountPath, derivationPaths, tx });

      if (legacyClient) {
        const inputs = inputUtxos ?? (await extractInputsFromPsbt(tx, Chain.Bitcoin));
        return legacyClient.signTransactionWithMultiplePaths(
          tx,
          inputs,
          paths.map((path) => `m/${path.fullPath}`),
        );
      }

      return signWithPaths({ paths, tx });
    },
  };
}
