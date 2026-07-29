import type { AccountData, Algo, AminoSignResponse, OfflineAminoSigner, StdSignDoc } from "@cosmjs/amino";
import type { Transaction } from "@near-js/transactions";
import { base64, hex } from "@scure/base";
import { Chain, type CosmosChain, filterSupportedChains, SKConfig, SwapKitError, WalletOption } from "@swapkit/helpers";
import type { NearSigner } from "@swapkit/toolboxes/near";
import type { TronSignedTransaction, TronSigner, TronTransaction } from "@swapkit/toolboxes/tron";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { WalletConnectModal } from "@walletconnect/modal";
import type SignClientClient from "@walletconnect/sign-client";
import type { PairingTypes, SessionTypes, SignClientTypes } from "@walletconnect/types";
import { DEFAULT_APP_METADATA, DEFAULT_COSMOS_METHODS, DEFAULT_LOGGER, DEFAULT_RELAY_URL } from "./constants";
import { getEVMSigner } from "./evmSigner";
import { chainToChainId, getAddressByChain } from "./helpers";
import { getConnectionNamespaces } from "./namespaces";

export * from "./constants";
export * from "./types";

export interface Walletconnect {
  accounts: string[];
  client: SignClientClient;
  disconnect: () => Promise<void>;
  session?: SessionTypes.Struct;
}

export const walletconnectWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectWalletconnect(chains: Chain[], walletconnectOptions?: SignClientTypes.Options) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });
      const { walletConnectProjectId } = SKConfig.get("apiKeys");

      if (!walletConnectProjectId) {
        throw new SwapKitError("wallet_walletconnect_project_id_not_specified");
      }

      const walletconnect = await getWalletconnect(
        filteredChains,
        supportedChains,
        walletConnectProjectId,
        walletconnectOptions,
      );

      const { accounts } = walletconnect;

      await Promise.all(
        filteredChains.map(async (chain) => {
          const address = getAddressByChain(chain, accounts || []);
          const toolbox = await getToolbox({ address, chain, walletconnect });

          addChain({
            ...toolbox,
            address,
            chain,
            disconnect: walletconnect.disconnect,
            walletType: WalletOption.WALLETCONNECT,
          });
        }),
      );

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
    [Chain.Monad]: true,
    [Chain.Optimism]: true,
    [Chain.Polygon]: true,
    [Chain.XLayer]: true,
    [Chain.Cosmos]: true,
    [Chain.Kujira]: true,
    [Chain.Maya]: true,
    [Chain.Near]: true,
    [Chain.THORChain]: true,
    [Chain.Tron]: true,
  },
  name: "connectWalletconnect",
  supportedChains: [
    Chain.Arbitrum,
    Chain.Aurora,
    Chain.Avalanche,
    Chain.Base,
    Chain.Berachain,
    Chain.BinanceSmartChain,
    Chain.Cosmos,
    Chain.Ethereum,
    Chain.Kujira,
    Chain.Maya,
    Chain.Monad,
    Chain.Near,
    Chain.Optimism,
    Chain.Polygon,
    Chain.THORChain,
    Chain.Tron,
    Chain.XLayer,
  ],
  walletType: WalletOption.WALLETCONNECT,
});

export const WC_SUPPORTED_CHAINS = getWalletSupportedChains(walletconnectWallet);

type WalletConnectCosmosAccount = {
  address?: string;
  algo?: Algo;
  pubkey?: string | number[] | Uint8Array | { value?: string | number[] | Uint8Array };
  publicKey?: string | number[] | Uint8Array | { value?: string | number[] | Uint8Array };
};

export function decodePublicKey(publicKey: WalletConnectCosmosAccount["publicKey"]) {
  const key =
    typeof publicKey === "object" && !(publicKey instanceof Uint8Array) && !Array.isArray(publicKey)
      ? publicKey.value
      : publicKey;

  if (key instanceof Uint8Array) return key;
  if (Array.isArray(key)) return Uint8Array.from(key);

  if (typeof key === "string") {
    const normalized = key.startsWith("0x") ? key.slice(2) : key;
    if (/^[\da-f]+$/i.test(normalized) && normalized.length % 2 === 0) return hex.decode(normalized);

    return base64.decode(normalized);
  }

  return undefined;
}

export function getWalletConnectSignature(response: unknown): AminoSignResponse {
  if (
    response &&
    typeof response === "object" &&
    "signed" in response &&
    "signature" in response &&
    typeof response.signature === "object" &&
    response.signature
  ) {
    return response as AminoSignResponse;
  }

  throw new SwapKitError("wallet_walletconnect_method_not_supported", {
    method: DEFAULT_COSMOS_METHODS.COSMOS_SIGN_AMINO,
  });
}

