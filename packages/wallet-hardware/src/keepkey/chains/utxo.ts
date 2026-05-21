import type { KeepKeySdk } from "@keepkey/keepkey-sdk";
import { hex } from "@scure/base";
import {
  Chain,
  DerivationPath,
  type DerivationPathArray,
  derivationPathToString,
  FeeOption,
  type GenericTransferParams,
  SwapKitError,
  type UTXOChain,
} from "@swapkit/helpers";
import {
  assertDerivationIndex,
  createHDWalletHelpers,
  getNetworkForChain,
  getUTXOAccountIndexFromPath,
  getUTXOAccountPath,
  getUTXOAddressPath,
  getUtxoApi,
  stripToCashAddress,
  type UTXOToolboxes,
} from "@swapkit/toolboxes/utxo";
import type { Transaction } from "@swapkit/utxo-signer";
import { bip32ToAddressNList, ChainToKeepKeyName } from "../coins";

export interface KeepKeyInputObject {
  addressNList: number[];
  scriptType: string;
  amount: string;
  vout: number;
  txid: string;
  hex: string;
}

type KeepKeyUTXOWalletMethods = Record<string, unknown> & { address: string };

type Bip32Derivation = [Uint8Array, { fingerprint: number; path: number[] }];

function isBip32Derivation(value: unknown): value is Bip32Derivation {
  return (
    Array.isArray(value) &&
    value[0] instanceof Uint8Array &&
    typeof value[1] === "object" &&
    value[1] !== null &&
    Array.isArray((value[1] as { path?: unknown }).path)
  );
}

function getFirstBip32Derivation(input: { bip32Derivation?: unknown }) {
  if (!Array.isArray(input.bip32Derivation)) return undefined;

  const [derivation] = input.bip32Derivation;
  return isBip32Derivation(derivation) ? derivation : undefined;
}

function decodeOpReturnMemo(script: Uint8Array) {
  if (script.length < 2 || script[0] !== 0x6a) return undefined;

  let offset = 1;
  const pushOpcode = script[offset];
  if (pushOpcode === undefined) return undefined;

  let dataLength = pushOpcode;
  offset += 1;

  if (pushOpcode === 0x4c) {
    const length = script[offset];
    if (length === undefined) return undefined;
    dataLength = length;
    offset += 1;
  } else if (pushOpcode === 0x4d) {
    const first = script[offset];
    const second = script[offset + 1];
    if (first === undefined || second === undefined) return undefined;
    dataLength = first | (second << 8);
    offset += 2;
  } else if (pushOpcode === 0x4e) {
    const first = script[offset];
    const second = script[offset + 1];
    const third = script[offset + 2];
    const fourth = script[offset + 3];
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) return undefined;
    dataLength = first | (second << 8) | (third << 16) | (fourth << 24);
    offset += 4;
  } else if (pushOpcode > 0x4e) {
    return undefined;
  }

  if (dataLength < 0 || script.length < offset + dataLength) return undefined;

  return Buffer.from(script.slice(offset, offset + dataLength)).toString("utf8");
}

function getPrevoutAmount(input: {
  index?: number;
  nonWitnessUtxo?: { outputs?: Array<{ amount?: bigint | number }> };
  witnessUtxo?: { amount?: bigint | number };
}) {
  if (input.witnessUtxo?.amount !== undefined) return input.witnessUtxo.amount.toString();

  const prevout = input.index !== undefined ? input.nonWitnessUtxo?.outputs?.[input.index] : undefined;
  if (prevout?.amount !== undefined) return prevout.amount.toString();

  return undefined;
}

export function extractMemoFromKeepKeyUtxoTransaction(tx: Transaction, network: ReturnType<typeof getNetworkForChain>) {
  const memos: string[] = [];

  for (let index = 0; index < tx.outputsLength; index++) {
    const output = tx.getOutput(index);
    const outputAddress = tx.getOutputAddress(index, network);
    if (outputAddress) continue;

    const memo = output.script ? decodeOpReturnMemo(output.script) : undefined;
    if (memo !== undefined && (output.amount ?? 0n) === 0n) {
      memos.push(memo);
      continue;
    }

    throw new SwapKitError("wallet_keepkey_invalid_params", {
      outputIndex: index,
      reason: "Unable to decode UTXO output address",
    });
  }

  if (memos.length > 1) {
    throw new SwapKitError("wallet_keepkey_invalid_params", { reason: "Multiple OP_RETURN outputs are not supported" });
  }

  return memos[0] || "";
}

