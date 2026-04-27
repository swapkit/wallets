import {
  Chain,
  type DerivationPathArray,
  derivationPathToString,
  FeeOption,
  filterSupportedChains,
  type GenericTransferParams,
  SKConfig,
  SwapKitError,
  type UTXOChain,
  WalletOption,
} from "@swapkit/helpers";
import {
  assertDerivationIndex,
  createHDWalletHelpers,
  getNetworkForChain,
  getUTXOAccountIndexFromPath,
  getUTXOAccountPath,
  getUtxoApi,
  type UTXOToolboxes,
  type UTXOType,
} from "@swapkit/toolboxes/utxo";
import type { BTCNetwork, PCZT, Transaction, ZcashTransaction } from "@swapkit/utxo-signer";
import { NETWORKS, ZcashConsensusBranchId, ZcashVersionGroupId } from "@swapkit/utxo-signer";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";

function decodeOpReturnData(script: Uint8Array): string | null {
  if (script.length < 2 || script[0] !== 0x6a) return null;
  const dataLen = script[1];
  if (dataLen === undefined || script.length < 2 + dataLen) return null;
  return Buffer.from(script.slice(2, 2 + dataLen)).toString("hex");
}

function getScriptType(derivationPath: DerivationPathArray) {
  switch (derivationPath[0]) {
    case 84:
      return { input: "SPENDWITNESS", output: "PAYTOWITNESS" } as const;
    case 49:
      return { input: "SPENDP2SHWITNESS", output: "PAYTOP2SHWITNESS" } as const;
    case 44:
      return { input: "SPENDADDRESS", output: "PAYTOADDRESS" } as const;
    default:
      return null;
  }
}

function hardenDerivationPath(derivationPath: DerivationPathArray): number[] {
  return derivationPath.map((pathElement, index) =>
    index < 3 ? ((pathElement as number) | 0x80000000) >>> 0 : (pathElement as number),
  );
}

function buildPCZTInputsForTrezor(
  pczt: PCZT,
  address_n: number[],
  hexEncode: { encode: (data: Uint8Array) => string },
) {
  const inputs = [];
  for (let i = 0; i < pczt.inputsLength; i++) {
    const input = pczt.getInput(i);
    inputs.push({
      address_n,
      amount: input.value.toString(),
      prev_hash: hexEncode.encode(new Uint8Array([...input.txid].reverse())),
      prev_index: input.index,
      script_type: "SPENDADDRESS" as const,
    });
  }
  return inputs;
}

async function buildPCZTOutputsForTrezor(pczt: PCZT, address_n: number[], myAddress: string, chain: Chain) {
  const outputs = [];
  for (let i = 0; i < pczt.outputsLength; i++) {
    const output = pczt.getOutput(i);
    const script = output.scriptPubkey;

    if (output.value === 0n && script?.length > 0 && script[0] === 0x6a) {
      const opReturnData = decodeOpReturnData(script);
      if (opReturnData) {
        outputs.push({ amount: "0", op_return_data: opReturnData, script_type: "PAYTOOPRETURN" as const });
        continue;
      }
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain, error: "Malformed OP_RETURN output cannot be signed" },
      });
    }

    const outputAddress = await decodeOutputAddress(script);

    if (!outputAddress && output.value > 0n) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain, error: "Unable to decode output address from scriptPubkey" },
      });
    }

    const isChangeAddress = outputAddress === myAddress;

    if (isChangeAddress) {
      outputs.push({ address_n, amount: output.value.toString(), script_type: "PAYTOADDRESS" as const });
    } else {
      outputs.push({ address: outputAddress, amount: output.value.toString(), script_type: "PAYTOADDRESS" as const });
    }
  }
  return outputs;
}

async function decodeOutputAddress(script: Uint8Array): Promise<string | undefined> {
  try {
    const { OutScript, Address } = await import("@swapkit/utxo-signer");
    const decoded = OutScript.decode(script);
    if (decoded.type === "pkh" || decoded.type === "pk") {
      return Address(NETWORKS.zcash).encode(decoded);
    }
  } catch {
    // ignore decode errors
  }
  return undefined;
}

