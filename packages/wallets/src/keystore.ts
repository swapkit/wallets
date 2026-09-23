import {
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
import type { DerivedAddress, FullWallet } from "@swapkit/toolboxes";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";

export {
  decryptFromKeystore,
  encryptToKeyStore,
  generatePhrase,
  type Keystore,
  validatePhrase,
} from "./keystore-helpers";

export type KeystoreUTXOChainDerivation = { derivationPath: DerivationPathArray; scriptType: UTXOScriptType };
export type KeystoreChainDerivation =
  | DerivationPathArray
  | { derivationPath: DerivationPathArray }
  | KeystoreUTXOChainDerivation;

/**
 * A UTXO chain states the script type its path encodes; other chains take a bare path or `{ derivationPath }`.
 * `getUTXOScriptTypeForPath(derivationPath)` gives the type a standard path implies.
 */
export type KeystoreDerivationPathMap = {
  [C in Chain]?: C extends UTXOChain
    ? KeystoreUTXOChainDerivation
    : DerivationPathArray | { derivationPath: DerivationPathArray };
};
export type KeystoreDerivationPathMapOrIndex = KeystoreDerivationPathMap | number;

function readChainDerivation(chain: Chain, entry: KeystoreChainDerivation | undefined) {
  if (!entry) return { derivationPath: undefined, scriptType: undefined };

  const isUTXO = UTXOChains.includes(chain as UTXOChain);
  const derivationPath = "derivationPath" in entry ? entry.derivationPath : entry;
  const scriptType = "scriptType" in entry ? entry.scriptType : undefined;

  if (isUTXO && !scriptType) {
    throw new SwapKitError("toolbox_utxo_invalid_params", {
      chain,
      error:
        `${chain}: a UTXO derivation entry must state its scriptType: { derivationPath, scriptType }. ` +
        "getUTXOScriptTypeForPath(derivationPath) gives the encoding the path implies.",
    });
  }

  return { derivationPath, scriptType: isUTXO ? scriptType : undefined };
}

// Configuration errors recur on every connect, so they fail the whole connect instead of skipping the chain.
const deterministicErrorKeys = new Set(["toolbox_utxo_unsupported_script_type", "toolbox_utxo_invalid_params"]);

type UTXOToolboxWithHD = {
  deriveAddressAtIndex: (params: { index: number; change?: boolean }) => DerivedAddress | undefined;
  getExtendedPublicKey: () => string | undefined;
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

  function deriveAddresses(params: { count: number; startIndex?: number; change?: boolean }) {
    const { count, startIndex = 0, change = false } = params;
    if (count < 1 || count > 1000) throw new RangeError(`count must be between 1 and 1000, got ${count}`);
    if (startIndex < 0) throw new RangeError(`startIndex must be non-negative, got ${startIndex}`);

    const addresses: DerivedAddress[] = [];
    for (let i = 0; i < count; i++) {
      const derived = toolbox.deriveAddressAtIndex({ change, index: startIndex + i });
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
  // Keystore holds the private key — direct signing works for every supported chain.
  directSigningSupport: {
    ...Object.fromEntries(EVMChains.map((chain) => [chain, true])),
    ...Object.fromEntries(UTXOChains.map((chain) => [chain, true])),
    ...Object.fromEntries(CosmosChains.filter((chain) => chain !== Chain.Harbor).map((chain) => [chain, true])),
    [Chain.Aleo]: true,
    [Chain.Aptos]: true,
    [Chain.Cardano]: true,
    [Chain.Hype]: true,
    [Chain.Near]: true,
    [Chain.Ripple]: true,
    [Chain.Solana]: true,
    [Chain.Stellar]: true,
    [Chain.Sui]: true,
    [Chain.Ton]: true,
    [Chain.Tron]: true,
  },
  name: "connectKeystore",
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
  const filteredChains = filterSupportedChains({
    chains,
    supportedChains: KEYSTORE_SUPPORTED_CHAINS,
    walletType: WalletOption.KEYSTORE,
  });

  // One broken chain derivation must not fail the whole connect — collect per-chain
  // results and only reject when every requested chain failed.
  const settled = await Promise.allSettled(
    filteredChains.map(async (chain) => {
      const { getToolbox } = await import("@swapkit/toolboxes");

      const derivationPathIndex = typeof derivationPathMapOrIndex === "number" ? derivationPathMapOrIndex : 0;
      const { derivationPath: derivationPathFromMap, scriptType } = readChainDerivation(
        chain,
        derivationPathMapOrIndex && typeof derivationPathMapOrIndex === "object"
          ? (derivationPathMapOrIndex[chain] as KeystoreChainDerivation | undefined)
          : undefined,
      );

      // Solana and Aleo use 4-element hardened paths; everything else uses 5.
      const derivationArrayToUpdate = NetworkDerivationPath[chain].slice(
        0,
        chain === Chain.Solana || chain === Chain.Aleo ? 4 : 5,
      ) as unknown as DerivationPathArray;

      const derivationPath: DerivationPathArray =
        derivationPathFromMap || updateDerivationPath(derivationArrayToUpdate, { index: derivationPathIndex });

      // A UTXO toolbox given a path must be told the script type; the default path implies its own.
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

  const wallets = settled.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const failures = settled.filter((result) => result.status === "rejected");

  if (wallets.length === 0 && failures.length > 0) {
    throw failures[0]?.reason;
  }

  for (const [index, result] of settled.entries()) {
    if (result.status !== "rejected") continue;

    const errorKey = (result.reason as { errorKey?: string } | undefined)?.errorKey;
    if (errorKey && deterministicErrorKeys.has(errorKey)) throw result.reason;

    console.error(`connectKeystore: skipping ${filteredChains[index]} — derivation failed`, result.reason);
  }

  return wallets.reduce(
    (acc, wallet) => {
      acc[wallet.chain as T[number]] = wallet as FullWallet[T[number]];
      return acc;
    },
    {} as { [key in T[number]]: FullWallet[key] },
  );
}
