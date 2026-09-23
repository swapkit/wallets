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

import type { LedgerDMKSession } from "../helpers/dmk";
import { getLedgerDMKSession } from "../helpers/dmk";
import { executeLedgerDeviceAction, type LedgerDeviceActionStateHandler } from "../helpers/executeDeviceAction";
import { createCachedRawTxResolver } from "../helpers/rawTx";
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

// Mirrors the signer kit's `PartialSignature`, which its package entry point does not export.
interface PartialSignature {
  inputIndex: number;
  pubkey: Uint8Array;
  signature: Uint8Array;
  tapleafHash?: Uint8Array;
}

function isPartialSignature(signature: object): signature is PartialSignature {
  return "signature" in signature && "pubkey" in signature;
}

function signatureError({ inputIndex, reason }: { inputIndex?: number; reason: string }) {
  return new SwapKitError("wallet_ledger_invalid_response", { inputIndex, reason });
}

type PreviousTransaction = NonNullable<ReturnType<Transaction["getInput"]>["nonWitnessUtxo"]>;

// Returns the output an input spends, after checking the previous transaction hashes to the input's
// txid: amounts shown on the device come from it, so it must not be substitutable.
async function verifiedSpentOutput({
  input,
  inputIndex,
  previousTransaction,
}: {
  input: ReturnType<Transaction["getInput"]>;
  inputIndex: number;
  previousTransaction?: PreviousTransaction;
}) {
  if (!(previousTransaction && input.txid && input.index !== undefined)) {
    throw signatureError({ inputIndex, reason: "PSBT input is missing its previous output" });
  }

  const { RawTx, utils } = await import("@swapkit/utxo-signer");
  const previousTxid = utils.sha256x2(RawTx.encode(previousTransaction)).reverse();
  if (hex.encode(previousTxid) !== hex.encode(input.txid)) {
    throw new SwapKitError("wallet_ledger_invalid_params", {
      inputIndex,
      reason: "Previous transaction does not match the input txid",
    });
  }

  const spentOutput = previousTransaction.outputs[input.index];
  if (!spentOutput) throw signatureError({ inputIndex, reason: "Previous transaction has no spent output" });
  return spentOutput;
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
    if (!accountXpubPromise) {
      accountXpubPromise = getSigner().then(async (signer) => {
        const { extendedPublicKey } = await executeLedgerDeviceAction({
          action: signer.getExtendedPublicKey(configuredPath.accountPath),
          onDeviceActionState,
        });
        return extendedPublicKey;
      });
      const pendingXpub = accountXpubPromise;
      void pendingXpub.catch(() => {
        if (accountXpubPromise === pendingXpub) accountXpubPromise = undefined;
      });
    }
    return accountXpubPromise;
  }

  function getMasterFingerprint() {
    if (!fingerprintPromise) {
      fingerprintPromise = getSigner().then(async (signer) => {
        const { masterFingerprint } = await executeLedgerDeviceAction({
          action: signer.getMasterFingerprint(),
          onDeviceActionState,
        });
        return fingerprintToNumber(masterFingerprint);
      });
      const pendingFingerprint = fingerprintPromise;
      void pendingFingerprint.catch(() => {
        if (fingerprintPromise === pendingFingerprint) fingerprintPromise = undefined;
      });
    }
    return fingerprintPromise;
  }

  async function getWallet() {
    const [{ DefaultWallet }, template] = await Promise.all([
      import("@ledgerhq/device-signer-kit-bitcoin"),
      descriptorTemplate(configuredPath.purpose),
    ]);
    return new DefaultWallet(configuredPath.accountPath, template);
  }

  async function resolvePreviousTransactions({ inputUtxos, tx }: { inputUtxos?: UTXOType[]; tx: Transaction }) {
    const { RawTx } = await import("@swapkit/utxo-signer");
    const needsLookup = Array.from({ length: tx.inputsLength }, (_, index) => index).some(
      (index) => !(tx.getInput(index).nonWitnessUtxo || inputUtxos?.[index]?.txHex),
    );
    const getRawTx = needsLookup
      ? await import("@swapkit/toolboxes/utxo").then(({ getUtxoApi }) => {
          const utxoApi = getUtxoApi(Chain.Bitcoin);
          return createCachedRawTxResolver((txid) => utxoApi.getRawTx(txid));
        })
      : undefined;

    return Promise.all(
      Array.from({ length: tx.inputsLength }, async (_, inputIndex) => {
        const input = tx.getInput(inputIndex);
        if (input.nonWitnessUtxo) return input.nonWitnessUtxo;
        if (!input.txid) throw signatureError({ inputIndex, reason: "PSBT input is missing its previous txid" });

        const txHex = inputUtxos?.[inputIndex]?.txHex ?? (await getRawTx?.(hex.encode(input.txid)));
        if (!txHex) {
          throw new SwapKitError("wallet_ledger_invalid_params", {
            inputIndex,
            reason: "Unable to resolve the previous transaction for Ledger signing",
          });
        }
        return RawTx.decode(hex.decode(txHex));
      }),
    );
  }

  /**
   * Attach what the Bitcoin app needs to verify and sign each input: key origins, the full previous
   * transaction (input amounts are only verifiable from it) and, for SegWit v0, the spent output.
   * The previous transaction is checked against the input's txid so it cannot misstate the amount.
   */
  async function addInputDerivations({
    inputUtxos,
    paths,
    tx,
  }: {
    inputUtxos?: UTXOType[];
    paths: ParsedBitcoinPath[];
    tx: Transaction;
  }) {
    const [accountXpub, fingerprint, previousTransactions] = await Promise.all([
      getAccountXpub(),
      getMasterFingerprint(),
      resolvePreviousTransactions({ inputUtxos, tx }),
    ]);
    const { p2wpkh } = await import("@swapkit/utxo-signer");
    const accountKey = HDKey.fromExtendedKey(accountXpub);
    const psbt = tx.clone();
    const publicKeys: Uint8Array[] = [];

    for (const [inputIndex, path] of paths.entries()) {
      const publicKey = accountKey.derive(`m/${path.change}/${path.addressIndex}`).publicKey;
      if (!publicKey) {
        throw new SwapKitError("wallet_ledger_invalid_response", {
          inputIndex,
          reason: "Could not derive a public key from the Ledger account xpub",
        });
      }

      publicKeys[inputIndex] = publicKey;

      const input = psbt.getInput(inputIndex);
      const previousTransaction = previousTransactions[inputIndex];
      const spentOutput = await verifiedSpentOutput({ input, inputIndex, previousTransaction });

      const derivation = { fingerprint, path: pathToNumberArray(path.fullPath) };
      if (path.purpose === 86) {
        const xOnlyPublicKey = publicKey.slice(1);
        psbt.updateInput(inputIndex, {
          tapBip32Derivation: [[xOnlyPublicKey, { der: derivation, hashes: [] }]],
          tapInternalKey: xOnlyPublicKey,
          ...(input.witnessUtxo ? {} : { witnessUtxo: spentOutput }),
        });
      } else {
        psbt.updateInput(inputIndex, {
          bip32Derivation: [[publicKey, derivation]],
          nonWitnessUtxo: previousTransaction,
          ...(path.purpose === 44 || input.witnessUtxo ? {} : { witnessUtxo: spentOutput }),
          ...(path.purpose === 49 && !input.redeemScript ? { redeemScript: p2wpkh(publicKey).script } : {}),
        });
      }
    }

    return { psbt, publicKeys };
  }

  /**
   * Ask the device for signatures only and apply them to our own PSBT. The signer kit's own
   * transaction extraction writes the PSBT format version as the transaction version and drops
   * the witness of nested SegWit inputs, which invalidates the signatures.
   */
  async function signWithPaths({
    inputUtxos,
    paths,
    tx,
  }: {
    inputUtxos?: UTXOType[];
    paths: ParsedBitcoinPath[];
    tx: Transaction;
  }) {
    const [signer, wallet, { psbt, publicKeys }] = await Promise.all([
      getSigner(),
      getWallet(),
      addInputDerivations({ inputUtxos, paths, tx }),
    ]);
    const signatures = await executeLedgerDeviceAction({
      action: signer.signPsbt(wallet, psbt.toPSBT(0)),
      onDeviceActionState,
    });

    const signedInputs = new Set<number>();
    for (const signature of signatures) {
      if (!isPartialSignature(signature)) throw signatureError({ reason: "Unexpected MuSig2 signature" });

      const { inputIndex, pubkey } = signature;
      const path = paths[inputIndex];
      const publicKey = publicKeys[inputIndex];
      if (!(path && publicKey) || signedInputs.has(inputIndex)) {
        throw signatureError({ inputIndex, reason: "Unexpected or duplicate input signature" });
      }
      signedInputs.add(inputIndex);

      if (path.purpose === 86) {
        if (signature.tapleafHash) throw signatureError({ inputIndex, reason: "Unexpected taproot script signature" });
        psbt.updateInput(inputIndex, { tapKeySig: signature.signature });
        continue;
      }

      if (hex.encode(pubkey) !== hex.encode(publicKey)) {
        throw signatureError({ inputIndex, reason: "Signature public key does not match the input derivation" });
      }
      psbt.updateInput(inputIndex, { partialSig: [[publicKey, signature.signature]] });
    }

    if (signedInputs.size !== psbt.inputsLength) {
      throw signatureError({ reason: `Ledger signed ${signedInputs.size} of ${psbt.inputsLength} inputs` });
    }

    return psbt;
  }

  function finalizeToHex(psbt: Transaction) {
    psbt.finalize();
    return psbt.hex;
  }

  function signTransactionHex({ tx, inputUtxos }: SignBitcoinTransactionParams) {
    if (inputUtxos) validateInputCount({ count: inputUtxos.length, tx });

    if (legacyClient) {
      return inputUtxos
        ? legacyClient.signTransaction(tx, inputUtxos)
        : signLegacyPsbtTransaction({ chain: Chain.Bitcoin, legacyClient, tx });
    }

    const paths = Array.from({ length: tx.inputsLength }, () => configuredPath);
    return signWithPaths({ inputUtxos, paths, tx }).then(finalizeToHex);
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
      if (legacyClient) {
        // The legacy app returns a finalised transaction, as the other legacy UTXO chains do.
        const signedTxHex = await signLegacyPsbtTransaction({ chain: Chain.Bitcoin, legacyClient, tx });
        const { Transaction: TransactionClass } = await import("@swapkit/utxo-signer");
        return TransactionClass.fromRaw(hex.decode(signedTxHex), { allowUnknownOutputs: true });
      }
      const paths = Array.from({ length: tx.inputsLength }, () => configuredPath);
      return await signWithPaths({ paths, tx });
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

      return signWithPaths({ inputUtxos, paths, tx }).then(finalizeToHex);
    },
  };
}
