import { afterEach, describe, expect, mock, test } from "bun:test";
import { SwapKitError } from "@swapkit/helpers";
import { getWallets } from "@wallet-standard/app";

type WalletStandardWallet = Parameters<ReturnType<typeof getWallets>["register"]>[0];
type WalletStandardAccount = WalletStandardWallet["accounts"][number];

const BITCOIN_CHAIN = "bitcoin:mainnet";
const BITCOIN_FEATURES = ["bitcoin:connect", "bitcoin:signTransaction"] as const;
const PHANTOM_ICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=" as const;

type BitcoinConnectInput = { readonly purposes: ("payment" | "ordinals")[] };
type BitcoinConnectOutput = { readonly accounts: readonly WalletStandardAccount[] };
type BitcoinSignTransactionInput = {
  readonly inputsToSign: {
    readonly account: WalletStandardAccount;
    readonly signingIndexes: number[];
    readonly sigHash?: "ALL" | "NONE" | "SINGLE" | "ALL|ANYONECANPAY" | "NONE|ANYONECANPAY" | "SINGLE|ANYONECANPAY";
  }[];
  readonly psbt: Uint8Array;
  readonly chain?: string;
};
type BitcoinSignTransactionOutput = { readonly signedPsbt: Uint8Array };
type BitcoinStandardFeatures = {
  readonly "bitcoin:connect": {
    readonly version: "1.0.0";
    readonly connect: (input: BitcoinConnectInput) => Promise<BitcoinConnectOutput>;
  };
  readonly "bitcoin:signTransaction": {
    readonly version: "1.0.0";
    readonly signTransaction: (
      ...inputs: readonly BitcoinSignTransactionInput[]
    ) => Promise<readonly BitcoinSignTransactionOutput[]>;
  };
};

const unregisterWallets: (() => void)[] = [];

function ensureWalletStandardWindowEvents() {
  const windowObject = globalThis.window as
    | ({ addEventListener?: unknown; dispatchEvent?: unknown } & Record<string, unknown>)
    | undefined;

  if (!windowObject) return;
  if (typeof windowObject.addEventListener !== "function") {
    windowObject.addEventListener = () => undefined;
  }
  if (typeof windowObject.dispatchEvent !== "function") {
    windowObject.dispatchEvent = () => true;
  }
}

function createAccount(address = "bc1qpayment"): WalletStandardAccount {
  return { address, chains: [BITCOIN_CHAIN], features: BITCOIN_FEATURES, publicKey: new Uint8Array([1]) };
}

function registerWallet(wallet: WalletStandardWallet) {
  ensureWalletStandardWindowEvents();
  unregisterWallets.push(getWallets().register(wallet));
}

describe("phantom getBitcoinAccess", () => {
  afterEach(() => {
    for (const unregisterWallet of unregisterWallets.splice(0)) {
      unregisterWallet();
    }
  });

  test("falls back to Wallet Standard when injected provider is absent", async () => {
    const { getBitcoinAccess } = await import("../src/phantom");

    const account = createAccount();
    const connect = mock(async (_input: BitcoinConnectInput) => ({ accounts: [account] }));
    const signTransaction = mock(async (_input: BitcoinSignTransactionInput) => [
      { signedPsbt: new Uint8Array([7, 7, 7]) },
    ]);

    registerWallet({
      accounts: [],
      chains: [BITCOIN_CHAIN],
      features: {
        "bitcoin:connect": { connect, version: "1.0.0" },
        "bitcoin:signTransaction": { signTransaction, version: "1.0.0" },
      },
      icon: PHANTOM_ICON,
      name: "Phantom",
      version: "1.0.0",
    } satisfies WalletStandardWallet & { readonly features: BitcoinStandardFeatures });

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

    await expect(getBitcoinAccess({ solana: { isPhantom: true } })).rejects.toThrow(
      new SwapKitError("wallet_phantom_not_found"),
    );
  });

  test("ignores a Wallet Standard wallet missing required bitcoin features", async () => {
    const { getBitcoinAccess } = await import("../src/phantom");

    registerWallet({
      accounts: [],
      chains: [BITCOIN_CHAIN],
      features: { "bitcoin:connect": { connect: async () => ({ accounts: [] }), version: "1.0.0" } },
      icon: PHANTOM_ICON,
      name: "Phantom",
      version: "1.0.0",
    } satisfies WalletStandardWallet);

    await expect(getBitcoinAccess({ solana: { isPhantom: true } })).rejects.toThrow(
      new SwapKitError("wallet_phantom_not_found"),
    );
  });

  test("throws core_transaction_failed when Wallet Standard signing returns no result", async () => {
    const { getBitcoinAccess } = await import("../src/phantom");

    const account = createAccount();
    registerWallet({
      accounts: [],
      chains: [BITCOIN_CHAIN],
      features: {
        "bitcoin:connect": { connect: async () => ({ accounts: [account] }), version: "1.0.0" },
        "bitcoin:signTransaction": { signTransaction: async () => [], version: "1.0.0" },
      },
      icon: PHANTOM_ICON,
      name: "Phantom",
      version: "1.0.0",
    } satisfies WalletStandardWallet & { readonly features: BitcoinStandardFeatures });

    const access = await getBitcoinAccess({ solana: { isPhantom: true } });

    await expect(access.signPsbt(new Uint8Array([9, 9]), [0, 1])).rejects.toThrow(
      new SwapKitError("core_transaction_failed"),
    );
  });
});
