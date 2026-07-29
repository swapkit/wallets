import { describe, expect, it } from "bun:test";
import { Chain } from "@swapkit/helpers";
import type { PairingTypes, SessionTypes, SignClientTypes } from "@walletconnect/types";

import {
  createWalletconnectConnection,
  DEFAULT_COSMOS_METHODS,
  DEFAULT_EIP_155_EVENTS,
  DEFAULT_EIP155_METHODS,
  DEFAULT_NEAR_METHODS,
  DEFAULT_TRON_METHODS,
  getPreferredPairingTopic,
  getPreferredSession,
  getSessionDirectSigningSupport,
  type WalletconnectLifecycleClient,
} from "../src/walletconnect";
import { chainToChainId } from "../src/walletconnect/helpers";
import {
  getConnectionNamespaces,
  getOptionalNamespaces,
  getSupportedEventsByNamespace,
  getSupportedMethodsByNamespace,
} from "../src/walletconnect/namespaces";

const now = () => Math.floor(Date.now() / 1000);

const metadata: SignClientTypes.Metadata = {
  description: "WalletConnect test client",
  icons: [],
  name: "WalletConnect test",
  url: "https://example.com",
};

const makeSession = ({
  expiry,
  namespaces = {
    eip155: {
      accounts: ["eip155:1:0x123"],
      events: ["accountsChanged", "chainChanged"],
      methods: ["eth_sendTransaction"],
    },
  },
  pairingTopic,
  topic,
}: {
  expiry: number;
  namespaces?: SessionTypes.Namespaces;
  pairingTopic?: string;
  topic: string;
}): SessionTypes.Struct => ({
  acknowledged: true,
  controller: "controller",
  expiry,
  namespaces,
  optionalNamespaces: {},
  pairingTopic: pairingTopic ?? `pairing-${topic}`,
  peer: { metadata, publicKey: "peer-public-key" },
  relay: { protocol: "irn" },
  requiredNamespaces: {},
  self: { metadata, publicKey: "self-public-key" },
  topic,
});

const makePairing = ({
  active = true,
  expiry,
  topic,
}: {
  active?: boolean;
  expiry: number;
  topic: string;
}): PairingTypes.Struct => ({ active, expiry, relay: { protocol: "irn" }, topic });

type LifecycleEvent = "session_delete" | "session_expire" | "session_extend" | "session_update";
type LifecycleListener<Event extends LifecycleEvent> = (args: SignClientTypes.EventArguments[Event]) => void;

const makeLifecycleClient = (storedSessions: SessionTypes.Struct[]) => {
  const listeners = new Map<LifecycleEvent, (args: unknown) => void>();
  const sessions = new Map(storedSessions.map((session) => [session.topic, session]));

  const on: WalletconnectLifecycleClient["on"] = (event, listener) => {
    listeners.set(event, listener as (args: unknown) => void);
  };

  const client = {
    disconnect: async () => undefined,
    on,
    session: {
      get(topic: string) {
        const session = sessions.get(topic);
        if (!session) throw new Error(`Missing session: ${topic}`);
        return session;
      },
      keys: [...sessions.keys()],
    },
  } satisfies WalletconnectLifecycleClient;

  return {
    client,
    emit<Event extends LifecycleEvent>(event: Event, args: SignClientTypes.EventArguments[Event]) {
      const listener = listeners.get(event) as LifecycleListener<Event> | undefined;
      if (!listener) throw new Error(`Missing listener: ${event}`);
      listener(args);
    },
  };
};

describe("WalletConnect namespaces", () => {
  it("includes namespaces introduced only by optional chains", () => {
    const optionalChains = ["eip155:56", "cosmos:cosmoshub-4", "near:mainnet", "tron:0x2b6653dc"];
    const optionalNamespaces = getOptionalNamespaces(["eip155:1"], optionalChains);

    expect(Object.keys(optionalNamespaces)).toEqual(["eip155", "cosmos", "near", "tron"]);
    expect(optionalNamespaces.eip155?.chains).toEqual(["eip155:56"]);
    expect(optionalNamespaces.cosmos?.chains).toEqual(["cosmos:cosmoshub-4"]);
    expect(optionalNamespaces.near?.chains).toEqual(["near:mainnet"]);
    expect(optionalNamespaces.tron?.chains).toEqual(["tron:0x2b6653dc"]);

    expect(optionalNamespaces.eip155?.methods).toEqual(Object.values(DEFAULT_EIP155_METHODS));
    expect(optionalNamespaces.eip155?.events).toEqual(Object.values(DEFAULT_EIP_155_EVENTS));
    expect(optionalNamespaces.cosmos?.methods).toEqual(Object.values(DEFAULT_COSMOS_METHODS));
    expect(optionalNamespaces.cosmos?.events).toEqual([]);
    expect(optionalNamespaces.near?.methods).toEqual(Object.values(DEFAULT_NEAR_METHODS));
    expect(optionalNamespaces.near?.events).toEqual([]);
    expect(optionalNamespaces.tron?.methods).toEqual(Object.values(DEFAULT_TRON_METHODS));
    expect(optionalNamespaces.tron?.events).toEqual([]);
  });

  it("builds required and optional namespace sections", () => {
    expect(
      getConnectionNamespaces({ optionalChains: ["eip155:56", "near:mainnet"], requiredChains: ["eip155:1"] }),
    ).toEqual({
      optionalNamespaces: {
        eip155: {
          chains: ["eip155:56"],
          events: getSupportedEventsByNamespace("eip155"),
          methods: getSupportedMethodsByNamespace("eip155"),
        },
        near: {
          chains: ["near:mainnet"],
          events: getSupportedEventsByNamespace("near"),
          methods: getSupportedMethodsByNamespace("near"),
        },
      },
      requiredNamespaces: {
        eip155: {
          chains: ["eip155:1"],
          events: getSupportedEventsByNamespace("eip155"),
          methods: getSupportedMethodsByNamespace("eip155"),
        },
      },
    });
  });
});

