import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
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
  type UTXOType,
} from "@swapkit/toolboxes/utxo";
import type { Transaction, ZcashTransaction } from "@swapkit/utxo-signer";
import { createWallet, getWalletSupportedChains, type HardwareExtendedPublicKeyInfo } from "@swapkit/wallet-core";
import { match, P } from "ts-pattern";
import {
  getLedgerAddress,
  getLedgerClient,
  type LedgerDeviceActionStateHandler,
  type LedgerDMKSession,
} from "./helpers";

type BitcoinLedgerClient = ReturnType<typeof import("./clients/bitcoin")["BitcoinLedger"]>;
type LegacyUTXOLedgerClient = ReturnType<typeof import("./clients/utxo")["BitcoinCashLedger"]>;
type ZcashLedgerClient = ReturnType<typeof import("./clients/zcash")["ZcashLedger"]>;
type UTXOLedgerClient = BitcoinLedgerClient | LegacyUTXOLedgerClient | ZcashLedgerClient;

/**
 * Options passed to `connectLedger` at call time.
 *
 * When `dmkSession` is omitted, the default browser WebHID flow discovers a
 * device and reuses one session across chains. Lazy-loaded apps can call
 * `preloadLedgerDMK` before the user gesture that starts connection.
 */
export interface ConnectLedgerOptions {
  address?: string;
  /** Caller-owned DMK session used by every supported chain. */
  dmkSession?: LedgerDMKSession;
  /** Receives DMK progress and device-interaction states. */
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  /** Ledger-provided token required for Transaction Checks. */
  originToken?: string;
  /** @deprecated Temporary non-EVM fallback. Cannot be combined with `dmkSession`. */
  transport?: Transport;
}

interface WalletMethodsParams<C extends Chain = Chain> extends ConnectLedgerOptions {
  chain: C;
  derivationPath?: DerivationPathArray;
}

interface LedgerAccountXpubParams {
  chain: UTXOChain;
  path: string;
  signer: UTXOLedgerClient;
  xpubVersion: number;
}

interface SignLedgerTransactionParams {
  inputUtxos?: UTXOType[];
  transaction: Transaction | ZcashTransaction;
}

const LEDGER_SUPPORTED_CHAINS_CONFIG = [
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
] as const;

type LedgerSupportedChain = (typeof LEDGER_SUPPORTED_CHAINS_CONFIG)[number];

const LEDGER_UTXO_CHAINS = [
  Chain.BitcoinCash,
  Chain.Bitcoin,
  Chain.Dash,
  Chain.Dogecoin,
  Chain.Litecoin,
  Chain.Zcash,
] as const satisfies readonly UTXOChain[];

const LEDGER_EVM_CHAINS = [
  Chain.Ethereum,
  Chain.Avalanche,
  Chain.Arbitrum,
  Chain.Berachain,
  Chain.Optimism,
  Chain.Polygon,
  Chain.BinanceSmartChain,
  Chain.Base,
  Chain.Aurora,
  Chain.Gnosis,
  Chain.Monad,
  Chain.XLayer,
] as const satisfies readonly LedgerSupportedChain[];

type LedgerEVMChain = (typeof LEDGER_EVM_CHAINS)[number];

function isLedgerSupportedChain(chain: Chain): chain is LedgerSupportedChain {
  return LEDGER_SUPPORTED_CHAINS_CONFIG.includes(chain as LedgerSupportedChain);
}

export const ledgerWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectLedger(
      chains: Chain[],
      derivationPath?: DerivationPathArray,
      { address, dmkSession, onDeviceActionState, originToken, transport }: ConnectLedgerOptions = {},
    ) {
      const [chain] = filterSupportedChains({ chains, supportedChains, walletType });

      if (!chain) return false;

      const resolvedPath = derivationPath ?? (NetworkDerivationPath[chain] as DerivationPathArray | undefined);
      const walletMethods = await getWalletMethods({
        address,
        chain,
        derivationPath: resolvedPath,
        dmkSession,
        onDeviceActionState,
        originToken,
        transport,
      });

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
    // ZEC transparent transfers use DSK, but route-level PCZT signing remains unsupported.
  },
  getExtendedPublicKey: getLedgerExtendedPublicKey,
  name: "connectLedger",
  supportedChains: [...LEDGER_SUPPORTED_CHAINS_CONFIG],
  walletType: WalletOption.LEDGER,
});

export const LEDGER_SUPPORTED_CHAINS = getWalletSupportedChains(ledgerWallet);

// reduce memo length by removing trade limit
function reduceMemo(memo?: string, affiliateAddress = "t") {
  if (!memo?.includes("=:")) return memo;

  const removedAffiliate = memo.includes(`:${affiliateAddress}:`) ? memo.split(`:${affiliateAddress}:`)[0] : memo;

  return removedAffiliate?.substring(0, removedAffiliate.lastIndexOf(":"));
}

