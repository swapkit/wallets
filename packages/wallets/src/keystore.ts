import {
  type AssetValue,
  Chain,
  CosmosChains,
  type DerivationPathArray,
  type EVMChain,
  EVMChains,
  filterSupportedChains,
  SwapKitError,
  type UTXOChain,
  UTXOChains,
  type UTXOScriptType,
  WalletOption,
} from "@swapkit/helpers";
import type { DerivedAddress, ExtendedPublicKeyResult, FullWallet, HDWalletAccountParams } from "@swapkit/toolboxes";
import { type ChainSigningSupport, createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";

export {
  decryptFromKeystore,
  encryptToKeyStore,
  generateKeystore,
  generatePhrase,
  type Keystore,
  type PhraseWordCount,
  validatePhrase,
} from "./keystore-helpers";

export type KeystoreUTXOChainDerivation = { derivationPath: DerivationPathArray; scriptType: UTXOScriptType };
export type KeystoreChainDerivation =
  | DerivationPathArray
  | { derivationPath: DerivationPathArray }
  | KeystoreUTXOChainDerivation;

export type KeystoreDerivationPathMap = {
  [C in Chain]?: C extends UTXOChain
    ? KeystoreUTXOChainDerivation
    : DerivationPathArray | { derivationPath: DerivationPathArray };
};
export type KeystoreDerivationPathMapOrIndex = KeystoreDerivationPathMap | number;

function readChainDerivation<C extends Chain>(chain: C, entry: KeystoreChainDerivation | undefined) {
  // Only an absent entry means the default path; 0, "", false and null are mistakes.
  if (entry === undefined) return { chain, derivationPath: undefined, scriptType: undefined };

  const isUTXO = UTXOChains.includes(chain as UTXOChain);
  // `in` on a primitive or null throws a TypeError that names no chain.
  const isObjectEntry = typeof entry === "object" && entry !== null;
  const derivationPath = isObjectEntry && "derivationPath" in entry ? entry.derivationPath : entry;
  const scriptType = isObjectEntry && "scriptType" in entry ? entry.scriptType : undefined;

  if (!Array.isArray(derivationPath)) {
    throw isUTXO
      ? new SwapKitError("toolbox_utxo_invalid_params", {
          chain,
          entry,
          error: `${chain}: a UTXO derivation entry must state its path as an array: { derivationPath, scriptType }.`,
        })
      : new SwapKitError("wallet_missing_params", {
          chain,
          entry,
          error: `${chain}: a derivation entry must be a path array or { derivationPath: number[] }.`,
          param: "derivationPath",
          wallet: WalletOption.KEYSTORE,
        });
  }

  if (isUTXO && !scriptType) {
    throw new SwapKitError("toolbox_utxo_invalid_params", {
      chain,
      error:
        `${chain}: a UTXO derivation entry must state its scriptType: { derivationPath, scriptType }. ` +
        "getUTXOScriptTypeForPath(derivationPath) gives the encoding the path implies.",
    });
  }

  return { chain, derivationPath, scriptType: isUTXO ? scriptType : undefined };
}

type UTXOToolboxWithHD = {
  deriveAddressAtIndex: (
    params: HDWalletAccountParams & { index: number; change?: boolean },
  ) => DerivedAddress | undefined;
  getExtendedPublicKey: () => string | undefined;
  getExtendedPublicKeyInfo?: (params?: HDWalletAccountParams) => ExtendedPublicKeyResult | undefined;
  getBalance: (address: string) => Promise<AssetValue[]>;
  resolveDerivationIndex?: (params: {
    address: string;
    gapLimit?: number;
  }) => { index: number; change: boolean } | undefined;
  transferFromMultipleAddresses?: (params: {
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
    assetValue: AssetValue;
    memo?: string;
    feeRate?: number;
  }) => Promise<string>;
};

function isUTXOToolboxWithHD(toolbox: unknown): toolbox is UTXOToolboxWithHD {
  return (
    typeof toolbox === "object" &&
    toolbox !== null &&
    "deriveAddressAtIndex" in toolbox &&
    typeof (toolbox as UTXOToolboxWithHD).deriveAddressAtIndex === "function" &&
    "getExtendedPublicKey" in toolbox &&
    typeof (toolbox as UTXOToolboxWithHD).getExtendedPublicKey === "function" &&
    "getBalance" in toolbox &&
    typeof (toolbox as UTXOToolboxWithHD).getBalance === "function"
  );
}

async function createHDWalletMethods(chain: UTXOChain, toolbox: UTXOToolboxWithHD) {
  const { createHDWalletHelpers, getUtxoApi } = await import("@swapkit/toolboxes/utxo");

  function deriveAddresses(params: HDWalletAccountParams & { count: number; startIndex?: number; change?: boolean }) {
    const { accountIndex, count, startIndex = 0, change = false } = params;
    if (count < 1 || count > 1000) throw new RangeError(`count must be between 1 and 1000, got ${count}`);
    if (startIndex < 0) throw new RangeError(`startIndex must be non-negative, got ${startIndex}`);

    const addresses: DerivedAddress[] = [];
    for (let i = 0; i < count; i++) {
      const derived = toolbox.deriveAddressAtIndex({ accountIndex, change, index: startIndex + i });
      if (derived) addresses.push(derived);
    }
    return addresses;
  }

  const { scanForAddresses, getAggregatedBalance, getAggregatedUtxos } = createHDWalletHelpers({
    chain,
    deriveAddress: (params) => toolbox.deriveAddressAtIndex(params),
    getBalance: toolbox.getBalance,
    getUtxos: (address: string) => getUtxoApi(chain).getUtxos({ address, fetchTxHex: true }),
  });

  return { deriveAddresses, getAggregatedBalance, getAggregatedUtxos, scanForAddresses };
}

const keystoreSupportedChains = [
  ...EVMChains,
  ...UTXOChains,
  ...CosmosChains.filter((chain) => chain !== Chain.Harbor),
  Chain.Aleo,
  Chain.Aptos,
  Chain.Cardano,
  Chain.Ripple,
  Chain.Solana,
  Chain.Stellar,
  Chain.Sui,
  Chain.Ton,
  Chain.Tron,
  Chain.Near,
  Chain.Hype,
  Chain.Quantus,
] as const;

const keystoreMessageChains: readonly Chain[] = [
  Chain.Bitcoin,
  Chain.BitcoinCash,
  Chain.Dash,
  Chain.Dogecoin,
  Chain.Litecoin,
  Chain.Solana,
  Chain.Tron,
];

const keystoreSigningSupport: ChainSigningSupport = Object.fromEntries(
  keystoreSupportedChains.map((chain) => [
    chain,
    {
      direct: true,
      ...(EVMChains.includes(chain as EVMChain) && { typedData: true }),
      ...(keystoreMessageChains.includes(chain) && { message: true }),
    },
  ]),
);

// A declared message capability holds only when the connected toolbox can sign, e.g. not for a Taproot key.
function getConnectedSigning({ chain, signMessage }: { chain: Chain; signMessage?: unknown }) {
  const { message, ...signing } = keystoreSigningSupport[chain] ?? {};
  return typeof signMessage === "function" && message ? { ...signing, message } : signing;
}

export const keystoreWallet = createWallet({
  connect: ({ addChain }) =>
    async function connectKeystore(
      chains: Chain[],
      phrase: string,
      derivationPathMapOrIndex?: KeystoreDerivationPathMapOrIndex,
    ) {
      const wallets = await createKeystoreWallet({ chains, derivationPathMapOrIndex, phrase });

      for (const wallet of Object.values(wallets)) {
        addChain({
          ...wallet,
          chain: wallet.chain,
          signing: getConnectedSigning(wallet),
          walletType: WalletOption.KEYSTORE,
        });
      }

      return true;
    },
  name: "connectKeystore",
  signingSupport: keystoreSigningSupport,
  supportedChains: [...keystoreSupportedChains],
  walletType: WalletOption.KEYSTORE,
});

export const KEYSTORE_SUPPORTED_CHAINS = getWalletSupportedChains(keystoreWallet);

export async function createKeystoreWallet<T extends Chain[]>({
  chains,
  phrase,
  derivationPathMapOrIndex,
}: {
  chains: T;
  phrase: string;
  derivationPathMapOrIndex?: KeystoreDerivationPathMapOrIndex;
}) {
  if (typeof phrase !== "string" || !phrase.trim()) {
    throw new SwapKitError("wallet_missing_params", { param: "phrase", wallet: WalletOption.KEYSTORE });
  }

  const supportedChains = filterSupportedChains({
    chains,
    supportedChains: KEYSTORE_SUPPORTED_CHAINS,
    walletType: WalletOption.KEYSTORE,
  });

  const walletIndex =
    derivationPathMapOrIndex === undefined || typeof derivationPathMapOrIndex === "object"
      ? 0
      : derivationPathMapOrIndex;

  // Chains disagree on a NaN, negative or fractional index: some derive an address no other wallet
  // reproduces, others read NaN as wallet 0.
  if (!Number.isSafeInteger(walletIndex) || walletIndex < 0) {
    throw new SwapKitError("wallet_missing_params", {
      error: "derivationPathMapOrIndex must be a non-negative integer wallet index or a derivation path map.",
      param: "derivationPathMapOrIndex",
      value: String(derivationPathMapOrIndex),
      wallet: WalletOption.KEYSTORE,
    });
  }

  const derivationMap =
    derivationPathMapOrIndex && typeof derivationPathMapOrIndex === "object" ? derivationPathMapOrIndex : undefined;
  // Only a connect with a UTXO chain loads the UTXO toolbox, which that chain needs anyway.
  const utxo = supportedChains.some((chain) => UTXOChains.includes(chain as UTXOChain))
    ? await import("@swapkit/toolboxes/utxo")
    : undefined;

  // Configuration errors recur on every connect, so they fail the whole connect in chain order before
  // anything connects; a chain that fails later for an environmental reason is skipped and logged.
  const derivations = supportedChains.map((chain) => {
    const derivation = readChainDerivation(chain, derivationMap?.[chain] as KeystoreChainDerivation | undefined);
    if (derivation.scriptType) utxo?.assertScriptTypeSupported(chain as UTXOChain, derivation.scriptType);
    return derivation;
  });

  const walletResults = await Promise.allSettled(
    derivations.map(async ({ chain, derivationPath, scriptType }) => {
      const { getToolbox } = await import("@swapkit/toolboxes");

      // Toolboxes must never receive path and index together; without a path each derives its own default.
      const toolboxParams = derivationPath
        ? { derivationPath, phrase, ...(scriptType ? { scriptType } : {}) }
        : { index: walletIndex, phrase };
      const toolbox = await getToolbox(chain, toolboxParams as Parameters<typeof getToolbox>[1]);
      const address = (await toolbox.getAddress()) || "";

      const hdWalletMethods =
        UTXOChains.includes(chain as UTXOChain) && isUTXOToolboxWithHD(toolbox)
          ? await createHDWalletMethods(chain as UTXOChain, toolbox)
          : {};

      const wallet = { ...toolbox, ...hdWalletMethods, address, chain };

      return wallet;
    }),
  );

  const wallets = walletResults.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const firstResult = walletResults[0];

  if (wallets.length === 0 && firstResult?.status === "rejected") throw firstResult.reason;

  for (const [index, result] of walletResults.entries()) {
    if (result.status !== "rejected") continue;

    console.error(`connectKeystore: skipping ${derivations[index]?.chain} — failed to connect`, result.reason);
  }

  return wallets.reduce(
    (acc, wallet) => {
      acc[wallet.chain as T[number]] = wallet as FullWallet[T[number]];
      return acc;
    },
    {} as Partial<{ [key in T[number]]: FullWallet[key] }>,
  );
}
