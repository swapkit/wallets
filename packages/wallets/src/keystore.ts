import {
  ACCOUNT_INDEXED_CHAINS,
  type AssetValue,
  Chain,
  CosmosChains,
  type DerivationPathArray,
  EVMChains,
  filterSupportedChains,
  getUTXOScriptTypeForPath,
  NetworkDerivationPath,
  SwapKitError,
  type UTXOChain,
  UTXOChains,
  type UTXOScriptType,
  updateDerivationPath,
  WalletOption,
} from "@swapkit/helpers";
import type { DerivedAddress, ExtendedPublicKeyResult, FullWallet, HDWalletAccountParams } from "@swapkit/toolboxes";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";

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
  // Only a missing entry means "use the default path"; 0, "", false or null are configuration mistakes.
  if (entry === undefined) return { chain, derivationPath: undefined, scriptType: undefined };

  const isUTXO = UTXOChains.includes(chain as UTXOChain);
  // JS callers and casts can pass a primitive or null; `in` on one throws a TypeError that names no chain.
  const isObjectEntry = typeof entry === "object" && entry !== null;
  const derivationPath = isObjectEntry && "derivationPath" in entry ? entry.derivationPath : entry;
  const scriptType = isObjectEntry && "scriptType" in entry ? entry.scriptType : undefined;

  if (isUTXO) {
    if (!Array.isArray(derivationPath) || !scriptType) {
      throw new SwapKitError("toolbox_utxo_invalid_params", {
        chain,
        entry,
        error:
          `${chain}: a UTXO derivation entry must be { derivationPath: number[], scriptType }. ` +
          "getUTXOScriptTypeForPath(derivationPath) gives the encoding the path implies.",
      });
    }

    return { chain, derivationPath, scriptType };
  }

  if (!Array.isArray(derivationPath)) {
    throw new SwapKitError("wallet_missing_params", {
      chain,
      entry,
      error: `${chain}: a derivation entry must be a path array or { derivationPath: number[] }.`,
      param: "derivationPath",
      wallet: WalletOption.KEYSTORE,
    });
  }

  return { chain, derivationPath, scriptType: undefined };
}

/**
 * Reads every chain's derivation entry and checks its shape before anything connects. These are configuration
 * errors that recur on every connect, so they fail the whole connect, in chain order;
 * a chain that fails later for an environmental reason is skipped and logged instead.
 */
function readDerivations<C extends Chain>(chains: C[], derivationPathMapOrIndex?: KeystoreDerivationPathMapOrIndex) {
  const derivationMap =
    derivationPathMapOrIndex && typeof derivationPathMapOrIndex === "object" ? derivationPathMapOrIndex : undefined;

  return chains.map((chain) =>
    readChainDerivation(chain, derivationMap?.[chain] as KeystoreChainDerivation | undefined),
  );
}

// A script type the chain cannot encode is a configuration error too, but the pinned @swapkit/toolboxes has no check
// to run before connecting, so it shows only once the chain's toolbox is built. Replace this with
// assertScriptTypeSupported from @swapkit/toolboxes/utxo in readDerivations once the SDK release containing
// swapkit/sdk#423 is adopted.
const deterministicErrorKeys = new Set(["toolbox_utxo_unsupported_script_type"]);

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

export const keystoreWallet = createWallet({
  connect: ({ addChain }) =>
    async function connectKeystore(
      chains: Chain[],
      phrase: string,
      derivationPathMapOrIndex?: KeystoreDerivationPathMapOrIndex,
    ) {
      const wallets = await createKeystoreWallet({ chains, derivationPathMapOrIndex, phrase });

      for (const wallet of Object.values(wallets)) {
        addChain({ ...wallet, chain: wallet.chain, walletType: WalletOption.KEYSTORE });
      }

      return true;
    },
  name: "connectKeystore",
  signingSupport: {
    ...Object.fromEntries(EVMChains.map((chain) => [chain, { direct: true, typedData: true }])),
    ...Object.fromEntries(UTXOChains.map((chain) => [chain, { direct: true }])),
    ...Object.fromEntries(
      CosmosChains.filter((chain) => chain !== Chain.Harbor).map((chain) => [chain, { direct: true }]),
    ),
    [Chain.Aleo]: { direct: true },
    [Chain.Aptos]: { direct: true },
    [Chain.Cardano]: { direct: true },
    [Chain.Hype]: { direct: true },
    [Chain.Near]: { direct: true },
    [Chain.Ripple]: { direct: true },
    [Chain.Solana]: { direct: true },
    [Chain.Stellar]: { direct: true },
    [Chain.Sui]: { direct: true },
    [Chain.Ton]: { direct: true },
    [Chain.Tron]: { direct: true },
  },
  supportedChains: [
    ...EVMChains,
    ...UTXOChains,
    ...CosmosChains.filter((chain) => chain !== Chain.Harbor),
    Chain.Aleo,
    Chain.Aptos,
    Chain.Cardano,
    Chain.Hype,
    Chain.Ripple,
    Chain.Solana,
    Chain.Stellar,
    Chain.Sui,
    Chain.Ton,
    Chain.Tron,
    Chain.Near,
  ],
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

  const walletIndex = typeof derivationPathMapOrIndex === "number" ? derivationPathMapOrIndex : 0;
  const derivations = readDerivations(supportedChains, derivationPathMapOrIndex);
  const walletResults = await Promise.allSettled(
    derivations.map(async ({ chain, derivationPath: derivationPathFromMap, scriptType }) => {
      const { getToolbox } = await import("@swapkit/toolboxes");

      const slicedPath: readonly (number | undefined)[] = NetworkDerivationPath[chain].slice(
        0,
        chain === Chain.Solana || chain === Chain.Aleo ? 4 : 5,
      );
      const derivationArrayToUpdate = slicedPath as DerivationPathArray;

      const derivationSlots = ACCOUNT_INDEXED_CHAINS.includes(chain)
        ? { account: walletIndex }
        : { index: walletIndex };

      const derivationPath: DerivationPathArray =
        derivationPathFromMap || updateDerivationPath(derivationArrayToUpdate, derivationSlots);

      const resolvedScriptType = UTXOChains.includes(chain as UTXOChain)
        ? (scriptType ?? getUTXOScriptTypeForPath(derivationPath))
        : undefined;

      const toolbox = await getToolbox(chain, {
        derivationPath,
        phrase,
        ...(resolvedScriptType ? { scriptType: resolvedScriptType } : {}),
      });
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

    const errorKey = (result.reason as { errorKey?: string } | undefined)?.errorKey;
    if (errorKey && deterministicErrorKeys.has(errorKey)) {
      throw result.reason;
    }

    console.error(`connectKeystore: skipping ${supportedChains[index]} — failed to connect`, result.reason);
  }

  return wallets.reduce(
    (acc, wallet) => {
      acc[wallet.chain as T[number]] = wallet as FullWallet[T[number]];
      return acc;
    },
    {} as Partial<{ [key in T[number]]: FullWallet[key] }>,
  );
}
