import { describe, expect, it } from "bun:test";
import { base64, hex } from "@scure/base";
import { Chain, SwapKitError } from "@swapkit/helpers";

import {
  decodePublicKey,
  getNearTransactionHash,
  getWalletConnectCosmosAccounts,
  getWalletConnectSignature,
  walletconnectWallet,
  withSessionEvmSigningMethods,
} from "../src/walletconnect";
import { getSupportedMethodsByNamespace } from "../src/walletconnect/namespaces";

describe("withSessionEvmSigningMethods", () => {
  const ETH_ACCOUNT = "eip155:1:0x0676d507de026d5c1d0a4fb6c0e9df5bba18b4d7";
  const BASE_ACCOUNT = "eip155:8453:0x0676d507de026d5c1d0a4fb6c0e9df5bba18b4d7";
  const toolbox = { signMessage: () => Promise.resolve("0xmessage"), signTypedData: () => Promise.resolve("0xtyped") };
  const session = {
    namespaces: {
      eip155: { accounts: [ETH_ACCOUNT, BASE_ACCOUNT], events: [], methods: ["eth_sendTransaction"] },
      "eip155:1": { accounts: [ETH_ACCOUNT], events: [], methods: ["eth_signTypedData_v4", "personal_sign"] },
    },
  } as unknown as Parameters<typeof withSessionEvmSigningMethods>[0]["session"];

  it("requests the signing methods in the eip155 session proposal", () => {
    expect(getSupportedMethodsByNamespace("eip155")).toEqual(
      expect.arrayContaining(["eth_signTypedData_v4", "personal_sign"]),
    );
  });

  it("keeps signing methods on the chain whose session grants them", () => {
    const wallet = withSessionEvmSigningMethods({ chain: Chain.Ethereum, session, toolbox });

    expect(wallet.signTypedData).toBe(toolbox.signTypedData);
    expect(wallet.signMessage).toBe(toolbox.signMessage);
  });

  it("drops signing methods on a chain whose session does not grant them", () => {
    const wallet = withSessionEvmSigningMethods({ chain: Chain.Base, session, toolbox });

    expect(wallet.signTypedData).toBeUndefined();
    expect(wallet.signMessage).toBeUndefined();
  });

  it("drops signing methods on a chain without a session account", () => {
    const wallet = withSessionEvmSigningMethods({ chain: Chain.Polygon, session, toolbox });

    expect(wallet.signTypedData).toBeUndefined();
    expect(wallet.signMessage).toBeUndefined();
  });
});

const compressedPublicKey = Uint8Array.from([2, ...Array.from({ length: 32 }, (_, index) => index + 1)]);

describe("WalletConnect direct signing support", () => {
  it("marks non-EVM chains with WalletConnect signers as direct signing capable", () => {
    const directSigningSupport = walletconnectWallet.connectWalletconnect.directSigningSupport;

    expect(directSigningSupport[Chain.Cosmos]).toBe(true);
    expect(directSigningSupport[Chain.Kujira]).toBe(true);
    expect(directSigningSupport[Chain.Maya]).toBe(true);
    expect(directSigningSupport[Chain.Near]).toBe(true);
    expect(directSigningSupport[Chain.THORChain]).toBe(true);
    expect(directSigningSupport[Chain.Tron]).toBe(true);
  });
});

describe("decodePublicKey", () => {
  it("passes Uint8Array values through", () => {
    expect(decodePublicKey(compressedPublicKey)).toBe(compressedPublicKey);
  });

  it("decodes number arrays", () => {
    expect(decodePublicKey(Array.from(compressedPublicKey))).toEqual(compressedPublicKey);
  });

  it("decodes hex strings with and without a 0x prefix", () => {
    const encoded = hex.encode(compressedPublicKey);

    expect(decodePublicKey(encoded)).toEqual(compressedPublicKey);
    expect(decodePublicKey(`0x${encoded}`)).toEqual(compressedPublicKey);
  });

  it("decodes base64 strings", () => {
    expect(decodePublicKey(base64.encode(compressedPublicKey))).toEqual(compressedPublicKey);
  });

  it("decodes wrapped values", () => {
    expect(decodePublicKey({ value: base64.encode(compressedPublicKey) })).toEqual(compressedPublicKey);
  });

  it("returns undefined for undefined input", () => {
    expect(decodePublicKey(undefined)).toBeUndefined();
  });
});

