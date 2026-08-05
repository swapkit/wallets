import type { InvokeMethodOptions, MultichainCore, Scope, SessionData } from "@metamask/connect-multichain";
import {
  Chain,
  type EVMChain,
  EVMChains,
  filterSupportedChains,
  getChainConfig,
  getRPCUrl,
  SwapKitError,
  WalletOption,
} from "@swapkit/helpers";
import { createWallet, getWalletSupportedChains } from "@swapkit/wallet-core";
import { getWeb3WalletMethods } from "@swapkit/wallet-extensions/evm-extensions";
import type { Eip1193Provider } from "ethers";

// MetaMask connector built on @metamask/connect-multichain.
//
// One CAIP-25 session covers EVM + Solana (+ future ecosystems) behind a single
// approval prompt. The multichain client has NO per-chain EIP-1193 provider —
// everything goes through `invokeMethod({ scope, request })`. We adapt that into
// the shape each existing SwapKit toolbox already consumes:
//   • EVM    -> EIP-1193 shim -> ethers BrowserProvider -> getWeb3WalletMethods (unchanged)
//   • Solana -> SolanaProvider-style signer -> getSolanaToolbox({ signer })
//   • Future -> add one adapter per ecosystem as SwapKit gains a toolbox for it.

// Solana mainnet CAIP-2 id (MetaMask multichain "supported chains").
const SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

const EVM_CHAIN_SET = new Set<Chain>(EVMChains);
const isEVMChain = (chain: Chain): chain is EVMChain => EVM_CHAIN_SET.has(chain);

// SwapKit Chain -> CAIP-2 scope.
const chainToScope = (chain: Chain): Scope => {
  if (isEVMChain(chain)) {
    return `eip155:${Number.parseInt(getChainConfig(chain).chainIdHex, 16)}`;
  }
  switch (chain) {
    case Chain.Solana:
      return SOLANA_MAINNET_CAIP2;
    default:
      throw new SwapKitError("wallet_chain_not_supported", { chain });
  }
};

export type ConnectMetamaskOptions = {
  dapp?: { name: string; url?: string; iconUrl?: string };
  // Optional override; otherwise derived from SwapKit RPCs per requested chain.
  supportedNetworks?: Record<string, string>;
};

type MultichainClient = MultichainCore;

const isUserRejection = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 4001;

// Resolve the address for a CAIP-2 scope from a session.
//
// getSession may key sessionScopes by full CAIP-2 ("eip155:1") OR collapse a
// namespace into one bucket ("eip155" with references: ["1","137"]). Rather than
// rely on the key shape, scan every bucket's CAIP-10 accounts and match on
// namespace:reference. CAIP-10 is "namespace:reference:address" (address = [2]).
const findAddressForScope = (session: SessionData, scope: Scope): string | undefined => {
  const [namespace, reference] = scope.split(":");
  for (const bucket of Object.values(session.sessionScopes)) {
    for (const caip10 of bucket.accounts ?? []) {
      const [accNamespace, accReference, address] = caip10.split(":");
      if (accNamespace === namespace && accReference === reference && address) return address;
    }
  }
  return undefined;
};

// ---- EVM adapter: invokeMethod -> EIP-1193 ----------------------------------
// BrowserProvider only needs `request`. Account/chain queries are answered from
// the session; everything else is forwarded to the client, which routes reads to
// the RPC node and wallet methods (eth_sendTransaction, personal_sign, …) to MetaMask.
const makeEip1193ForScope = (client: MultichainClient, scope: Scope, address: string): Eip1193Provider => {
  const chainIdHex = `0x${Number(scope.split(":")[1]).toString(16)}`;
  return {
    request: ({ method, params }: { method: string; params?: InvokeMethodOptions["request"]["params"] }) => {
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return Promise.resolve([address]);
        case "eth_chainId":
          return Promise.resolve(chainIdHex);
        // In a CAIP-25 session the scope already pins the chain; there is no
        // single "active chain" to switch. prepareNetworkSwitch (always applied
        // by getWeb3WalletMethods) must never forward a switch/add into the
        // multichain session, so answer these locally as no-ops.
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return Promise.resolve(null);
        default:
          return client.invokeMethod({ request: { method, params }, scope });
      }
    },
  } as unknown as Eip1193Provider;
};