describe("getSessionDirectSigningSupport", () => {
  it("returns true when the approved session grants each signer family's required methods", () => {
    const grants: { chain: Chain; methods: string[]; namespace: string }[] = [
      { chain: Chain.Ethereum, methods: [DEFAULT_EIP155_METHODS.ETH_SEND_TRANSACTION], namespace: "eip155" },
      {
        chain: Chain.Cosmos,
        methods: [DEFAULT_COSMOS_METHODS.COSMOS_SIGN_AMINO, DEFAULT_COSMOS_METHODS.COSMOS_GET_ACCOUNTS],
        namespace: "cosmos",
      },
      { chain: Chain.Near, methods: [DEFAULT_NEAR_METHODS.NEAR_SIGN_AND_SEND_TRANSACTION], namespace: "near" },
      { chain: Chain.Tron, methods: [DEFAULT_TRON_METHODS.TRON_SIGN_TRANSACTION], namespace: "tron" },
    ];

    for (const { chain, methods, namespace } of grants) {
      const chainId = chainToChainId(chain);
      const session = makeSession({
        expiry: now() + 60,
        namespaces: { [namespace]: { accounts: [`${chainId}:account`], events: [], methods } },
        topic: `session-${namespace}`,
      });

      expect(getSessionDirectSigningSupport(chain, session)).toBe(true);
    }
  });

  it("returns false when a required method is missing", () => {
    const chainId = chainToChainId(Chain.Cosmos);
    const session = makeSession({
      expiry: now() + 60,
      namespaces: {
        cosmos: {
          accounts: [`${chainId}:cosmos1walletconnect`],
          events: [],
          methods: [DEFAULT_COSMOS_METHODS.COSMOS_SIGN_AMINO],
        },
      },
      topic: "missing-method",
    });

    expect(getSessionDirectSigningSupport(Chain.Cosmos, session)).toBe(false);
  });

  it("returns false when the approved accounts do not cover the chain", () => {
    const session = makeSession({
      expiry: now() + 60,
      namespaces: {
        cosmos: {
          accounts: [`${chainToChainId(Chain.THORChain)}:thor1walletconnect`],
          events: [],
          methods: [DEFAULT_COSMOS_METHODS.COSMOS_SIGN_AMINO, DEFAULT_COSMOS_METHODS.COSMOS_GET_ACCOUNTS],
        },
      },
      topic: "wrong-account-chain",
    });

    expect(getSessionDirectSigningSupport(Chain.Cosmos, session)).toBe(false);
  });

  it("supports namespaces keyed by the chain CAIP-2 id", () => {
    const chainId = chainToChainId(Chain.Ethereum);
    const session = makeSession({
      expiry: now() + 60,
      namespaces: {
        [chainId]: {
          accounts: [`${chainId}:0x123`],
          events: [],
          methods: [DEFAULT_EIP155_METHODS.ETH_SEND_TRANSACTION],
        },
      },
      topic: "caip2-namespace",
    });

    expect(getSessionDirectSigningSupport(Chain.Ethereum, session)).toBe(true);
  });

  it("unions family and CAIP-2 namespace grants", () => {
    const chainId = chainToChainId(Chain.Cosmos);
    const session = makeSession({
      expiry: now() + 60,
      namespaces: {
        cosmos: {
          accounts: [`${chainId}:cosmos1walletconnect`],
          events: [],
          methods: [DEFAULT_COSMOS_METHODS.COSMOS_SIGN_AMINO],
        },
        [chainId]: { accounts: [], events: [], methods: [DEFAULT_COSMOS_METHODS.COSMOS_GET_ACCOUNTS] },
      },
      topic: "merged-namespaces",
    });

    expect(getSessionDirectSigningSupport(Chain.Cosmos, session)).toBe(true);
  });

  it("does not require cosmos_signDirect for the amino signer path", () => {
    const chainId = chainToChainId(Chain.Cosmos);
    const session = makeSession({
      expiry: now() + 60,
      namespaces: {
        cosmos: {
          accounts: [`${chainId}:cosmos1walletconnect`],
          events: [],
          methods: [DEFAULT_COSMOS_METHODS.COSMOS_SIGN_AMINO, DEFAULT_COSMOS_METHODS.COSMOS_GET_ACCOUNTS],
        },
      },
      topic: "amino-only",
    });

    expect(session.namespaces.cosmos?.methods).not.toContain(DEFAULT_COSMOS_METHODS.COSMOS_SIGN_DIRECT);
    expect(getSessionDirectSigningSupport(Chain.Cosmos, session)).toBe(true);
  });

  it("returns false when the session is undefined", () => {
    expect(getSessionDirectSigningSupport(Chain.Ethereum, undefined)).toBe(false);
  });
});