export async function extractKeepKeyInputsFromTransaction({
  chain,
  fallbackAddressNList,
  scriptType,
  tx,
}: {
  chain: Exclude<UTXOChain, typeof Chain.Zcash>;
  fallbackAddressNList: number[];
  scriptType: string;
  tx: Transaction;
}): Promise<KeepKeyInputObject[]> {
  const { RawTx } = await import("@swapkit/utxo-signer");
  const inputs: KeepKeyInputObject[] = [];

  for (let inputIndex = 0; inputIndex < tx.inputsLength; inputIndex++) {
    const input = tx.getInput(inputIndex);

    if (!input.txid || input.index === undefined) {
      throw new SwapKitError("wallet_keepkey_invalid_params", {
        inputIndex,
        reason: "PSBT input is missing txid/index",
      });
    }

    const txid = hex.encode(input.txid);
    const txHex = input.nonWitnessUtxo
      ? hex.encode(RawTx.encode(input.nonWitnessUtxo))
      : await getUtxoApi(chain).getRawTx(txid);
    const amount = getPrevoutAmount(input);

    if (!(txHex && amount)) {
      throw new SwapKitError("wallet_keepkey_invalid_params", {
        chain,
        inputIndex,
        reason: "Unable to resolve previous output info for KeepKey signing",
        txid,
      });
    }

    const derivation = getFirstBip32Derivation(input);

    inputs.push({
      addressNList: derivation?.[1].path || fallbackAddressNList,
      amount,
      hex: txHex,
      scriptType,
      txid,
      vout: input.index,
    });
  }

  return inputs;
}

function buildKeepKeyOutputsFromTransaction({
  chain,
  fallbackAddressNList,
  network,
  scriptType,
  tx,
  walletAddress,
}: {
  chain: Exclude<UTXOChain, typeof Chain.Zcash>;
  fallbackAddressNList: number[];
  network: ReturnType<typeof getNetworkForChain>;
  scriptType: string;
  tx: Transaction;
  walletAddress: string;
}) {
  const outputs: any[] = [];

  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    const address = tx.getOutputAddress(i, network);
    const value = Number(output.amount);

    if (!address) {
      const outputMemo = output.script ? decodeOpReturnMemo(output.script) : undefined;
      if (outputMemo !== undefined && (output.amount ?? 0n) === 0n) continue;

      throw new SwapKitError("wallet_keepkey_invalid_params", {
        outputIndex: i,
        reason: "Unable to decode UTXO output address",
      });
    }

    const outputDerivation = getFirstBip32Derivation(output);
    const changeAddressNList =
      outputDerivation?.[1].path || (address === walletAddress ? fallbackAddressNList : undefined);

    if (changeAddressNList) {
      outputs.push({
        addressNList: changeAddressNList,
        addressType: "change",
        amount: value,
        isChange: true,
        scriptType,
      });
      continue;
    }

    const outputAddress = chain === Chain.BitcoinCash ? stripToCashAddress(address) : address;
    if (outputAddress) {
      outputs.push({ address: outputAddress, addressType: "spend", amount: value });
    }
  }

  return outputs.filter((item) => item !== null && typeof item === "object" && Object.keys(item).length > 0);
}