function getLedgerAccountXpub({ chain, path, signer, xpubVersion }: LedgerAccountXpubParams) {
  const ledgerPath = match(chain)
    .with(Chain.Bitcoin, Chain.Litecoin, () => path)
    .with(Chain.BitcoinCash, Chain.Dash, Chain.Dogecoin, Chain.Zcash, () => path.replace(/^m\//, ""))
    .exhaustive();

  return match(chain)
    .with(Chain.Bitcoin, () => (signer as BitcoinLedgerClient).getExtendedPublicKey({ path: ledgerPath }))
    .with(Chain.Zcash, () => (signer as ZcashLedgerClient).getExtendedPublicKey({ path: ledgerPath, xpubVersion }))
    .with(Chain.BitcoinCash, Chain.Dash, Chain.Dogecoin, Chain.Litecoin, () =>
      (signer as LegacyUTXOLedgerClient).getExtendedPublicKey(ledgerPath, xpubVersion),
    )
    .exhaustive();
}

export async function getLedgerExtendedPublicKey(
  chain: Chain,
  derivationPath?: DerivationPathArray,
  {
    accountIndex,
    dmkSession,
    onDeviceActionState,
    transport,
  }: {
    accountIndex?: number;
    dmkSession?: LedgerDMKSession;
    onDeviceActionState?: LedgerDeviceActionStateHandler;
    transport?: Transport;
  } = {},
): Promise<HardwareExtendedPublicKeyInfo | undefined> {
  if (![Chain.BitcoinCash, Chain.Bitcoin, Chain.Dash, Chain.Dogecoin, Chain.Litecoin, Chain.Zcash].includes(chain)) {
    throw new SwapKitError("wallet_chain_not_supported", { chain, wallet: WalletOption.LEDGER });
  }

  const utxoChain = chain as UTXOChain;
  const signer = await getLedgerClient({
    chain: utxoChain,
    derivationPath,
    dmkSession,
    onDeviceActionState,
    transport,
  });
  if (!signer.getExtendedPublicKey) return undefined;

  const accountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
  const path = derivationPathToString(accountPath);
  const xpubVersion = getNetworkForChain(utxoChain).bip32.public;
  try {
    const xpub = await getLedgerAccountXpub({ chain: utxoChain, path, signer, xpubVersion });
    return { accountIndex: getUTXOAccountIndexFromPath(accountPath), path, xpub };
  } finally {
    await (signer as { disconnect?: () => Promise<void> }).disconnect?.();
  }
}

async function getUTXOWalletMethods({
  address: providedAddress,
  chain,
  dmkSession,
  derivationPath,
  onDeviceActionState,
  transport,
}: WalletMethodsParams<UTXOChain>) {
  const { getUtxoToolbox } = await import("@swapkit/toolboxes/utxo");
  const utxoChain = chain;

  const signer = await getLedgerClient({ chain, derivationPath, dmkSession, onDeviceActionState, transport });

  const address = providedAddress ?? (await getLedgerAddress({ chain, ledgerClient: signer }));

  const { signLedgerTransaction, toolboxSigner } = await match(chain)
    .with(Chain.Bitcoin, () => {
      const bitcoinSigner = signer as BitcoinLedgerClient;
      return {
        signLedgerTransaction: ({ inputUtxos, transaction }: SignLedgerTransactionParams) =>
          bitcoinSigner.signTransactionHex({ inputUtxos, tx: transaction as Transaction }),
        toolboxSigner: { getAddress: bitcoinSigner.getAddress, signTransaction: bitcoinSigner.signTransaction },
      };
    })
    .with(Chain.BitcoinCash, Chain.Dogecoin, Chain.Dash, Chain.Litecoin, async () => {
      const { createLegacyPsbtSigner, signLegacyPsbtTransaction } = await import("./clients/utxo-legacy-adapter");
      const legacySigner = signer as LegacyUTXOLedgerClient;
      return {
        signLedgerTransaction: ({ inputUtxos, transaction }: SignLedgerTransactionParams) =>
          signLegacyPsbtTransaction({
            chain: utxoChain,
            inputUtxos,
            legacyClient: legacySigner,
            tx: transaction as Transaction,
          }),
        toolboxSigner: createLegacyPsbtSigner({ address, chain: utxoChain, legacyClient: legacySigner }),
      };
    })
    .with(Chain.Zcash, () => {
      const zcashSigner = signer as ZcashLedgerClient;
      return {
        signLedgerTransaction: async ({ inputUtxos, transaction }: SignLedgerTransactionParams) => {
          if (!("consensusBranchId" in transaction)) {
            throw new SwapKitError("wallet_ledger_method_not_supported", {
              method: "signPCZT",
              wallet: WalletOption.LEDGER,
            });
          }

          const resolvedInputUtxos =
            inputUtxos ??
            (await Promise.all(
              Array.from({ length: transaction.inputsLength }, async (_, inputIndex) => {
                const input = transaction.getInput(inputIndex);
                const txid = hex.encode(input.txid);
                const txHex = await getUtxoApi(Chain.Zcash).getRawTx(txid);
                if (!txHex) {
                  throw new SwapKitError("wallet_ledger_invalid_params", {
                    inputIndex,
                    reason: "Unable to resolve previous transaction hex for Ledger signing",
                    txid,
                  });
                }

                return {
                  hash: txid,
                  index: input.index,
                  txHex,
                  value: Number(input.value),
                  witnessUtxo: input.script ? { script: input.script, value: Number(input.value) } : undefined,
                } as UTXOType;
              }),
            ));
          return zcashSigner.signTransaction({ inputUtxos: resolvedInputUtxos, tx: transaction });
        },
        toolboxSigner: undefined,
      };
    })
    .exhaustive();

  const toolbox = toolboxSigner
    ? await getUtxoToolbox(utxoChain, { signer: toolboxSigner })
    : getUtxoToolbox(utxoChain);
  const signAndBroadcastTransaction = async (transaction: Transaction | ZcashTransaction) =>
    toolbox.broadcastTx(await signLedgerTransaction({ transaction }));

  const transfer = async (params: UTXOBuildTxParams) => {
    const feeRate = params.feeRate || (await toolbox.getFeeRates())[FeeOption.Average];
    const memo = match(chain)
      .with(Chain.Bitcoin, () => params.memo)
      .with(Chain.BitcoinCash, Chain.Dash, Chain.Dogecoin, Chain.Litecoin, Chain.Zcash, () => reduceMemo(params.memo))
      .exhaustive();

    const { tx, inputs } = await toolbox.createTransaction({
      ...params,
      feeRate,
      fetchTxHex: true,
      memo,
      sender: address,
    });

    const txHex = await signLedgerTransaction({ inputUtxos: inputs, transaction: tx });
    const txHash = await toolbox.broadcastTx(txHex);

    return txHash;
  };

  async function getExtendedPublicKeyInfo({ accountIndex }: { accountIndex?: number } = {}) {
    if (!signer.getExtendedPublicKey) return undefined;

    const accountPath = getUTXOAccountPath({ accountIndex, chain: utxoChain, derivationPath });
    const path = derivationPathToString(accountPath);
    const xpubVersion = getNetworkForChain(utxoChain).bip32.public;
    const xpub = await getLedgerAccountXpub({ chain, path, signer, xpubVersion });

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

      const indexedSigner = await getLedgerClient({
        chain: utxoChain,
        derivationPath: fullPath,
        dmkSession,
        onDeviceActionState,
        transport,
      });
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
      Array.from({ length: count }, (_, i) => deriveAddressAtIndex({ accountIndex, change, index: startIndex + i })),
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
    if (chain === Chain.Zcash) {
      throw new SwapKitError("wallet_ledger_method_not_supported", {
        method: "transferFromMultipleAddresses",
        wallet: WalletOption.LEDGER,
      });
    }

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

    const txHex = await match(chain)
      .with(Chain.Bitcoin, () =>
        (signer as BitcoinLedgerClient).signTransactionWithMultiplePaths({
          derivationPaths: inputDerivationPaths,
          inputUtxos: selectedInputs,
          tx,
        }),
      )
      .with(Chain.BitcoinCash, Chain.Dash, Chain.Dogecoin, Chain.Litecoin, () =>
        (signer as LegacyUTXOLedgerClient).signTransactionWithMultiplePaths(tx, selectedInputs, inputDerivationPaths),
      )
      .exhaustive();
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

async function getEVMWalletMethods({
  chain,
  derivationPath,
  dmkSession,
  onDeviceActionState,
  originToken,
  transport,
}: WalletMethodsParams<LedgerEVMChain>) {
  const signer = await getLedgerClient({
    chain,
    derivationPath,
    dmkSession,
    onDeviceActionState,
    originToken,
    transport,
  });
  const { getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");
  const address = await getLedgerAddress({ chain, ledgerClient: signer });
  const toolbox = await getEvmToolboxAsync(chain, { signer });

  return { ...toolbox, address };
}

async function getCosmosWalletMethods({
  chain,
  derivationPath,
  dmkSession,
  onDeviceActionState,
  transport,
}: WalletMethodsParams<Chain.Cosmos>) {
  const { createSigningStargateClient, getMsgSendDenom, getCosmosToolbox } = await import("@swapkit/toolboxes/cosmos");
  const signer = await getLedgerClient({ chain, derivationPath, dmkSession, onDeviceActionState, transport });
  const address = await getLedgerAddress({ chain, ledgerClient: signer });
  const toolbox = await getCosmosToolbox(Chain.Cosmos, { signer });

  const transfer = async ({ assetValue, recipient, memo }: GenericTransferParams) => {
    if (!assetValue) throw new SwapKitError("wallet_ledger_invalid_asset");

    const sendCoinsMessage = {
      amount: [
        { amount: assetValue.getBaseValue("string"), denom: getMsgSendDenom(`u${assetValue.symbol}`).toLowerCase() },
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

async function getTHORChainWalletMethods({
  chain,
  derivationPath,
  dmkSession,
  onDeviceActionState,
  transport,
}: WalletMethodsParams<Chain.THORChain>) {
  const signer = await getLedgerClient({ chain, derivationPath, dmkSession, onDeviceActionState, transport });
  const { getCosmosToolbox } = await import("@swapkit/toolboxes/cosmos");
  const toolbox = getCosmosToolbox(chain, { signer });
  const address = await getLedgerAddress({ chain, ledgerClient: signer });
  const { sign: signMessage } = signer;

  return { ...toolbox, address, signMessage };
}

async function getNearWalletMethods({
  chain,
  derivationPath,
  dmkSession,
  onDeviceActionState,
  transport,
}: WalletMethodsParams<Chain.Near>) {
  const { getNearToolbox } = await import("@swapkit/toolboxes/near");
  const signer = await getLedgerClient({ chain, derivationPath, dmkSession, onDeviceActionState, transport });
  const accountId = await signer.getAddress();
  const toolbox = getNearToolbox({ signer });

  return { ...toolbox, address: accountId };
}

async function getRippleWalletMethods({
  chain,
  derivationPath,
  dmkSession,
  onDeviceActionState,
  transport,
}: WalletMethodsParams<Chain.Ripple>) {
  const { getRippleToolbox } = await import("@swapkit/toolboxes/ripple");
  const signer = await getLedgerClient({ chain, derivationPath, dmkSession, onDeviceActionState, transport });
  const address = signer.getAddress();
  const toolbox = getRippleToolbox({ signer });

  return { ...toolbox, address };
}

async function getTronWalletMethods({
  chain,
  derivationPath,
  dmkSession,
  onDeviceActionState,
  transport,
}: WalletMethodsParams<Chain.Tron>) {
  const { getTronToolbox } = await import("@swapkit/toolboxes/tron");
  const signer = await getLedgerClient({ chain, derivationPath, dmkSession, onDeviceActionState, transport });
  const address = await getLedgerAddress({ chain, ledgerClient: signer });
  const toolbox = getTronToolbox({ signer });

  return { ...toolbox, address };
}

async function getSuiWalletMethods({
  chain,
  derivationPath,
  dmkSession,
  onDeviceActionState,
  transport,
}: WalletMethodsParams<Chain.Sui>) {
  const { getSuiToolbox } = await import("@swapkit/toolboxes/sui");
  const signer = await getLedgerClient({ chain, derivationPath, dmkSession, onDeviceActionState, transport });
  const address = await getLedgerAddress({ chain, ledgerClient: signer });
  const toolbox = getSuiToolbox({ signer });

  return { ...toolbox, address };
}

function getWalletMethods(params: WalletMethodsParams) {
  if (!isLedgerSupportedChain(params.chain)) {
    throw new SwapKitError("wallet_ledger_chain_not_supported", { chain: params.chain });
  }

  return match(params.chain)
    .with(P.union(...LEDGER_UTXO_CHAINS), (chain) => getUTXOWalletMethods({ ...params, chain }))
    .with(P.union(...LEDGER_EVM_CHAINS), (chain) => getEVMWalletMethods({ ...params, chain }))
    .with(Chain.Cosmos, (chain) => getCosmosWalletMethods({ ...params, chain }))
    .with(Chain.THORChain, (chain) => getTHORChainWalletMethods({ ...params, chain }))
    .with(Chain.Near, (chain) => getNearWalletMethods({ ...params, chain }))
    .with(Chain.Ripple, (chain) => getRippleWalletMethods({ ...params, chain }))
    .with(Chain.Tron, (chain) => getTronWalletMethods({ ...params, chain }))
    .with(Chain.Sui, (chain) => getSuiWalletMethods({ ...params, chain }))
    .exhaustive();
}

export type { LedgerDeviceActionState, LedgerDeviceActionStateHandler, LedgerDMKSession } from "./helpers";
export { disconnectLedgerDMKSession, getLedgerDMKSession, preloadLedgerDMK } from "./helpers";
