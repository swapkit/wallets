import {
  type AssetValue,
  Chain,
  type DerivationPathArray,
  derivationPathToString,
  FeeOption,
  filterSupportedChains,
  type GenericTransferParams,
  getRPCUrl,
  NetworkDerivationPath,
  SwapKitError,
  THORConfig,
  type UTXOChain,
  WalletOption,
} from "@swapkit-dev/helpers";
import type { ThorchainDepositParams } from "@swapkit-dev/toolboxes/cosmos";
import {
  addInputsAndOutputs,
  compileMemo,
  createHDWalletHelpers,
  getUtxoApi,
  type UTXOBuildTxParams,
  type UTXOForMultiAddressTransfer,
} from "@swapkit-dev/toolboxes/utxo";
import type { Transaction } from "@swapkit-dev/utxo-signer";
import { createWallet, getWalletSupportedChains } from "@swapkit-dev/wallet-core";
import { getLedgerAddress, getLedgerClient } from "./helpers";

export const ledgerWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectLedger(chains: Chain[], derivationPath?: DerivationPathArray) {
      const [chain] = filterSupportedChains({ chains, supportedChains, walletType });

      if (!chain) return false;

      const walletMethods = await getWalletMethods({ chain, derivationPath });

      addChain({ ...walletMethods, chain, walletType: WalletOption.LEDGER });

      return true;
    },
  name: "connectLedger",
  supportedChains: [
    Chain.Arbitrum,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.Berachain,
    Chain.BinanceSmartChain,
    Chain.Bitcoin,
    Chain.BitcoinCash,
    Chain.Cosmos,
    Chain.Dash,
    Chain.Dogecoin,
    Chain.Ethereum,
    Chain.Gnosis,
    Chain.Litecoin,
    Chain.Monad,
    Chain.Near,
    Chain.Optimism,
    Chain.Polygon,
    Chain.Ripple,
    Chain.Sui,
    Chain.THORChain,
    Chain.XLayer,
    Chain.Tron,
    Chain.Zcash,
  ],
  walletType: WalletOption.LEDGER,
});

export const LEDGER_SUPPORTED_CHAINS = getWalletSupportedChains(ledgerWallet);

// reduce memo length by removing trade limit
function reduceMemo(memo?: string, affiliateAddress = "t") {
  if (!memo?.includes("=:")) return memo;

  const removedAffiliate = memo.includes(`:${affiliateAddress}:`) ? memo.split(`:${affiliateAddress}:`)[0] : memo;

  return removedAffiliate?.substring(0, removedAffiliate.lastIndexOf(":"));
}

function recursivelyOrderKeys(unordered: any) {
  // If it's an array - recursively order any
  // dictionary items within the array
  if (Array.isArray(unordered)) {
    unordered.forEach((item, index) => {
      unordered[index] = recursivelyOrderKeys(item);
    });
    return unordered;
  }

  // If it's an object - let's order the keys
  if (typeof unordered !== "object") return unordered;
  const ordered: any = {};
  const sortedKeys = Object.keys(unordered).sort();

  for (const key of sortedKeys) {
    ordered[key] = recursivelyOrderKeys(unordered[key]);
  }

  return ordered;
}

function stringifyKeysInOrder(data: any) {
  return JSON.stringify(recursivelyOrderKeys(data));
}