export function getWalletConnectCosmosAccounts(response: unknown, fallbackAddress: string): AccountData[] {
  const accounts = Array.isArray(response)
    ? response
    : response && typeof response === "object" && "accounts" in response && Array.isArray(response.accounts)
      ? response.accounts
      : [];

  return accounts.map((account): AccountData => {
    const walletAccount = account as WalletConnectCosmosAccount;
    const address = walletAccount.address || fallbackAddress;
    const pubkey = decodePublicKey(walletAccount.pubkey || walletAccount.publicKey);

    if (!pubkey || pubkey.length === 0) {
      throw new SwapKitError("wallet_walletconnect_method_not_supported", {
        method: DEFAULT_COSMOS_METHODS.COSMOS_GET_ACCOUNTS,
        reason: "WalletConnect Cosmos account did not include a public key",
      });
    }

    return { address, algo: walletAccount.algo || "secp256k1", pubkey };
  });
}

function createWalletConnectCosmosSigner({
  address,
  chain,
  walletconnect,
}: {
  address: string;
  chain: Exclude<CosmosChain, typeof Chain.Harbor | typeof Chain.Noble>;
  walletconnect: NonNullable<Walletconnect>;
}): OfflineAminoSigner {
  const chainId = chainToChainId(chain);
  let cachedAccounts: AccountData[] | undefined;

  return {
    async getAccounts() {
      const session = walletconnect.session;
      if (!session) {
        throw new SwapKitError("wallet_walletconnect_connection_not_established");
      }

      if (cachedAccounts) return cachedAccounts;

      const response = await walletconnect.client.request({
        chainId,
        request: { method: DEFAULT_COSMOS_METHODS.COSMOS_GET_ACCOUNTS, params: {} },
        topic: session.topic,
      });

      cachedAccounts = getWalletConnectCosmosAccounts(response, address);
      return cachedAccounts;
    },

    async signAmino(signerAddress: string, signDoc: StdSignDoc) {
      const session = walletconnect.session;
      if (!session) {
        throw new SwapKitError("wallet_walletconnect_connection_not_established");
      }

      const response = await walletconnect.client.request({
        chainId,
        request: { method: DEFAULT_COSMOS_METHODS.COSMOS_SIGN_AMINO, params: { signDoc, signerAddress } },
        topic: session.topic,
      });

      return getWalletConnectSignature(response);
    },
  };
}

export function getNearTransactionHash(response: unknown): string {
  if (typeof response === "string") return response;

  if (Array.isArray(response)) {
    const [first] = response;
    return getNearTransactionHash(first);
  }

  if (response && typeof response === "object") {
    const result = response as {
      transaction?: { hash?: string };
      transaction_outcome?: { id?: string };
      transactionHash?: string;
      hash?: string;
    };

    return result.transaction_outcome?.id || result.transaction?.hash || result.transactionHash || result.hash || "";
  }

  return "";
}