// ---- Solana adapter: invokeMethod -> SolanaProvider-style signer ------------
// Matches the SolanaProvider interface getSolanaToolbox({ signer }) consumes:
// the toolbox calls signer.signTransaction(tx) and broadcasts the result itself,
// so we sign-and-return (solana_signTransaction), we do NOT send.
const makeSolanaSigner = async (client: MultichainClient, scope: Scope, address: string) => {
  const { PublicKey, Transaction, VersionedTransaction } = await import("@solana/web3.js");
  const publicKey = new PublicKey(address);

  const signTransaction = async <
    T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction,
  >(
    transaction: T,
  ): Promise<T> => {
    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    const base64Transaction = Buffer.from(serialized).toString("base64");

    const result = (await client.invokeMethod({
      request: { method: "solana_signTransaction", params: { transaction: base64Transaction } },
      scope,
    })) as { transaction: string };

    const signedBuffer = Buffer.from(result.transaction, "base64");
    return (
      transaction instanceof VersionedTransaction
        ? VersionedTransaction.deserialize(signedBuffer)
        : Transaction.from(signedBuffer)
    ) as T;
  };

  return {
    connect: () => Promise.resolve({ publicKey }),
    disconnect: () => client.disconnect([scope]),
    publicKey,
    signTransaction,
  };
};

export const metamaskWallet = createWallet({
  connect: ({ addChain, supportedChains, walletType }) =>
    async function connectMetamask(chains: Chain[], options?: ConnectMetamaskOptions) {
      const filteredChains = filterSupportedChains({ chains, supportedChains, walletType });
      const { createMultichainClient } = await import("@metamask/connect-multichain");

      const chainScopes = filteredChains.map((chain) => ({ chain, scope: chainToScope(chain) }));
      const scopes = [...new Set(chainScopes.map(({ scope }) => scope))];

      const supportedNetworks =
        options?.supportedNetworks ??
        Object.fromEntries(
          await Promise.all(chainScopes.map(async ({ chain, scope }) => [scope, await getRPCUrl(chain)] as const)),
        );

      const client = await createMultichainClient({
        api: { supportedNetworks },
        dapp: options?.dapp ?? { name: "SwapKit", url: globalThis.location?.href },
      });

      try {
        // Single approval prompt for every requested scope.
        await client.connect(scopes, []);
      } catch (error) {
        if (isUserRejection(error)) throw new SwapKitError("wallet_connection_rejected_by_user", error);
        throw error;
      }

      const session = await client.provider.getSession();
      if (!session) {
        throw new SwapKitError("core_wallet_connection_not_found", { wallet: WalletOption.METAMASK });
      }

      // MetaMask may grant fewer scopes than requested (no Solana account, an EVM
      // network not added/approved). Connect the granted subset and skip the rest —
      // consumers see exactly the chains that arrived via addChain. Only a fully
      // empty grant is an error.
      const granted = chainScopes.flatMap(({ chain, scope }) => {
        const address = findAddressForScope(session, scope);
        return address ? [{ address, chain, scope }] : [];
      });

      if (granted.length === 0) {
        throw new SwapKitError("wallet_chain_not_supported", {
          chains: filteredChains,
          scopes,
          wallet: WalletOption.METAMASK,
        });
      }

      const chainWallets = await Promise.all(
        granted.map(async ({ address, chain, scope }) => {
          const disconnect = () => client.disconnect([scope]);

          if (isEVMChain(chain)) {
            const { BrowserProvider } = await import("ethers");
            const eip1193 = makeEip1193ForScope(client, scope, address);
            const browserProvider = new BrowserProvider(eip1193, "any");

            const walletMethods = await getWeb3WalletMethods({
              address,
              chain,
              provider: browserProvider,
              walletProvider: eip1193,
            });
            return { ...walletMethods, address, chain, disconnect, walletType };
          }

          // Solana (and future ecosystems via their own adapter + toolbox).
          const { getSolanaToolbox } = await import("@swapkit/toolboxes/solana");
          const signer = await makeSolanaSigner(client, scope, address);
          const toolbox = getSolanaToolbox({ signer });
          return { ...toolbox, address, chain, disconnect, walletType };
        }),
      );

      for (const chainWallet of chainWallets) addChain(chainWallet);

      return true;
    },
  directSigningSupport: Object.fromEntries([...EVMChains, Chain.Solana].map((chain) => [chain, true])),
  name: "connectMetamask",
  // EVM + Solana under one session. Widen further as non-EVM adapters land.
  supportedChains: [...EVMChains, Chain.Solana],
  walletType: WalletOption.METAMASK,
});

export const METAMASK_SUPPORTED_CHAINS = getWalletSupportedChains(metamaskWallet);