async function getWalletMethods({ chain, derivationPath }: { chain: Chain; derivationPath?: DerivationPathArray }) {
  switch (chain) {
    case Chain.BitcoinCash:
    case Chain.Bitcoin:
    case Chain.Dash:
    case Chain.Dogecoin:
    case Chain.Litecoin:
    case Chain.Zcash: {
      const { getUtxoToolbox } = await import("@swapkit-dev/toolboxes/utxo");
      const utxoChain = chain as UTXOChain;
      const toolbox = getUtxoToolbox(utxoChain);

      const signer = await getLedgerClient({ chain, derivationPath });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });

      const transfer = async (params: UTXOBuildTxParams) => {
        const feeRate = params.feeRate || (await toolbox.getFeeRates())[FeeOption.Average];
        const memo = [Chain.Bitcoin].includes(chain as typeof Chain.Bitcoin) ? params.memo : reduceMemo(params.memo);

        const { tx, inputs } = await toolbox.createTransaction({
          ...params,
          feeRate,
          fetchTxHex: true,
          memo,
          sender: address,
        });

        // Cast tx to Transaction - signTransaction handles both Transaction and ZcashTransaction
        // via tx.unsignedTx which exists on both types
        const txHex = await signer.signTransaction(tx as Transaction, inputs);
        const txHash = await toolbox.broadcastTx(txHex);

        return txHash;
      };

      async function getExtendedPublicKey() {
        if (!signer.getExtendedPublicKey) return undefined;

        const xpub = await signer.getExtendedPublicKey();
        const accountPath = derivationPath?.slice(0, 3) ?? NetworkDerivationPath[chain].slice(0, 3);
        return { path: derivationPathToString(accountPath as DerivationPathArray), xpub };
      }

      async function deriveAddressAtIndex({ index, change = false }: { index: number; change?: boolean }) {
        try {
          const basePath = derivationPath?.slice(0, 3) ?? NetworkDerivationPath[chain].slice(0, 3);
          const fullPath = [...basePath, Number(change), index] as DerivationPathArray;

          const indexedSigner = await getLedgerClient({ chain: utxoChain, derivationPath: fullPath });
          const derivedAddress = await getLedgerAddress({ chain: utxoChain, ledgerClient: indexedSigner });

          return { address: derivedAddress, change, index, pubkey: "" };
        } catch {
          return undefined;
        }
      }

      const hdHelpers = createHDWalletHelpers({
        chain: utxoChain,
        deriveAddress: deriveAddressAtIndex,
        getBalance: toolbox.getBalance,
        getUtxos: (addr: string) => getUtxoApi(utxoChain).getUtxos({ address: addr, fetchTxHex: true }),
      });

      async function transferFromMultipleAddresses({
        utxos,
        recipient,
        assetValue,
        memo,
        feeRate,
        feeOptionKey,
        changeAddress,
      }: {
        utxos: UTXOForMultiAddressTransfer[];
        recipient: string;
        assetValue: AssetValue;
        memo?: string;
        feeRate?: number;
        feeOptionKey?: FeeOption;
        changeAddress?: string;
      }) {
        if (!utxos.length) {
          throw new SwapKitError("wallet_ledger_invalid_params", {
            message: "No UTXOs provided for multi-address transfer",
          });
        }

        const txFeeRate = feeRate || (await toolbox.getFeeRates())[feeOptionKey || FeeOption.Fast];
        const memoScript = memo ? compileMemo(memo) : null;

        const targetOutputs: Array<{ address: string; value: number } | { script: Uint8Array; value: number }> = [
          { address: recipient, value: assetValue.getBaseValue("number") },
        ];
        if (memoScript) {
          targetOutputs.push({ script: memoScript, value: 0 });
        }

        const basicUtxos = utxos.map(({ hash, index, value, txHex, witnessUtxo }) => ({
          hash,
          index,
          txHex,
          value,
          witnessUtxo,
        }));

        const { inputs: selectedInputs, outputs } = toolbox.accumulative({
          chain: utxoChain,
          feeRate: txFeeRate,
          inputs: basicUtxos,
          outputs: targetOutputs,
        });

        if (!(selectedInputs && outputs)) {
          throw new SwapKitError("wallet_ledger_connection_error", {
            message: "Insufficient balance for multi-address transfer",
          });
        }

        const { Transaction } = await import("@swapkit-dev/utxo-signer");
        const tx = new Transaction({ allowLegacyWitnessUtxo: true, version: 1 });
        const senderAddress = changeAddress || utxos[0]?.address || recipient;

        addInputsAndOutputs({
          chain: utxoChain,
          compiledMemo: memoScript,
          inputs: selectedInputs,
          outputs,
          sender: senderAddress,
          tx,
        });

        const basePath = derivationPath?.slice(0, 3) ?? NetworkDerivationPath[chain].slice(0, 3);
        const inputDerivationPaths = selectedInputs.map((input: { hash: string; index: number }) => {
          const utxoInfo = utxos.find((u) => u.hash === input.hash && u.index === input.index);
          const derivationIndex = utxoInfo?.derivationIndex ?? 0;
          const isChange = utxoInfo?.isChange ?? false;
          const fullPath = [...basePath, Number(isChange), derivationIndex] as DerivationPathArray;
          return derivationPathToString(fullPath);
        });

        if (!signer.signTransactionWithMultiplePaths) {
          throw new SwapKitError("wallet_ledger_method_not_supported", { method: "signTransactionWithMultiplePaths" });
        }

        const txHex = await signer.signTransactionWithMultiplePaths(tx, selectedInputs, inputDerivationPaths);
        return toolbox.broadcastTx(txHex);
      }

      return {
        ...toolbox,
        ...hdHelpers,
        address,
        deriveAddressAtIndex,
        getExtendedPublicKey,
        transfer,
        transferFromMultipleAddresses,
      };
    }

    case Chain.Ethereum:
    case Chain.Avalanche:
    case Chain.Arbitrum:
    case Chain.Berachain:
    case Chain.Optimism:
    case Chain.Polygon:
    case Chain.BinanceSmartChain:
    case Chain.Base:
    case Chain.Aurora:
    case Chain.Gnosis:
    case Chain.Monad:
    case Chain.XLayer: {
      const { getEvmToolboxAsync } = await import("@swapkit-dev/toolboxes/evm");
      const signer = await getLedgerClient({ chain, derivationPath });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });
      const toolbox = await getEvmToolboxAsync(chain, { signer });

      return { ...toolbox, address };
    }

    case Chain.Cosmos: {
      const { createSigningStargateClient, getMsgSendDenom, getCosmosToolbox } = await import(
        "@swapkit-dev/toolboxes/cosmos"
      );
      const toolbox = getCosmosToolbox(Chain.Cosmos);
      const signer = await getLedgerClient({ chain, derivationPath });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });

      const transfer = async ({ assetValue, recipient, memo }: GenericTransferParams) => {
        if (!assetValue) throw new SwapKitError("wallet_ledger_invalid_asset");

        const sendCoinsMessage = {
          amount: [
            {
              amount: assetValue.getBaseValue("string"),
              denom: getMsgSendDenom(`u${assetValue.symbol}`).toLowerCase(),
            },
          ],
          fromAddress: address,
          toAddress: recipient,
        };

        const rpcUrl = await getRPCUrl(chain);
        const signingClient = await createSigningStargateClient(rpcUrl, signer, "0.007uatom");

        const { transactionHash } = await signingClient.signAndBroadcast(
          address,
          [{ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: sendCoinsMessage }],
          2,
          memo,
        );

        return transactionHash;
      };

      return { ...toolbox, address, transfer };
    }

    case Chain.THORChain: {
      const { SignMode } = await import("cosmjs-types/cosmos/tx/signing/v1beta1/signing.js");
      const { TxRaw } = await import("cosmjs-types/cosmos/tx/v1beta1/tx.js");
      const importedSigning = await import("@cosmjs/proto-signing");
      const encodePubkey = importedSigning.encodePubkey ?? importedSigning.default?.encodePubkey;
      const makeAuthInfoBytes = importedSigning.makeAuthInfoBytes ?? importedSigning.default?.makeAuthInfoBytes;
      const {
        createStargateClient,
        buildEncodedTxBody,
        getCosmosToolbox,
        buildAminoMsg,
        getDefaultChainFee,
        fromBase64,
        parseAminoMessageForDirectSigning,
      } = await import("@swapkit-dev/toolboxes/cosmos");
      const toolbox = getCosmosToolbox(chain);
      const signer = await getLedgerClient({ chain, derivationPath });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });

      const fee = getDefaultChainFee(chain);
      const { pubkey: value, signTransaction, sign: signMessage } = signer;

      // ANCHOR (@Chillios): Same parts in methods + can extract StargateClient init to toolbox
      const thorchainTransfer = async ({
        memo = "",
        assetValue,
        ...rest
      }: GenericTransferParams | ThorchainDepositParams) => {
        const account = await toolbox.getAccount(address);
        if (!account) throw new SwapKitError("wallet_ledger_invalid_account");
        if (!assetValue) throw new SwapKitError("wallet_ledger_invalid_asset");
        if (!value) throw new SwapKitError("wallet_ledger_pubkey_not_found");

        const { accountNumber, sequence: sequenceNumber } = account;
        const sequence = (sequenceNumber || 0).toString();

        const orderedMessages = recursivelyOrderKeys([buildAminoMsg({ assetValue, memo, sender: address, ...rest })]);

        // get tx signing msg
        const rawSendTx = stringifyKeysInOrder({
          account_number: accountNumber?.toString(),
          chain_id: THORConfig.chainId,
          fee,
          memo,
          msgs: orderedMessages,
          sequence,
        });

        const signatures = await signTransaction(rawSendTx, sequence);
        if (!signatures) throw new SwapKitError("wallet_ledger_signing_error");

        const pubkey = encodePubkey({ type: "tendermint/PubKeySecp256k1", value });
        const msgs = orderedMessages.map(parseAminoMessageForDirectSigning);
        const bodyBytes = await buildEncodedTxBody({ chain, memo, msgs });

        const authInfoBytes = makeAuthInfoBytes(
          [{ pubkey, sequence: Number(sequence) }],
          fee.amount,
          Number.parseInt(fee.gas, 10),
          undefined,
          undefined,
          SignMode.SIGN_MODE_LEGACY_AMINO_JSON,
        );

        const signature = signatures?.[0]?.signature ? fromBase64(signatures[0].signature) : Uint8Array.from([]);

        const txRaw = TxRaw.fromPartial({ authInfoBytes, bodyBytes, signatures: [signature] });
        const txBytes = TxRaw.encode(txRaw).finish();
        const rpcUrl = await getRPCUrl(Chain.THORChain);

        const broadcaster = await createStargateClient(rpcUrl);
        const { transactionHash } = await broadcaster.broadcastTx(txBytes);

        return transactionHash;
      };

      const transfer = (params: GenericTransferParams) => thorchainTransfer(params);
      const deposit = (params: ThorchainDepositParams) => thorchainTransfer(params);

      return { ...toolbox, address, deposit, signMessage, transfer };
    }

    case Chain.Near: {
      const { getNearToolbox } = await import("@swapkit-dev/toolboxes/near");
      const signer = await getLedgerClient({ chain, derivationPath });
      const accountId = await signer.getAddress();
      const toolbox = getNearToolbox({ signer });

      return { ...toolbox, address: accountId };
    }

    case Chain.Ripple: {
      const { getRippleToolbox } = await import("@swapkit-dev/toolboxes/ripple");
      const signer = await getLedgerClient({ chain, derivationPath });
      const address = signer.getAddress();
      const toolbox = getRippleToolbox({ signer });

      return { ...toolbox, address };
    }

    case Chain.Tron: {
      const { getTronToolbox } = await import("@swapkit-dev/toolboxes/tron");
      const signer = await getLedgerClient({ chain, derivationPath });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });
      const toolbox = getTronToolbox({ signer });

      return { ...toolbox, address };
    }

    case Chain.Sui: {
      const { getSuiToolbox } = await import("@swapkit-dev/toolboxes/sui");
      const signer = await getLedgerClient({ chain, derivationPath });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });
      const toolbox = getSuiToolbox({ signer });

      return { ...toolbox, address };
    }

    default:
      throw new SwapKitError("wallet_ledger_chain_not_supported", { chain });
  }
}