describe("getWalletConnectCosmosAccounts", () => {
  const address = "cosmos1walletconnect";
  const fallbackAddress = "cosmos1fallback";
  const encodedPublicKey = base64.encode(compressedPublicKey);

  it("parses an array response with a base64 public key", () => {
    expect(getWalletConnectCosmosAccounts([{ address, pubkey: encodedPublicKey }], fallbackAddress)).toEqual([
      { address, algo: "secp256k1", pubkey: compressedPublicKey },
    ]);
  });

  it("parses an accounts wrapper response", () => {
    expect(
      getWalletConnectCosmosAccounts({ accounts: [{ address, publicKey: encodedPublicKey }] }, fallbackAddress),
    ).toEqual([{ address, algo: "secp256k1", pubkey: compressedPublicKey }]);
  });

  it("uses the fallback address when the account omits one", () => {
    expect(getWalletConnectCosmosAccounts([{ pubkey: encodedPublicKey }], fallbackAddress)).toEqual([
      { address: fallbackAddress, algo: "secp256k1", pubkey: compressedPublicKey },
    ]);
  });

  it("rejects accounts without a public key", () => {
    expect(() => getWalletConnectCosmosAccounts([{ address }], fallbackAddress)).toThrow(SwapKitError);
  });

  it("rejects accounts with an empty public key", () => {
    expect(() => getWalletConnectCosmosAccounts([{ address, pubkey: "" }], fallbackAddress)).toThrow(SwapKitError);
    expect(() => getWalletConnectCosmosAccounts([{ address, pubkey: [] }], fallbackAddress)).toThrow(SwapKitError);
  });
});

describe("getNearTransactionHash", () => {
  it("parses a plain string", () => {
    expect(getNearTransactionHash("plain-hash")).toBe("plain-hash");
  });

  it("parses an array-wrapped response", () => {
    expect(getNearTransactionHash(["array-hash"])).toBe("array-hash");
  });

  it("parses transaction outcome IDs", () => {
    expect(getNearTransactionHash({ transaction_outcome: { id: "outcome-hash" } })).toBe("outcome-hash");
  });

  it("parses transaction hashes", () => {
    expect(getNearTransactionHash({ transaction: { hash: "transaction-hash" } })).toBe("transaction-hash");
  });

  it("parses transactionHash values", () => {
    expect(getNearTransactionHash({ transactionHash: "camel-case-hash" })).toBe("camel-case-hash");
  });

  it("parses hash values", () => {
    expect(getNearTransactionHash({ hash: "hash" })).toBe("hash");
  });

  it("prefers the transaction outcome ID when several hashes are present", () => {
    expect(
      getNearTransactionHash({
        hash: "hash",
        transaction: { hash: "transaction-hash" },
        transaction_outcome: { id: "outcome-hash" },
        transactionHash: "camel-case-hash",
      }),
    ).toBe("outcome-hash");
  });

  it("returns an empty string for unparseable objects", () => {
    expect(getNearTransactionHash({ result: "unknown" })).toBe("");
  });
});

describe("getWalletConnectSignature", () => {
  it("passes valid signed responses through", () => {
    const response = {
      signature: {
        pub_key: { type: "tendermint/PubKeySecp256k1", value: base64.encode(compressedPublicKey) },
        signature: "signature",
      },
      signed: { chain_id: "cosmoshub-4" },
    };

    expect(getWalletConnectSignature(response)).toBe(response);
  });

  it("rejects invalid response shapes", () => {
    const invalidResponses: unknown[] = [null, "invalid", { signed: {} }];

    for (const response of invalidResponses) {
      expect(() => getWalletConnectSignature(response)).toThrow(SwapKitError);
    }
  });
});
