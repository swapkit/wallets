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

const deterministicErrorKeys = new Set(["toolbox_utxo_unsupported_script_type", "toolbox_utxo_invalid_params"]);

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
    Chain.Ripple,
    Chain.Solana,
    Chain.Stellar,
    Chain.Sui,
    Chain.Ton,
    Chain.Tron,
    Chain.Near,
    Chain.Hype,
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
  const supportedChains = filterSupportedChains({
    chains,
    supportedChains: KEYSTORE_SUPPORTED_CHAINS,
    walletType: WalletOption.KEYSTORE,
  });

  const walletIndex = typeof derivationPathMapOrIndex === "number" ? derivationPathMapOrIndex : 0;
  const walletResults = await Promise.allSettled(
    supportedChains.map(async (chain) => {
      const { getToolbox } = await import("@swapkit/toolboxes");

      const { derivationPath: derivationPathFromMap, scriptType } = readChainDerivation(
        chain,
        derivationPathMapOrIndex && typeof derivationPathMapOrIndex === "object"
          ? (derivationPathMapOrIndex[chain] as KeystoreChainDerivation | undefined)
          : undefined,
      );

      // `.slice` widens the frozen tuple to a plain array, so the shape has to be re-asserted.
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

      // Pass the resolved path only — toolboxes must never receive path and index together.
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
