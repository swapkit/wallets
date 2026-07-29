import { describe, expect, it } from "bun:test";
import { base64, hex } from "@scure/base";
import { Chain, SwapKitError } from "@swapkit/helpers";

import {
  decodePublicKey,
  getNearTransactionHash,
  getWalletConnectCosmosAccounts,
  getWalletConnectSignature,
  walletconnectWallet,
} from "../src/walletconnect";

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