describe("WalletConnect session reuse", () => {
  it("filters expired sessions and picks the latest expiry", () => {
    const expired = makeSession({ expiry: now() - 1, topic: "expired" });
    const earlier = makeSession({ expiry: now() + 60, topic: "earlier" });
    const later = makeSession({ expiry: now() + 120, topic: "later" });

    expect(getPreferredSession([earlier, expired, later])).toBe(later);
    expect(getPreferredSession([expired])).toBeUndefined();
  });

  it("prefers the most recent unexpired session pairing topic", () => {
    const client = {
      core: { pairing: { getPairings: () => [makePairing({ expiry: now() + 300, topic: "pairing" })] } },
      session: {
        getAll: () => [
          makeSession({ expiry: now() + 60, pairingTopic: "earlier-pairing", topic: "earlier" }),
          makeSession({ expiry: now() - 1, pairingTopic: "expired-pairing", topic: "expired" }),
          makeSession({ expiry: now() + 120, pairingTopic: "later-pairing", topic: "later" }),
        ],
      },
    };

    expect(getPreferredPairingTopic(client)).toBe("later-pairing");
  });

  it("falls back to the most recent active unexpired pairing", () => {
    const client = {
      core: {
        pairing: {
          getPairings: () => [
            makePairing({ active: false, expiry: now() + 300, topic: "inactive" }),
            makePairing({ expiry: now() - 1, topic: "expired" }),
            makePairing({ expiry: now() + 60, topic: "earlier" }),
            makePairing({ expiry: now() + 120, topic: "later" }),
          ],
        },
      },
      session: { getAll: () => [makeSession({ expiry: now() - 1, topic: "expired-session" })] },
    };

    expect(getPreferredPairingTopic(client)).toBe("later");
  });

  it("returns undefined when no reusable session or pairing exists", () => {
    const client = {
      core: {
        pairing: {
          getPairings: () => [
            makePairing({ active: false, expiry: now() + 60, topic: "inactive" }),
            makePairing({ expiry: now() - 1, topic: "expired" }),
          ],
        },
      },
      session: { getAll: () => [] },
    };

    expect(getPreferredPairingTopic(client)).toBeUndefined();
  });
});

describe("createWalletconnectConnection", () => {
  it("clears the current session and accounts on session_delete", () => {
    const session = makeSession({ expiry: now() + 60, topic: "session" });
    const { client, emit } = makeLifecycleClient([session]);
    const walletconnect = createWalletconnectConnection({ client, session });

    emit("session_delete", { id: 1, topic: session.topic });

    expect(walletconnect.session).toBeUndefined();
    expect(walletconnect.accounts).toEqual([]);
  });

  it("clears the current session and accounts on session_expire", () => {
    const session = makeSession({ expiry: now() + 60, topic: "session" });
    const { client, emit } = makeLifecycleClient([session]);
    const walletconnect = createWalletconnectConnection({ client, session });

    emit("session_expire", { topic: session.topic });

    expect(walletconnect.session).toBeUndefined();
    expect(walletconnect.accounts).toEqual([]);
  });

  it("replaces namespaces and re-derives accounts on session_update", () => {
    const session = makeSession({ expiry: now() + 60, topic: "session" });
    const { client, emit } = makeLifecycleClient([session]);
    const walletconnect = createWalletconnectConnection({ client, session });
    const namespaces: SessionTypes.Namespaces = {
      cosmos: { accounts: ["cosmos:cosmoshub-4:cosmos1updated"], events: [], methods: ["cosmos_signAmino"] },
      near: { accounts: ["near:mainnet:updated.near"], events: [], methods: ["near_signAndSendTransaction"] },
    };

    emit("session_update", { id: 1, params: { namespaces }, topic: session.topic });

    expect(walletconnect.session?.namespaces).toBe(namespaces);
    expect(walletconnect.accounts).toEqual(["cosmos:cosmoshub-4:cosmos1updated", "near:mainnet:updated.near"]);
  });

  it("refreshes the stored session on session_extend", () => {
    const session = makeSession({ expiry: now() + 60, topic: "session" });
    const extendedSession = makeSession({ expiry: now() + 300, topic: session.topic });
    const { client, emit } = makeLifecycleClient([extendedSession]);
    const walletconnect = createWalletconnectConnection({ client, session });

    emit("session_extend", { id: 1, topic: session.topic });

    expect(walletconnect.session).toBe(extendedSession);
    expect(walletconnect.session?.expiry).toBe(extendedSession.expiry);
  });
});