async function getToolbox<T extends (typeof WC_SUPPORTED_CHAINS)[number]>({
  chain,
  walletconnect,
  address,
}: {
  walletconnect: Walletconnect;
  chain: T;
  address: string;
}) {
  const session = walletconnect?.session;
  if (!session) {
    throw new SwapKitError("wallet_walletconnect_connection_not_established");
  }

  switch (chain) {
    case Chain.Arbitrum:
    case Chain.Aurora:
    case Chain.Avalanche:
    case Chain.Base:
    case Chain.Berachain:
    case Chain.BinanceSmartChain:
    case Chain.Ethereum:
    case Chain.Monad:
    case Chain.Optimism:
    case Chain.Polygon:
    case Chain.XLayer: {
      const { getProvider, getEvmToolboxAsync } = await import("@swapkit/toolboxes/evm");

      const provider = await getProvider(chain);
      const signer = await getEVMSigner({ chain, provider, walletconnect });
      const toolbox = await getEvmToolboxAsync(chain, { provider, signer });

      return toolbox;
    }

    case Chain.Cosmos:
    case Chain.Kujira:
    case Chain.Maya:
    case Chain.THORChain: {
      const { getCosmosToolbox } = await import("@swapkit/toolboxes/cosmos");
      const signer = createWalletConnectCosmosSigner({
        address,
        chain: chain as Exclude<CosmosChain, typeof Chain.Harbor | typeof Chain.Noble>,
        walletconnect,
      });

      return getCosmosToolbox(chain as Exclude<CosmosChain, typeof Chain.Harbor | typeof Chain.Noble>, { signer });
    }

    case Chain.Near: {
      const { getNearToolbox } = await import("@swapkit/toolboxes/near");
      const { DEFAULT_NEAR_METHODS } = await import("./constants");

      // Create a NEAR signer that uses WalletConnect
      const signer = {
        getAddress() {
          return Promise.resolve(address);
        },
        getPublicKey() {
          // WalletConnect NEAR doesn't expose public key directly
          return Promise.reject(
            new SwapKitError("wallet_walletconnect_method_not_supported", { method: "getPublicKey" }),
          );
        },

        async signAndSendTransactions({ transactions }: { transactions: Transaction[] }) {
          const session = walletconnect.session;
          if (!session) {
            throw new SwapKitError("wallet_walletconnect_connection_not_established");
          }

          if (transactions.length === 0) {
            throw new SwapKitError("wallet_walletconnect_method_not_supported", { method: "near_empty_transactions" });
          }

          const isBatch = transactions.length > 1;
          const result = await walletconnect.client.request({
            chainId: chainToChainId(Chain.Near),
            request: {
              method: isBatch
                ? DEFAULT_NEAR_METHODS.NEAR_SIGN_AND_SEND_TRANSACTIONS
                : DEFAULT_NEAR_METHODS.NEAR_SIGN_AND_SEND_TRANSACTION,
              params: isBatch ? { transactions } : { transaction: transactions[0] },
            },
            topic: session.topic,
          });

          const txHash = getNearTransactionHash(result);
          if (!txHash) throw new SwapKitError("wallet_walletconnect_method_not_supported", { method: "near_tx_hash" });

          return txHash;
        },

        signDelegateAction() {
          return Promise.reject(
            new SwapKitError("wallet_walletconnect_method_not_supported", { method: "signDelegateAction" }),
          );
        },

        signNep413Message(
          _message: string,
          _accountId: string,
          _recipient: string,
          _nonce: Uint8Array,
          _callbackUrl?: string,
        ) {
          // WalletConnect NEAR spec doesn't include NEP-413 message signing
          return Promise.reject(
            new SwapKitError("wallet_walletconnect_method_not_supported", { method: "signNep413Message" }),
          );
        },

        // Intentionally reject so the toolbox's signAndBroadcastTransaction falls back to signAndSendTransactions.
        signTransaction() {
          return Promise.reject(
            new SwapKitError("wallet_walletconnect_method_not_supported", { method: "near_signTransaction" }),
          );
        },
      } as NearSigner;

      const toolbox = getNearToolbox({ signer });
      return toolbox;
    }

    case Chain.Tron: {
      const { getTronToolbox } = await import("@swapkit/toolboxes/tron");
      const { DEFAULT_TRON_METHODS } = await import("./constants");

      // Create a Tron signer that uses WalletConnect
      const signer: TronSigner = {
        getAddress() {
          return Promise.resolve(address);
        },

        async signTransaction(transaction: TronTransaction) {
          const session = walletconnect.session;
          if (!session) {
            throw new SwapKitError("wallet_walletconnect_connection_not_established");
          }

          const signedTx = await walletconnect.client.request({
            chainId: chainToChainId(Chain.Tron),
            request: { method: DEFAULT_TRON_METHODS.TRON_SIGN_TRANSACTION, params: { transaction } },
            topic: session.topic,
          });

          return signedTx as TronSignedTransaction;
        },
      };

      const toolbox = getTronToolbox({ signer });

      return toolbox;
    }

    default:
      throw new SwapKitError({
        errorKey: "wallet_chain_not_supported",
        info: { chain, wallet: WalletOption.WALLETCONNECT },
      });
  }
}

async function getWalletconnect(
  chains: Chain[],
  allSupportedChains: Chain[],
  walletConnectProjectId: string,
  walletconnectOptions?: SignClientTypes.Options,
) {
  let modal: WalletConnectModal | undefined;
  const chainIds = chains.map(chainToChainId).filter(Boolean);
  const supportedChainIds = allSupportedChains.map(chainToChainId).filter(Boolean);
  const { optionalNamespaces, requiredNamespaces } = getConnectionNamespaces({
    optionalChains: supportedChainIds,
    requiredChains: chainIds,
  });

  try {
    const { SignClient } = await import("@walletconnect/sign-client");
    const { WalletConnectModal } = await import("@walletconnect/modal");

    const client = await SignClient.init({
      logger: DEFAULT_LOGGER,
      metadata: walletconnectOptions?.metadata || DEFAULT_APP_METADATA,
      projectId: walletConnectProjectId,
      relayUrl: DEFAULT_RELAY_URL,
      ...walletconnectOptions?.core,
    });

    const existingSession = getPreferredSession(client.find({ requiredNamespaces }));
    if (existingSession) {
      return createWalletconnectConnection({ client, session: existingSession });
    }

    modal = new WalletConnectModal({
      logger: DEFAULT_LOGGER,
      projectId: walletConnectProjectId,
      relayUrl: DEFAULT_RELAY_URL,
      ...walletconnectOptions?.core,
    });

    const pairingTopic = getPreferredPairingTopic(client);
    // @walletconnect/sign-client deprecates pairingTopic; an offline wallet yields no QR URI and approval can wait
    // for the ~5-minute proposal TTL. Accept for now; revisit on the next WalletConnect major bump.
    const { uri, approval } = await client.connect({ optionalNamespaces, pairingTopic, requiredNamespaces });

    if (uri) {
      modal.openModal({ uri });
    }

    const session = await approval();

    if (!session) {
      throw new SwapKitError("wallet_walletconnect_connection_not_established");
    }

    return createWalletconnectConnection({ client, session });
  } catch (error) {
    if (error instanceof SwapKitError) throw error;
    throw new SwapKitError("wallet_walletconnect_connection_not_established", error);
  } finally {
    if (modal) {
      modal.closeModal();
    }
  }
}