export async function utxoWalletMethods({
  sdk,
  chain,
  derivationPath,
}: {
  sdk: KeepKeySdk;
  chain: Exclude<UTXOChain, typeof Chain.Zcash>;
  derivationPath?: DerivationPathArray;
}): Promise<KeepKeyUTXOWalletMethods> {
  const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
  // This might not work for BCH
  const toolbox = await getUtxoToolbox(chain);
  const scriptType = [Chain.Bitcoin, Chain.Litecoin].includes(chain as typeof Chain.Bitcoin)
    ? ("p2wpkh" as const)
    : ("p2pkh" as const);

  const derivationPathString = derivationPath ? derivationPathToString(derivationPath) : `${DerivationPath[chain]}/0`;

  const addressInfo = {
    address_n: bip32ToAddressNList(derivationPathString),
    coin: ChainToKeepKeyName[chain],
    script_type: scriptType,
  };

  const walletAddress: string = (await sdk.address.utxoGetAddress(addressInfo)).address;
  const network = getNetworkForChain(chain);

  const signTransaction = async (tx: Transaction, inputs: KeepKeyInputObject[], memo = "") => {
    const outputs = buildKeepKeyOutputsFromTransaction({
      chain,
      fallbackAddressNList: addressInfo.address_n,
      network,
      scriptType,
      tx,
      walletAddress,
    });

    const responseSign = await sdk.utxo.utxoSignTransaction({
      coin: ChainToKeepKeyName[chain],
      inputs,
      opReturnData: memo,
      outputs,
    });

    return responseSign.serializedTx?.toString();
  };

  const signAndBroadcastTransaction = async (tx: Transaction) => {
    const inputs = await extractKeepKeyInputsFromTransaction({
      chain,
      fallbackAddressNList: addressInfo.address_n,
      scriptType,
      tx,
    });
    const memo = extractMemoFromKeepKeyUtxoTransaction(tx, network);
    const txHex = await signTransaction(tx, inputs, memo);

    if (!txHex) {
      // TODO: Replace wallet-specific signing failures with generic wallet error keys.
      throw new SwapKitError("wallet_keepkey_invalid_params", {
        chain,
        reason: "KeepKey SDK did not return a serialized transaction",
      });
    }

    return toolbox.broadcastTx(txHex);
  };

  const transfer = async ({ recipient, feeOptionKey, feeRate, memo, ...rest }: GenericTransferParams) => {
    if (!walletAddress)
      throw new SwapKitError("wallet_keepkey_invalid_params", { reason: "From address must be provided" });
    if (!recipient)
      throw new SwapKitError("wallet_keepkey_invalid_params", { reason: "Recipient address must be provided" });

    const createTxMethod =
      chain === Chain.BitcoinCash
        ? (toolbox as UTXOToolboxes["BCH"]).buildTx
        : (toolbox as UTXOToolboxes["BTC"]).createTransaction;

    const { tx, inputs: rawInputs } = await createTxMethod({
      ...rest,
      feeRate: feeRate || (await toolbox.getFeeRates())[feeOptionKey || FeeOption.Fast],
      fetchTxHex: true,
      memo,
      recipient,
      sender: walletAddress,
    });

    const inputs = rawInputs.map(({ value, index, hash, txHex }) => ({
      //@TODO don't hardcode master, lookup on blockbook what input this is for and what path that address is!
      addressNList: addressInfo.address_n,
      amount: value.toString(),
      hex: txHex || "",
      scriptType,
      txid: hash,
      vout: index,
    }));

    const txHex = await signTransaction(tx, inputs, memo);
    return toolbox.broadcastTx(txHex);
  };

  const signTransactionWithMultipleInputs = async (
    tx: Transaction,
    inputs: Array<{
      hash: string;
      index: number;
      value: number;
      txHex?: string;
      derivationIndex: number;
      isChange: boolean;
    }>,
    memo = "",
  ) => {
    const accountAddressN = bip32ToAddressNList(
      derivationPath
        ? derivationPathToString(derivationPath.slice(0, 3) as DerivationPathArray)
        : DerivationPath[chain],
    );

    type KeepKeyOutput =
      | { addressNList: number[]; addressType: "change"; amount: number; isChange: true; scriptType: string }
      | { address: string; addressType: "spend"; amount: number };

    const outputs: KeepKeyOutput[] = [];
    for (let i = 0; i < tx.outputsLength; i++) {
      const output = tx.getOutput(i);
      const outputAddress = tx.getOutputAddress(i, network);
      const value = Number(output.amount);

      if (outputAddress === walletAddress) {
        outputs.push({
          addressNList: addressInfo.address_n,
          addressType: "change",
          amount: value,
          isChange: true,
          scriptType,
        });
      } else if (outputAddress) {
        const finalAddress = chain === Chain.BitcoinCash ? stripToCashAddress(outputAddress) : outputAddress;
        if (finalAddress) {
          outputs.push({ address: finalAddress, addressType: "spend", amount: value });
        }
      }
    }

    const keepKeyInputs = inputs.map(({ hash, index: inputIndex, value, txHex, derivationIndex, isChange }) => {
      const changePath = isChange ? 1 : 0;
      const inputAddressN = [...accountAddressN, changePath, derivationIndex];
      return {
        addressNList: inputAddressN,
        amount: value.toString(),
        hex: txHex || "",
        scriptType,
        txid: hash,
        vout: inputIndex,
      };
    });

    const responseSign = await sdk.utxo.utxoSignTransaction({
      coin: ChainToKeepKeyName[chain],
      inputs: keepKeyInputs,
      opReturnData: memo,
      outputs: outputs.filter((item) => item !== null && typeof item === "object" && Object.keys(item).length > 0),
    });

    return responseSign.serializedTx?.toString() || "";
  };

  const transferFromMultipleAddresses = async ({
    utxos,
    recipient,
    assetValue,
    memo,
    feeRate,
    feeOptionKey,
  }: {
    utxos: Array<{
      hash: string;
      index: number;
      value: number;
      txHex?: string;
      derivationIndex: number;
      isChange: boolean;
      address: string;
    }>;
    recipient: string;
    assetValue: { getBaseValue: (unit: string) => number; chain: string };
    memo?: string;
    feeRate?: number;
    feeOptionKey?: (typeof FeeOption)[keyof typeof FeeOption];
  }) => {
    const txFeeRate = feeRate || (await toolbox.getFeeRates())[feeOptionKey || FeeOption.Fast];

    const createTxMethod =
      chain === Chain.BitcoinCash
        ? (toolbox as UTXOToolboxes["BCH"]).buildTx
        : (toolbox as UTXOToolboxes["BTC"]).createTransaction;

    const { tx, inputs: selectedInputs } = await createTxMethod({
      assetValue: assetValue as any,
      feeRate: txFeeRate,
      fetchTxHex: true,
      memo,
      recipient,
      sender: walletAddress,
    });

    const inputsWithDerivation = selectedInputs.map(
      (input: { hash: string; index: number; value: number; txHex?: string }) => {
        const utxoInfo = utxos.find((u) => u.hash === input.hash && u.index === input.index);
        return { ...input, derivationIndex: utxoInfo?.derivationIndex ?? 0, isChange: utxoInfo?.isChange ?? false };
      },
    );

    const signedTxHex = await signTransactionWithMultipleInputs(tx, inputsWithDerivation, memo);
    return toolbox.broadcastTx(signedTxHex);
  };

  async function getExtendedPublicKeyInfo({ accountIndex }: { accountIndex?: number } = {}) {
    try {
      const resolvedAccountPath = getUTXOAccountPath({ accountIndex, chain, derivationPath });
      const resolvedAccountPathString = derivationPathToString(resolvedAccountPath);
      const path = {
        address_n: bip32ToAddressNList(resolvedAccountPathString),
        coin: ChainToKeepKeyName[chain],
        script_type: scriptType,
        showDisplay: false,
        symbol: chain.toUpperCase(),
      };

      const responsePubkey = await sdk.system.info.getPublicKey(path);

      return {
        accountIndex: getUTXOAccountIndexFromPath(resolvedAccountPath),
        path: resolvedAccountPathString,
        xpub: responsePubkey.xpub,
      };
    } catch (error) {
      throw new SwapKitError("wallet_keepkey_failed_to_get_public_key", {
        chain,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  function getExtendedPublicKey(params: { accountIndex?: number } = {}) {
    return getExtendedPublicKeyInfo(params);
  }

  async function deriveAddressAtIndex({
    accountIndex,
    index,
    change = false,
  }: {
    accountIndex?: number;
    index: number;
    change?: boolean;
  }) {
    try {
      assertDerivationIndex("index", index);
      const fullPath = getUTXOAddressPath({ accountIndex, chain, change, derivationPath, index });
      const fullPathString = derivationPathToString(fullPath);

      const result = await sdk.address.utxoGetAddress({
        address_n: bip32ToAddressNList(fullPathString),
        coin: ChainToKeepKeyName[chain],
        script_type: scriptType,
      });

      let finalAddress = result.address;
      if (chain === Chain.BitcoinCash) {
        finalAddress = stripToCashAddress(result.address);
      }

      return {
        accountIndex: getUTXOAccountIndexFromPath(fullPath),
        address: finalAddress,
        change,
        index,
        path: fullPathString,
        pubkey: "",
      };
    } catch {
      return undefined;
    }
  }

  async function deriveAddresses({
    accountIndex,
    count,
    startIndex = 0,
    change = false,
  }: {
    accountIndex?: number;
    count: number;
    startIndex?: number;
    change?: boolean;
  }) {
    assertDerivationIndex("count", count);
    assertDerivationIndex("startIndex", startIndex);

    const addresses = await Promise.all(
      Array.from({ length: count }, (_, i) => deriveAddressAtIndex({ accountIndex, change, index: startIndex + i })),
    );

    return addresses.filter((address) => !!address);
  }

  const hdHelpers = createHDWalletHelpers({
    chain,
    deriveAddress: deriveAddressAtIndex,
    getBalance: toolbox.getBalance,
    getUtxos: (address: string) => getUtxoApi(chain).getUtxos({ address, fetchTxHex: true }),
  });

  return {
    ...toolbox,
    ...hdHelpers,
    address: walletAddress,
    deriveAddressAtIndex,
    deriveAddresses,
    getExtendedPublicKey,
    getExtendedPublicKeyInfo,
    signAndBroadcastTransaction,
    signTransaction,
    signTransactionWithMultipleInputs,
    transfer,
    transferFromMultipleAddresses,
  };
}
