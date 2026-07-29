import type { AccountData, Algo, AminoSignResponse, OfflineAminoSigner, StdSignDoc } from "@cosmjs/amino";
import type { Transaction } from "@near-js/transactions";
import { base64, hex } from "@scure/base";
import { Chain, type CosmosChain, filterSupportedChains, SKConfig, SwapKitError, WalletOption } from "@swapkit/helpers";
import type { NearSigner } from "@swapkit/toolboxes/near";
import type { TronSignedTransaction, TronSigner, TronTransaction } from "@swapkit/toolboxes/tron";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import type { WalletConnectModal } from "@walletconnect/modal";
import type { SignClient } from "@walletconnect/sign-client";
import type { SessionTypes, SignClientTypes } from "@walletconnect/types";
import { DEFAULT_APP_METADATA, DEFAULT_COSMOS_METHODS, DEFAULT_LOGGER, DEFAULT_RELAY_URL } from "./constants";
import { getEVMSigner } from "./evmSigner";
import { chainToChainId, getAddressByChain } from "./helpers";
import { getRequiredNamespaces } from "./namespaces";

export * from "./constants";
export * from "./types";

export const walletconnectWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectWalletconnect(chains: Chain[], walletconnectOptions?: SignClientTypes.Options) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });
      const { walletConnectProjectId } = SKConfig.get("apiKeys");

      if (!walletConnectProjectId) {
        throw new SwapKitError("wallet_walletconnect_project_id_not_specified");
      }

      const walletconnect = await getWalletconnect(filteredChains, walletConnectProjectId, walletconnectOptions);

      if (!walletconnect) {
        throw new SwapKitError("wallet_walletconnect_connection_not_established");
      }

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
export type Walletconnect = Awaited<ReturnType<typeof getWalletconnect>>;

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
  session,
  walletconnect,
}: {
  address: string;
  chain: Exclude<CosmosChain, typeof Chain.Harbor | typeof Chain.Noble>;
  session: SessionTypes.Struct;
  walletconnect: NonNullable<Walletconnect>;
}): OfflineAminoSigner {
  const chainId = chainToChainId(chain);
  let cachedAccounts: AccountData[] | undefined;

  return {
    async getAccounts() {
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
        session,
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

        signDelegateAction(_delegateAction: any) {
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
          if (!walletconnect) {
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
  walletConnectProjectId: string,
  walletconnectOptions?: SignClientTypes.Options,
) {
  let modal: WalletConnectModal | undefined;
  let signer: typeof SignClient | undefined;
  let session: SessionTypes.Struct | undefined;
  let accounts: string[] | undefined;
  try {
    const requiredNamespaces = getRequiredNamespaces(chains.map(chainToChainId));

    const { SignClient } = await import("@walletconnect/sign-client");
    const { WalletConnectModal } = await import("@walletconnect/modal");

    const client = await SignClient.init({
      logger: DEFAULT_LOGGER,
      metadata: walletconnectOptions?.metadata || DEFAULT_APP_METADATA,
      projectId: walletConnectProjectId,
      relayUrl: DEFAULT_RELAY_URL,
      ...walletconnectOptions?.core,
    });

    const modal = new WalletConnectModal({
      logger: DEFAULT_LOGGER,
      projectId: walletConnectProjectId,
      relayUrl: DEFAULT_RELAY_URL,
      ...walletconnectOptions?.core,
    });

    const oldSession = (await client.session.getAll())[0];

    // disconnect old Session cause we can't handle using it with current ui
    if (oldSession) {
      await client.disconnect({ reason: { code: 0, message: "Resetting session" }, topic: oldSession.topic });
    }

    const { uri, approval } = await client.connect({
      // Optionally: pass a known prior pairing (e.g. from `client.core.pairing.getPairings()`) to skip the `uri` step.
      //   pairingTopic: pairing?.topic,
      // Provide the namespaces and chains (e.g. `eip155` for EVM-based chains) we want to use in this session.
      requiredNamespaces,
    });

    if (uri) {
      modal.openModal({ uri });
      // Await session approval from the wallet.
      session = await approval();
      // Handle the returned session (e.g. update UI to "connected" state).
      // Close the QRCode modal in case it was open.
      modal.closeModal();

      function extractAccountsFromSession(session: SessionTypes.Struct) {
        const accounts: string[] = [];

        for (const [_namespace, data] of Object.entries(session.namespaces)) {
          accounts.push(...data.accounts);
        }

        return accounts;
      }

      accounts = extractAccountsFromSession(session);
    }

    const disconnect = async () => {
      session && (await client.disconnect({ reason: { code: 0, message: "User disconnected" }, topic: session.topic }));
    };

    if (!session) {
      throw new SwapKitError("wallet_walletconnect_connection_not_established");
    }

    return { accounts, client, disconnect, session, signer };
  } catch {
    // Errors are handled by returning undefined
  } finally {
    if (modal) {
      modal.closeModal();
    }
  }
  return undefined;
}