type WalletconnectLifecycleEvent = "session_delete" | "session_expire" | "session_extend" | "session_update";

export interface WalletconnectLifecycleClient {
  disconnect: SignClientClient["disconnect"];
  on<E extends WalletconnectLifecycleEvent>(
    event: E,
    listener: (args: SignClientTypes.EventArguments[E]) => void,
  ): unknown;
  session: Pick<SignClientClient["session"], "get" | "keys">;
}

type WalletconnectConnection<Client> = Omit<Walletconnect, "client"> & { client: Client };

export function createWalletconnectConnection<Client extends WalletconnectLifecycleClient>({
  client,
  session,
}: {
  client: Client;
  session: SessionTypes.Struct;
}): WalletconnectConnection<Client> {
  const walletconnect: WalletconnectConnection<Client> = {
    accounts: extractAccountsFromSession(session),
    client,
    disconnect: async () => {
      if (!walletconnect.session) return;
      await client.disconnect({
        reason: { code: 0, message: "User disconnected" },
        topic: walletconnect.session.topic,
      });
    },
    session,
  };

  client.on("session_delete", ({ topic }: SignClientTypes.EventArguments["session_delete"]) => {
    if (walletconnect.session?.topic !== topic) return;

    walletconnect.accounts = [];
    walletconnect.session = undefined;
  });

  client.on("session_expire", ({ topic }: SignClientTypes.EventArguments["session_expire"]) => {
    if (walletconnect.session?.topic !== topic) return;

    walletconnect.accounts = [];
    walletconnect.session = undefined;
  });

  client.on("session_extend", ({ topic }: SignClientTypes.EventArguments["session_extend"]) => {
    if (walletconnect.session?.topic !== topic || !client.session.keys.includes(topic)) return;

    walletconnect.session = client.session.get(topic);
  });

  client.on("session_update", ({ topic, params }: SignClientTypes.EventArguments["session_update"]) => {
    const currentSession = walletconnect.session;
    if (!currentSession || currentSession.topic !== topic) return;

    const nextSession = { ...currentSession, namespaces: params.namespaces };
    walletconnect.session = nextSession;
    walletconnect.accounts = extractAccountsFromSession(nextSession);
  });

  return walletconnect;
}

function extractAccountsFromSession(session: SessionTypes.Struct) {
  const accounts: string[] = [];

  for (const [_namespace, data] of Object.entries(session.namespaces)) {
    accounts.push(...data.accounts);
  }

  return accounts;
}

export function getPreferredSession(sessions: SessionTypes.Struct[]) {
  return sessions
    .filter((session) => !isExpired(session.expiry))
    .sort((sessionA, sessionB) => sessionB.expiry - sessionA.expiry)[0];
}

export interface PreferredPairingClient {
  core: { pairing: { getPairings(): PairingTypes.Struct[] } };
  session: { getAll(): SessionTypes.Struct[] };
}

export function getPreferredPairingTopic(client: PreferredPairingClient) {
  const sessions = client.session
    .getAll()
    .filter((session) => !isExpired(session.expiry))
    .sort((sessionA, sessionB) => sessionB.expiry - sessionA.expiry);

  if (sessions[0]?.pairingTopic) {
    return sessions[0].pairingTopic;
  }

  const pairings = client.core.pairing
    .getPairings()
    .filter((pairing) => pairing.active && !isExpired(pairing.expiry))
    .sort((pairingA, pairingB) => pairingB.expiry - pairingA.expiry);

  return pairings[0]?.topic;
}

function isExpired(expiry: number) {
  return expiry <= Math.floor(Date.now() / 1000);
}
