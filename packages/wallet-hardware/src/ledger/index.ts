import type Transport from "@ledgerhq/hw-transport";
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
  type UTXOChain,
  WalletOption,
} from "@swapkit/helpers";
import {
  addInputsAndOutputs,
  assertDerivationIndex,
  compileMemo,
  createHDWalletHelpers,
  getNetworkForChain,
  getUTXOAccountIndexFromPath,
  getUTXOAccountPath,
  getUTXOAddressPath,
  getUtxoApi,
  type UTXOBuildTxParams,
  type UTXOForMultiAddressTransfer,
} from "@swapkit/toolboxes/utxo";
import type { Transaction } from "@swapkit/utxo-signer";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { getLedgerAddress, getLedgerClient } from "./helpers";

/**
 * Options passed to `connectLedger` at call time.
 *
 * When `transport` is supplied, the consumer opens and owns its lifecycle —
 * wallet-hardware will use that exact instance for every per-chain Ledger
 * client and will NOT recreate it on `forceReconnect`. When omitted, the
 * default browser flow (WebHID / WebUSB via `navigator.usb`) is used.
 */
export type ConnectLedgerOptions = { address?: string; transport?: Transport };

const ledgerWalletBase = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectLedger(
      chains: Chain[],
      derivationPath?: DerivationPathArray,
      { address, transport }: ConnectLedgerOptions = {},
    ) {
      const [chain] = filterSupportedChains({ chains, supportedChains, walletType });

      if (!chain) return false;

      const resolvedPath = derivationPath ?? (NetworkDerivationPath[chain] as DerivationPathArray | undefined);
      const walletMethods = await getWalletMethods({ address, chain, derivationPath: resolvedPath, transport });

      addChain({ ...walletMethods, chain, walletType: WalletOption.LEDGER });

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
    [Chain.Bitcoin]: true,
    [Chain.BitcoinCash]: true,
    [Chain.Cosmos]: true,
    [Chain.Dash]: true,
    [Chain.Dogecoin]: true,
    [Chain.Litecoin]: true,
    [Chain.Near]: true,
    [Chain.Optimism]: true,
    [Chain.Polygon]: true,
    [Chain.Ripple]: true,
    [Chain.Sui]: true,
    [Chain.THORChain]: true,
    [Chain.Tron]: true,
    [Chain.XLayer]: true,
    // ZEC: still on bespoke signPCZT path
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

const ledgerDiscoveryMethod = {
  connectWallet: () => getLedgerDiscovery,
  directSigningSupport: {},
  supportedChains: [Chain.BitcoinCash, Chain.Bitcoin, Chain.Dash, Chain.Dogecoin, Chain.Litecoin, Chain.Zcash],
};

export const ledgerWallet = { ...ledgerWalletBase, getLedgerDiscovery: ledgerDiscoveryMethod };

export const LEDGER_SUPPORTED_CHAINS = getWalletSupportedChains(ledgerWalletBase);

// reduce memo length by removing trade limit
function reduceMemo(memo?: string, affiliateAddress = "t") {
  if (!memo?.includes("=:")) return memo;

  const removedAffiliate = memo.includes(`:${affiliateAddress}:`) ? memo.split(`:${affiliateAddress}:`)[0] : memo;

  return removedAffiliate?.substring(0, removedAffiliate.lastIndexOf(":"));
}

export async function getLedgerDiscovery(
  chain: Chain,
  derivationPath?: DerivationPathArray,
  { transport }: ConnectLedgerOptions = {},
) {
  if (![Chain.BitcoinCash, Chain.Bitcoin, Chain.Dash, Chain.Dogecoin, Chain.Litecoin, Chain.Zcash].includes(chain)) {
    throw new SwapKitError("wallet_chain_not_supported", { chain, wallet: WalletOption.LEDGER });
  }

  const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
  const utxoChain = chain as UTXOChain;
  const signer = await getLedgerClient({ chain: utxoChain, derivationPath, transport });
  const toolbox = getUtxoToolbox(utxoChain);

  async function getExtendedPublicKeyInfo({ accountIndex }: { accountIndex?: number } = {}) {
    if (!signer.getExtendedPublicKey) return undefined;

    const accountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
    const path = derivationPathToString(accountPath);
    const ledgerPath = chain === Chain.Bitcoin || chain === Chain.Litecoin ? path : path.replace(/^m\//, "");
    const xpubVersion = getNetworkForChain(utxoChain).bip32.public;
    const xpub = await signer.getExtendedPublicKey(ledgerPath, xpubVersion);

    return { accountIndex: getUTXOAccountIndexFromPath(accountPath), path, xpub };
  }

  function getExtendedPublicKey(params: { accountIndex?: number } = {}) {
    return getExtendedPublicKeyInfo(params);
  }

  return { getBalance: toolbox.getBalance, getExtendedPublicKey, getExtendedPublicKeyInfo };
}

async function getWalletMethods({
  address: providedAddress,
  chain,
  derivationPath,
  transport,
}: ConnectLedgerOptions & { chain: Chain; derivationPath?: DerivationPathArray }) {
  switch (chain) {
    case Chain.BitcoinCash:
    case Chain.Bitcoin:
    case Chain.Dash:
    case Chain.Dogecoin:
    case Chain.Litecoin:
    case Chain.Zcash: {
      const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
      const utxoChain = chain as UTXOChain;

      const signer = await getLedgerClient({ chain, derivationPath, transport });

      const address = providedAddress ?? (await getLedgerAddress({ chain, ledgerClient: signer }));

      // V3 toolbox signer:
      //  - BTC uses the modern `ledger-bitcoin` AppClient with native PSBT signing.
      //  - LTC/BCH/DOGE/DASH use the legacy `hw-app-btc` adapter that pulls
      //    `nonWitnessUtxo` (full prev-tx hex) out of the API PSBT.
      //    The Litecoin Ledger app does not support the `ledger-bitcoin`
      //    policy APDUs and returns CLA_NOT_SUPPORTED.
      //  - ZEC stays on the bespoke `signPCZT` flow for now.
      let toolboxSigner:
        | { getAddress: () => Promise<string>; signTransaction: (tx: Transaction) => Promise<Transaction> }
        | undefined;
      let signAndBroadcastLegacyPsbtTransaction: ((tx: Transaction) => Promise<string>) | undefined;
      if (chain === Chain.Bitcoin) {
        const { BitcoinPsbtLedger } = await import("./clients/utxo-psbt");
        const psbtClient = BitcoinPsbtLedger(derivationPath, transport);
        toolboxSigner = { getAddress: psbtClient.getAddress, signTransaction: psbtClient.signTransaction };
      } else if (
        chain === Chain.BitcoinCash ||
        chain === Chain.Dogecoin ||
        chain === Chain.Dash ||
        chain === Chain.Litecoin
      ) {
        const { createLegacyPsbtSigner, signLegacyPsbtTransaction } = await import("./clients/utxo-legacy-adapter");
        toolboxSigner = createLegacyPsbtSigner({ address, chain: utxoChain, legacyClient: signer });
        signAndBroadcastLegacyPsbtTransaction = async (tx) => {
          const signedTxHex = await signLegacyPsbtTransaction({ chain: utxoChain, legacyClient: signer, tx });
          return toolbox.broadcastTx(signedTxHex);
        };
      }

      const toolbox = toolboxSigner
        ? await getUtxoToolbox(utxoChain, { signer: toolboxSigner })
        : getUtxoToolbox(utxoChain);
      const signAndBroadcastTransaction = signAndBroadcastLegacyPsbtTransaction ?? toolbox.signAndBroadcastTransaction;

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

        // Legacy Ledger UTXO signing returns finalized raw tx hex, so transfer
        // broadcasts directly instead of routing through toolbox finalization.
        const txHex = await signer.signTransaction(tx as Transaction, inputs);
        const txHash = await toolbox.broadcastTx(txHex);

        return txHash;
      };

      async function getExtendedPublicKeyInfo({ accountIndex }: { accountIndex?: number } = {}) {
        if (!signer.getExtendedPublicKey) return undefined;

        const accountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
        const path = derivationPathToString(accountPath);
        const ledgerPath = chain === Chain.Bitcoin || chain === Chain.Litecoin ? path : path.replace(/^m\//, "");
        const xpubVersion = getNetworkForChain(utxoChain).bip32.public;
        const xpub = await signer.getExtendedPublicKey(ledgerPath, xpubVersion);

        return { accountIndex: getUTXOAccountIndexFromPath(accountPath), path, xpub };
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
          const fullPath = getUTXOAddressPath({ accountIndex, chain: utxoChain, change, derivationPath, index });

          const indexedSigner = await getLedgerClient({ chain: utxoChain, derivationPath: fullPath, transport });
          const derivedAddress = await getLedgerAddress({ chain: utxoChain, ledgerClient: indexedSigner });

          return {
            accountIndex: getUTXOAccountIndexFromPath(fullPath),
            address: derivedAddress,
            change,
            index,
            path: derivationPathToString(fullPath),
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
          Array.from({ length: count }, (_, i) =>
            deriveAddressAtIndex({ accountIndex, change, index: startIndex + i }),
          ),
        );

        return addresses.filter((address) => !!address);
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

        const { Transaction } = await import("@swapkit/utxo-signer");
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

        const basePath = getUTXOAccountPath({ chain: utxoChain, derivationPath });
        const inputDerivationPaths = selectedInputs.map((input: { hash: string; index: number }) => {
          const utxoInfo = utxos.find((u) => u.hash === input.hash && u.index === input.index);
          const derivationIndex = utxoInfo?.derivationIndex ?? 0;
          const isChange = utxoInfo?.isChange ?? false;
          const fullPath = [...basePath, Number(isChange), derivationIndex] as unknown as DerivationPathArray;
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
        deriveAddresses,
        getExtendedPublicKey,
        getExtendedPublicKeyInfo,
        signAndBroadcastTransaction,
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
      const { getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
      const signer = await getLedgerClient({ chain, derivationPath, transport });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });
      const toolbox = await getEvmToolboxAsync(chain, { signer });

      return { ...toolbox, address };
    }

    case Chain.Cosmos: {
      const { createSigningStargateClient, getMsgSendDenom, getCosmosToolbox } = await import(
        "@swapkit/toolboxes/cosmos"
      );
      const signer = await getLedgerClient({ chain, derivationPath, transport });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });
      const toolbox = await getCosmosToolbox(Chain.Cosmos, { signer });

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
      const signer = await getLedgerClient({ chain, derivationPath, transport });
      const { getCosmosToolbox } = await import("@swapkit/toolboxes/cosmos");
      const toolbox = getCosmosToolbox(chain, { signer });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });
      const { sign: signMessage } = signer;

      return { ...toolbox, address, signMessage };
    }

    case Chain.Near: {
      const { getNearToolbox } = await import("@swapkit/toolboxes/near");
      const signer = await getLedgerClient({ chain, derivationPath, transport });
      const accountId = await signer.getAddress();
      const toolbox = getNearToolbox({ signer });

      return { ...toolbox, address: accountId };
    }

    case Chain.Ripple: {
      const { getRippleToolbox } = await import("@swapkit/toolboxes/ripple");
      const signer = await getLedgerClient({ chain, derivationPath, transport });
      const address = signer.getAddress();
      const toolbox = getRippleToolbox({ signer });

      return { ...toolbox, address };
    }

    case Chain.Tron: {
      const { getTronToolbox } = await import("@swapkit/toolboxes/tron");
      const signer = await getLedgerClient({ chain, derivationPath, transport });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });
      const toolbox = getTronToolbox({ signer });

      return { ...toolbox, address };
    }

    case Chain.Sui: {
      const { getSuiToolbox } = await import("@swapkit/toolboxes/sui");
      const signer = await getLedgerClient({ chain, derivationPath, transport });
      const address = await getLedgerAddress({ chain, ledgerClient: signer });
      const toolbox = getSuiToolbox({ signer });

      return { ...toolbox, address };
    }

    default:
      throw new SwapKitError("wallet_ledger_chain_not_supported", { chain });
  }
}
