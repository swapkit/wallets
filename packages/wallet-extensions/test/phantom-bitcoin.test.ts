import { beforeEach, describe, expect, mock, test } from "bun:test";
import { SwapKitError } from "@swapkit/helpers";

// Wallet Standard registry contents, swapped per test.
// Only this test file imports "@wallet-standard/app", so the global mock does not leak.
let walletStandardWallets: unknown[] = [];

mock.module("@wallet-standard/app", () => ({ getWallets: () => ({ get: () => walletStandardWallets }) }));

describe("phantom getBitcoinAccess", () => {
  beforeEach(() => {
    walletStandardWallets = [];
  });

  test("falls back to Wallet Standard when injected provider is absent", async () => {
    const { getBitcoinAccess } = await import("../src/phantom");

    const account = { address: "bc1qpayment", publicKey: new Uint8Array([1]) };
    const connect = mock(async (_input: { purposes: string[] }) => ({ accounts: [account] }));
    const signTransaction = mock(async (_input: unknown) => [{ signedPsbt: new Uint8Array([7, 7, 7]) }]);

    walletStandardWallets = [
      {
        features: {
          "bitcoin:connect": { connect, version: "1.0.0" },
          "bitcoin:signTransaction": { signTransaction, version: "1.0.0" },
        },
        name: "Phantom",
      },
    ];

    // Newer Phantom builds no longer inject window.phantom.bitcoin; only Solana/EVM are injected.
    const access = await getBitcoinAccess({ solana: { isPhantom: true } });

    expect(access.address).toBe("bc1qpayment");
    expect(connect).toHaveBeenCalledWith({ purposes: ["payment"] });

    const signed = await access.signPsbt(new Uint8Array([9, 9]), [0, 1]);

    expect(signTransaction).toHaveBeenCalledWith({
      inputsToSign: [{ account, signingIndexes: [0, 1] }],
      psbt: new Uint8Array([9, 9]),
    });
    expect(signed).toEqual(new Uint8Array([7, 7, 7]));
  });

  test("uses the legacy injected provider when present (regression)", async () => {
    const { getBitcoinAccess } = await import("../src/phantom");

    const requestAccounts = mock(async () => [{ address: "bc1qlegacy" }]);
    const signPSBT = mock(async (_bytes: Uint8Array, _opts: unknown) => new Uint8Array([5, 5]));

    const access = await getBitcoinAccess({ bitcoin: { isPhantom: true, requestAccounts, signPSBT } });

    expect(access.address).toBe("bc1qlegacy");

    const signed = await access.signPsbt(new Uint8Array([9, 9]), [0, 1]);

    expect(signPSBT).toHaveBeenCalledWith(new Uint8Array([9, 9]), {
      inputsToSign: [{ address: "bc1qlegacy", signingIndexes: [0, 1] }],
    });
    expect(signed).toEqual(new Uint8Array([5, 5]));
  });

  test("throws wallet_phantom_not_found when neither path is available", async () => {
    const { getBitcoinAccess } = await import("../src/phantom");
    walletStandardWallets = [];

    expect(getBitcoinAccess({ solana: { isPhantom: true } })).rejects.toThrow(
      new SwapKitError("wallet_phantom_not_found"),
    );
  });

  test("ignores a Wallet Standard wallet missing required bitcoin features", async () => {
    const { getBitcoinAccess } = await import("../src/phantom");

    walletStandardWallets = [
      {
        features: { "bitcoin:connect": { connect: async () => ({ accounts: [] }), version: "1.0.0" } },
        name: "Phantom",
      },
    ];

    expect(getBitcoinAccess({ solana: { isPhantom: true } })).rejects.toThrow(
      new SwapKitError("wallet_phantom_not_found"),
    );
  });

  test("throws core_transaction_failed when Wallet Standard signing returns no result", async () => {
    const { getBitcoinAccess } = await import("../src/phantom");

    const account = { address: "bc1qpayment", publicKey: new Uint8Array([1]) };
    walletStandardWallets = [
      {
        features: {
          "bitcoin:connect": { connect: async () => ({ accounts: [account] }), version: "1.0.0" },
          "bitcoin:signTransaction": { signTransaction: async () => [], version: "1.0.0" },
        },
        name: "Phantom",
      },
    ];

    const access = await getBitcoinAccess({ solana: { isPhantom: true } });

    expect(access.signPsbt(new Uint8Array([9, 9]), [0, 1])).rejects.toThrow(
      new SwapKitError("core_transaction_failed"),
    );
  });
});