async function extractSignaturesFromSignedTx(signedTxHex: string, pczt: PCZT): Promise<PCZT> {
  const { ZcashTransaction: ZcashTx, Script } = await import("@swapkit/utxo-signer");
  const signedTx = ZcashTx.fromHex(signedTxHex, { allowUnknownOutputs: true });
  const signedPczt = pczt.clone();

  for (let i = 0; i < signedTx.inputsLength; i++) {
    const signedInput = signedTx.getInput(i);
    const script = signedInput.script;
    if (script && script.length > 0) {
      const scriptParts = Script.decode(script);
      if (scriptParts.length >= 2) {
        signedPczt.addSignature(i, scriptParts[1] as Uint8Array, scriptParts[0] as Uint8Array);
      }
    }
  }
  return signedPczt;
}

function buildZcashTxInputsForTrezor(
  tx: ZcashTransaction,
  utxoInputs: UTXOType[],
  address_n: number[],
  hexEncode: { encode: (data: Uint8Array) => string },
) {
  const inputs = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    const utxoInfo = utxoInputs[i];
    inputs.push({
      address_n,
      amount: utxoInfo?.value?.toString() || "0",
      prev_hash: input.txid ? hexEncode.encode(new Uint8Array([...input.txid].reverse())) : "",
      prev_index: input.index ?? 0,
      script_type: "SPENDADDRESS" as const,
    });
  }
  return inputs;
}

function buildZcashTxOutputsForTrezor(tx: ZcashTransaction, address_n: number[], myAddress: string, chain: Chain) {
  const outputs = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    const outputAddress = tx.getOutputAddress(i, NETWORKS.zcash);
    const script = output.script;

    if (output.amount === 0n && script?.length > 0 && script[0] === 0x6a) {
      const opReturnData = decodeOpReturnData(script);
      if (opReturnData) {
        outputs.push({ amount: "0", op_return_data: opReturnData, script_type: "PAYTOOPRETURN" as const });
        continue;
      }
      continue;
    }

    if (!outputAddress && (output.amount ?? 0n) > 0n) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain, error: "Unable to decode output address" },
      });
    }

    const isChangeAddress = outputAddress === myAddress;
    const outputParam = isChangeAddress || !outputAddress ? { address_n } : { address: outputAddress };
    outputs.push({ ...outputParam, amount: output.amount?.toString() || "0", script_type: "PAYTOADDRESS" as const });
  }
  return outputs;
}

function buildUtxoOutputsForTrezor(
  tx: Transaction,
  network: BTCNetwork,
  address_n: number[],
  myAddress: string,
  memo: string,
  chain: Chain,
  scriptType: { input: string; output: string },
  toCashAddress: (addr: string) => string,
  stripPrefix: (addr: string) => string,
) {
  const outputs: any[] = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    const outputAddress = tx.getOutputAddress(i, network);

    if (!outputAddress) {
      outputs.push({ amount: "0", op_return_data: Buffer.from(memo).toString("hex"), script_type: "PAYTOOPRETURN" });
      continue;
    }

    const finalAddress = chain === Chain.BitcoinCash ? stripPrefix(toCashAddress(outputAddress)) : outputAddress;
    const isChangeAddress = finalAddress === myAddress;

    outputs.push(
      isChangeAddress
        ? { address_n, amount: Number(output.amount), script_type: scriptType.output }
        : { address: finalAddress, amount: Number(output.amount), script_type: "PAYTOADDRESS" },
    );
  }
  return outputs;
}

