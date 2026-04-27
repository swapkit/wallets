import type { KeepKeySdk } from "@keepkey/keepkey-sdk";
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

interface KeepKeyInputObject {
  addressNList: number[];
  scriptType: string;
  amount: string;
  vout: number;
  txid: string;
  hex: string;
}

type KeepKeyUTXOWalletMethods = Record<string, unknown> & { address: string };

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
    const outputs: any[] = [];

    for (let i = 0; i < tx.outputsLength; i++) {
      const output = tx.getOutput(i);
      const address = tx.getOutputAddress(i, network);
      const value = Number(output.amount);

      if (address === walletAddress) {
        outputs.push({
          addressNList: addressInfo.address_n,
          addressType: "change",
          amount: value,
          isChange: true,
          scriptType,
        });
      } else if (address) {
        const outputAddress = chain === Chain.BitcoinCash ? stripToCashAddress(address) : address;

        if (outputAddress) {
          outputs.push({ address: outputAddress, addressType: "spend", amount: value });
        }
      }
    }

    const removeNullAndEmptyObjectsFromArray = (arr: any[]) => {
      return arr.filter((item) => item !== null && typeof item === "object" && Object.keys(item).length > 0);
    };

    const responseSign = await sdk.utxo.utxoSignTransaction({
      coin: ChainToKeepKeyName[chain],
      inputs,
      opReturnData: memo,
      outputs: removeNullAndEmptyObjectsFromArray(outputs),
    });

    return responseSign.serializedTx?.toString();
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

  function getExtendedPublicKey() {
    return getExtendedPublicKeyInfo();
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
    signTransaction,
    signTransactionWithMultipleInputs,
    transfer,
    transferFromMultipleAddresses,
  };
}