async function getTrezorWallet<T extends Chain>({
  chain,
  derivationPath,
}: {
  chain: T;
  derivationPath: DerivationPathArray;
}) {
  switch (chain) {
    case Chain.Arbitrum:
    case Chain.Aurora:
    case Chain.Avalanche:
    case Chain.Base:
    case Chain.Berachain:
    case Chain.BinanceSmartChain:
    case Chain.Ethereum:
    case Chain.Gnosis:
    case Chain.Monad:
    case Chain.Optimism:
    case Chain.Polygon:
    case Chain.XLayer: {
      const { getProvider, getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
      const { getEVMSigner } = await import("./evmSigner");

      const provider = await getProvider(chain);
      const signer = await getEVMSigner({ chain, derivationPath, provider });
      const address = await signer.getAddress();
      const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

      return { ...toolbox, address };
    }

    case Chain.Zcash: {
      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");

      const derivationPathStr = derivationPathToString(derivationPath);

      const getAddress = async () => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const { success, payload } = await TrezorConnect.getAddress({ coin: "zcash", path: derivationPathStr });

        if (!success) {
          throw new SwapKitError({
            errorKey: "wallet_trezor_failed_to_get_address",
            info: { chain, error: (payload as { error: string; code?: string }).error || "Unknown error" },
          });
        }

        return payload.address;
      };

      const address = await getAddress();

      const signer = {
        getAddress: async () => address,

        signPCZT: async (pczt: PCZT): Promise<PCZT> => {
          const TrezorConnect = (await import("@trezor/connect-web")).default;
          const { hex: hexEncode } = await import("@scure/base");
          const address_n = hardenDerivationPath(derivationPath);
          const global = pczt.getGlobal();

          const inputs = buildPCZTInputsForTrezor(pczt, address_n, hexEncode);
          const outputs = await buildPCZTOutputsForTrezor(pczt, address_n, address, chain);

          const result = await TrezorConnect.signTransaction({
            branchId: global.consensusBranchId,
            coin: "zcash",
            expiry: global.expiryHeight,
            inputs,
            locktime: global.lockTime,
            outputs: outputs as any,
            overwintered: true,
            version: global.txVersion,
            versionGroupId: global.versionGroupId,
          });

          if (!result.success) {
            throw new SwapKitError({
              errorKey: "wallet_trezor_failed_to_sign_transaction",
              info: { chain, error: (result.payload as { error: string; code?: string }).error },
            });
          }

          return extractSignaturesFromSignedTx(result.payload.serializedTx, pczt);
        },

        signTransaction: async (tx: ZcashTransaction, utxoInputs: UTXOType[]) => {
          const TrezorConnect = (await import("@trezor/connect-web")).default;
          const { hex: hexEncode } = await import("@scure/base");
          const address_n = hardenDerivationPath(derivationPath);

          const inputs = buildZcashTxInputsForTrezor(tx, utxoInputs, address_n, hexEncode);
          const outputs = buildZcashTxOutputsForTrezor(tx, address_n, address, chain);

          const result = await TrezorConnect.signTransaction({
            branchId: ZcashConsensusBranchId.NU6,
            coin: "zcash",
            expiry: 0,
            inputs,
            locktime: 0,
            outputs: outputs as any,
            overwintered: true,
            version: 4,
            versionGroupId: ZcashVersionGroupId.SAPLING,
          });

          if (result.success) {
            return result.payload.serializedTx;
          }

          throw new SwapKitError({
            errorKey: "wallet_trezor_failed_to_sign_transaction",
            info: { chain, error: (result.payload as { error: string; code?: string }).error },
          });
        },
      };

      const toolbox = getUtxoToolbox(Chain.Zcash);

      const transfer = async (params: GenericTransferParams) => {
        if (!(address && params.recipient)) {
          throw new SwapKitError({
            errorKey: "wallet_missing_params",
            info: { address, recipient: params.recipient, wallet: WalletOption.TREZOR },
          });
        }

        const feeRate = params.feeRate || (await toolbox.getFeeRates())[params.feeOptionKey || FeeOption.Fast];

        const { tx, inputs: txInputs } = await toolbox.createTransaction({
          ...params,
          feeRate,
          fetchTxHex: false,
          sender: address,
        });

        const txHex = await signer.signTransaction(tx, txInputs);
        const broadcastResult = await toolbox.broadcastTx(txHex);

        return broadcastResult;
      };

      const transferWithPCZT = async (params: GenericTransferParams) => {
        if (!(address && params.recipient)) {
          throw new SwapKitError({
            errorKey: "wallet_missing_params",
            info: { address, recipient: params.recipient, wallet: WalletOption.TREZOR },
          });
        }

        const { createPCZT, OutScript } = await import("@swapkit/utxo-signer");
        const { hex: hexEncode } = await import("@scure/base");
        const { getUtxoApi } = await import("@swapkit/toolboxes/utxo");

        const feeRate = params.feeRate || (await toolbox.getFeeRates())[params.feeOptionKey || FeeOption.Fast];

        const utxos = await getUtxoApi(Chain.Zcash).getUtxos({ address });

        const { tx, inputs: txInputs } = await toolbox.createTransaction({
          ...params,
          feeRate,
          fetchTxHex: false,
          sender: address,
        });

        const pczt = createPCZT();

        for (const utxoInput of txInputs) {
          const utxo = utxos.find((u) => u.hash === utxoInput.hash && u.index === utxoInput.index);
          const scriptPubkey = utxo?.witnessUtxo?.script
            ? new Uint8Array(utxo.witnessUtxo.script)
            : OutScript.encode({ hash: hexEncode.decode((utxoInput as any).address || ""), type: "pkh" });

          pczt.addInput({
            index: utxoInput.index,
            scriptPubkey,
            txid: hexEncode.decode(utxoInput.hash).reverse() as unknown as Uint8Array,
            value: BigInt(utxoInput.value),
          });
        }

        for (let i = 0; i < tx.outputsLength; i++) {
          const output = tx.getOutput(i);
          pczt.addOutput({ scriptPubkey: output.script || new Uint8Array(), value: output.amount || 0n });
        }

        const signedPczt = await signer.signPCZT(pczt);
        signedPczt.finalizeAllInputs();
        const finalTx = signedPczt.extract();
        const broadcastResult = await toolbox.broadcastTx(finalTx.toHex());

        return broadcastResult;
      };

      return {
        ...toolbox,
        address,
        signPCZT: signer.signPCZT,
        signTransaction: signer.signTransaction,
        transfer,
        transferWithPCZT,
      };
    }

    case Chain.Bitcoin:
    case Chain.BitcoinCash:
    case Chain.Dash:
    case Chain.Dogecoin:
    case Chain.Litecoin: {
      const { toCashAddress, getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const utxoChain = chain as UTXOChain;
      const scriptType = getScriptType(derivationPath);

      if (!scriptType) {
        throw new SwapKitError({ errorKey: "wallet_trezor_derivation_path_not_supported", info: { derivationPath } });
      }

      const coin = chain.toLowerCase();

      const getAddress = async (path: DerivationPathArray = derivationPath) => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const { success, payload } = await TrezorConnect.getAddress({ coin, path: derivationPathToString(path) });

        if (!success) {
          throw new SwapKitError({
            errorKey: "wallet_trezor_failed_to_get_address",
            info: { chain, error: (payload as { error: string; code?: string }).error || "Unknown error" },
          });
        }

        if (chain === Chain.BitcoinCash) {
          const toolbox = await getUtxoToolbox(chain as typeof Chain.BitcoinCash);
          return toolbox.stripPrefix(payload.address);
        }

        return payload.address;
      };

      const address = await getAddress();

      const signTransaction = async (tx: Transaction, inputs: UTXOType[], memo = "") => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const address_n = hardenDerivationPath(derivationPath);
        const toolbox = getUtxoToolbox(chain as typeof Chain.BitcoinCash);
        const network = getNetworkForChain(chain as UTXOChain);

        const outputs = buildUtxoOutputsForTrezor(
          tx,
          network,
          address_n,
          address,
          memo,
          chain,
          scriptType,
          toCashAddress,
          toolbox.stripPrefix,
        );

        const result = await TrezorConnect.signTransaction({
          coin,
          inputs: inputs.map(({ hash, index, value }) => ({
            address_n,
            amount: value,
            prev_hash: hash,
            prev_index: index,
            script_type: scriptType.input,
          })),
          outputs,
        });

        if (result.success) {
          return result.payload.serializedTx;
        }

        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_sign_transaction",
          info: { chain, error: (result.payload as { error: string; code?: string }).error },
        });
      };

      const signTransactionWithMultipleInputs = async (
        tx: Transaction,
        inputs: Array<{ hash: string; index: number; value: number; derivationIndex: number; isChange: boolean }>,
        memo = "",
      ) => {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const toolbox = await getUtxoToolbox(chain as typeof Chain.BitcoinCash);
        const network = getNetworkForChain(chain as UTXOChain);
        const baseAddressN = hardenDerivationPath(derivationPath.slice(0, 3) as DerivationPathArray);

        const outputs = buildUtxoOutputsForTrezor(
          tx,
          network,
          baseAddressN,
          address,
          memo,
          chain,
          scriptType,
          toCashAddress,
          toolbox.stripPrefix,
        );

        const trezorInputs = inputs.map(({ hash, index: inputIndex, value, derivationIndex, isChange }) => {
          const changePath = isChange ? 1 : 0;
          const inputAddressN = [...baseAddressN, changePath, derivationIndex];
          return {
            address_n: inputAddressN,
            amount: value,
            prev_hash: hash,
            prev_index: inputIndex,
            script_type: scriptType.input,
          };
        });

        const result = await TrezorConnect.signTransaction({ coin, inputs: trezorInputs, outputs });

        if (result.success) {
          return result.payload.serializedTx;
        }

        throw new SwapKitError({
          errorKey: "wallet_trezor_failed_to_sign_transaction",
          info: { chain, error: (result.payload as { error: string; code?: string }).error },
        });
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
        const toolbox = getUtxoToolbox(chain);
        const txFeeRate = feeRate || (await toolbox.getFeeRates())[feeOptionKey || FeeOption.Fast];

        const { tx, inputs: selectedInputs } = await toolbox.createTransaction({
          assetValue: assetValue as any,
          feeRate: txFeeRate,
          fetchTxHex: true,
          memo,
          recipient,
          sender: address,
        });

        const inputsWithDerivation = selectedInputs.map((input: { hash: string; index: number; value: number }) => {
          const utxoInfo = utxos.find((u) => u.hash === input.hash && u.index === input.index);
          return { ...input, derivationIndex: utxoInfo?.derivationIndex ?? 0, isChange: utxoInfo?.isChange ?? false };
        });

        const signedTxHex = await signTransactionWithMultipleInputs(tx as Transaction, inputsWithDerivation, memo);
        return toolbox.broadcastTx(signedTxHex);
      };

      const transfer = async ({
        recipient,
        feeOptionKey,
        feeRate: paramFeeRate,
        memo,
        ...rest
      }: GenericTransferParams) => {
        if (!(address && recipient)) {
          throw new SwapKitError({
            errorKey: "wallet_missing_params",
            info: { address, memo, recipient, wallet: WalletOption.TREZOR },
          });
        }

        const toolbox = getUtxoToolbox(chain);

        const feeRate = paramFeeRate || (await toolbox.getFeeRates())[feeOptionKey || FeeOption.Fast];

        const createTxMethod = (toolbox as UTXOToolboxes["BTC"]).createTransaction;

        const { tx, inputs } = await createTxMethod({
          ...rest,
          feeRate,
          fetchTxHex: true,
          memo,
          recipient,
          sender: address,
        });

        const signedTxHex = await signTransaction(tx, inputs, memo);
        const txHash = await toolbox.broadcastTx(signedTxHex);

        return txHash;
      };

      const toolbox = await getUtxoToolbox(chain);

      async function getExtendedPublicKeyInfo({ accountIndex }: { accountIndex?: number } = {}) {
        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const resolvedAccountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
        const path = derivationPathToString(resolvedAccountPath);
        const { success, payload } = await TrezorConnect.getPublicKey({ coin, path });

        if (!success) {
          throw new SwapKitError({
            errorKey: "wallet_trezor_failed_to_get_public_key",
            info: { chain, error: (payload as { error: string; code?: string }).error || "Unknown error" },
          });
        }

        return {
          accountIndex: getUTXOAccountIndexFromPath(resolvedAccountPath),
          chainCode: payload.chainCode,
          depth: payload.depth,
          fingerprint: payload.fingerprint,
          path: payload.serializedPath,
          publicKey: payload.publicKey,
          xpub: payload.xpub,
          xpubSegwit: payload.xpubSegwit,
        };
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
        assertDerivationIndex("index", index);

        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const resolvedAccountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
        const fullPath = `${derivationPathToString(resolvedAccountPath)}/${Number(change)}/${index}`;

        const { success, payload } = await TrezorConnect.getAddress({ coin, path: fullPath, showOnTrezor: false });

        if (!success) {
          return undefined;
        }

        let finalAddress = payload.address;
        if (chain === Chain.BitcoinCash) {
          const bchToolbox = await getUtxoToolbox(chain as typeof Chain.BitcoinCash);
          finalAddress = bchToolbox.stripPrefix(payload.address);
        }

        const pubKeyResult = await TrezorConnect.getPublicKey({ coin, path: fullPath });
        const pubkey = pubKeyResult.success ? pubKeyResult.payload.publicKey : "";

        return {
          accountIndex: getUTXOAccountIndexFromPath(resolvedAccountPath),
          address: finalAddress,
          change,
          index,
          path: fullPath,
          pubkey,
        };
      }

      async function deriveAddressesBatch({
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

        const TrezorConnect = (await import("@trezor/connect-web")).default;
        const resolvedAccountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
        const accountPath = derivationPathToString(resolvedAccountPath);

        const paths = Array.from({ length: count }, (_, i) => ({
          coin,
          path: `${accountPath}/${Number(change)}/${startIndex + i}`,
          showOnTrezor: false,
        }));

        const { success, payload } = await TrezorConnect.getAddress({ bundle: paths });

        if (!success || !Array.isArray(payload)) {
          return [];
        }

        const addresses = await Promise.all(
          payload.map(async (result, i) => {
            let finalAddress = result.address;
            if (chain === Chain.BitcoinCash) {
              const bchToolbox = await getUtxoToolbox(chain as typeof Chain.BitcoinCash);
              finalAddress = bchToolbox.stripPrefix(result.address);
            }

            return {
              accountIndex: getUTXOAccountIndexFromPath(resolvedAccountPath),
              address: finalAddress,
              change,
              index: startIndex + i,
              path: `${accountPath}/${Number(change)}/${startIndex + i}`,
              pubkey: "",
            };
          }),
        );

        return addresses;
      }

      const hdHelpers = createHDWalletHelpers({
        chain,
        deriveAddress: deriveAddressAtIndex,
        getBalance: toolbox.getBalance,
        getUtxos: (addr: string) => getUtxoApi(chain).getUtxos({ address: addr, fetchTxHex: true }),
      });

      return {
        ...toolbox,
        ...hdHelpers,
        address,
        deriveAddressAtIndex,
        deriveAddresses: deriveAddressesBatch,
        getExtendedPublicKey,
        getExtendedPublicKeyInfo,
        signTransaction,
        signTransactionWithMultipleInputs,
        transfer,
        transferFromMultipleAddresses,
      };
    }

    default:
      throw new SwapKitError({ errorKey: "wallet_chain_not_supported", info: { chain, wallet: WalletOption.TREZOR } });
  }
}

export const trezorWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectTrezor(chains: Chain[], derivationPath: DerivationPathArray) {
      const [chain] = filterSupportedChains({ chains, supportedChains, walletType });
      if (!chain) {
        throw new SwapKitError({
          errorKey: "wallet_chain_not_supported",
          info: { chain, wallet: WalletOption.TREZOR },
        });
      }

      const TrezorConnect = (await import("@trezor/connect-web")).default;
      const { success } = await TrezorConnect.getDeviceState();

      if (!success) {
        const trezorConfig = SKConfig.get("integrations").trezor;
        const manifest = trezorConfig
          ? { ...trezorConfig, appName: (trezorConfig as any).appName || "SwapKit" }
          : { appName: "SwapKit", appUrl: "", email: "" };
        TrezorConnect.init({ lazyLoad: true, manifest });
      }

      const wallet = await getTrezorWallet({ chain, derivationPath });

      addChain({ ...wallet, chain, walletType });

      return true;
    },
  directSigningSupport: {
    [Chain.Arbitrum]: true,
    [Chain.Aurora]: true,
    [Chain.Avalanche]: true,
    [Chain.Base]: true,
    [Chain.Berachain]: true,
    [Chain.BinanceSmartChain]: true,
    [Chain.Ethereum]: true,
    [Chain.Gnosis]: true,
    [Chain.Monad]: true,
    [Chain.Optimism]: true,
    [Chain.Polygon]: true,
    [Chain.XLayer]: true,
    // BTC/BCH/DASH/DOGE/LTC/ZEC: pending PSBT→TrezorConnect converter (V3 plan PR)
  },
  name: "connectTrezor",
  supportedChains: [
    Chain.Arbitrum,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.Berachain,
    Chain.BinanceSmartChain,
    Chain.Bitcoin,
    Chain.BitcoinCash,
    Chain.Dash,
    Chain.Dogecoin,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Litecoin,
    Chain.Monad,
    Chain.Optimism,
    Chain.Polygon,
    Chain.XLayer,
    Chain.Zcash,
  ],
  walletType: WalletOption.TREZOR,
});

export const TREZOR_SUPPORTED_CHAINS = getWalletSupportedChains(trezorWallet);
