// @ts-nocheck - Test file with intentional mocking of browser globals
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { bech32, hex } from "@scure/base";
import { AssetValue, Chain } from "@swapkit/helpers";
import { Address, beginCell } from "@ton/core";
import { getWallets } from "@wallet-standard/app";

import { getWalletMethods } from "../helpers";
import { okxWallet } from "../index";

const SUI_ADDRESS = `0x${"7".repeat(64)}`;

const RAW_TON_ADDRESS = `0:${"ab".repeat(32)}`;

// CIP-19 mainnet base address test vector
const CARDANO_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";

const SOLANA_ADDRESS = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";

function mockSolanaConnect() {
  return Promise.resolve({ publicKey: { toString: () => SOLANA_ADDRESS } });
}

function mockCardano() {
  return {
    enable: async () => ({
      getChangeAddress: async () => hex.encode(bech32.fromWords(bech32.decode(CARDANO_ADDRESS, 120).words)),
      getNetworkId: async () => 1,
    }),
  };
}

afterEach(() => {
  globalThis.window = undefined;
});

describe("connectOkx", () => {
  function connect(chains: Chain[]) {
    const added = [];
    const connectOkx = okxWallet.connectOkx.connectWallet({ addChain: (wallet) => added.push(wallet) });

    return { added, result: connectOkx(chains) };
  }

  test("keeps the available chains when another chain is missing in the wallet", async () => {
    globalThis.window = { okxwallet: { cardano: mockCardano() } };
    const { added, result } = connect([Chain.Cardano, Chain.Solana]);

    expect(await result).toBe(true);
    expect(added.map(({ chain }) => chain)).toEqual([Chain.Cardano]);
    expect(added[0].address).toBe(CARDANO_ADDRESS);
  });

  test("fails when no chain can be connected", async () => {
    globalThis.window = { okxwallet: {} };

    await expect(connect([Chain.Solana]).result).rejects.toThrow();
  });

  test("fails when the user rejects a chain even if another one connects", async () => {
    const rejection = new Error("User rejected the request");
    globalThis.window = { okxwallet: { cardano: mockCardano(), solana: { connect: () => Promise.reject(rejection) } } };

    await expect(connect([Chain.Cardano, Chain.Solana]).result).rejects.toBe(rejection);
  });

  test("keeps the other chains when TON has no TON Connect manifest", async () => {
    globalThis.window = {
      okxTonWallet: { tonconnect: { restoreConnection: () => Promise.reject(new Error("No session")) } },
      okxwallet: { cardano: mockCardano() },
    };
    const { added, result } = connect([Chain.Ton, Chain.Cardano]);

    expect(await result).toBe(true);
    expect(added.map(({ chain }) => chain)).toEqual([Chain.Cardano]);
  });

  test("asks the wallet for one chain at a time", async () => {
    let pending = 0;
    let maxPending = 0;
    const approve = async <T>(value: T) => {
      pending += 1;
      maxPending = Math.max(maxPending, pending);
      await Bun.sleep(1);
      pending -= 1;
      return value;
    };
    globalThis.window = {
      okxwallet: {
        cardano: { enable: () => approve(mockCardano().enable()) },
        solana: { connect: () => approve(mockSolanaConnect()) },
      },
    };

    await connect([Chain.Cardano, Chain.Solana]).result;

    expect(maxPending).toBe(1);
  });

  test("reads the Starknet account once the wallet has been enabled", async () => {
    const address = `0x${"1".repeat(64)}`;
    const starknet = {
      enable() {
        this.account = { address };
        return Promise.resolve([address]);
      },
    };
    globalThis.window = { okxwallet: { starknet } };
    const { added, result } = connect([Chain.Starknet]);

    expect(await result).toBe(true);
    expect(added[0].address).toBe(address);
  });
});

describe("OKX Sui", () => {
  const unregisterWallets = [];

  function registerSuiWallet({ chains = ["sui:mainnet"], signFeature = true, signedBytes = undefined } = {}) {
    const requests = [];
    const features = {
      "standard:connect": {
        connect: () => {
          requests.push("connect");
          return Promise.resolve({ accounts: [{ address: SUI_ADDRESS, chains }] });
        },
      },
    };
    if (signFeature) {
      features["sui:signTransaction"] = {
        signTransaction: async (input) => {
          const transaction = await input.transaction.toJSON();
          requests.push({ ...input, transaction });
          return { bytes: signedBytes ?? transaction, signature: "c2lnbmF0dXJl" };
        },
      };
    }
    unregisterWallets.push(
      getWallets().register({ accounts: [], chains: ["sui:mainnet"], features, name: "OKX Wallet" }),
    );
    return requests;
  }

  afterEach(() => {
    for (const unregister of unregisterWallets.splice(0)) unregister();
  });

  test("asks the wallet standard account to sign the exact transaction bytes", async () => {
    const requests = registerSuiWallet();

    const wallet = await getWalletMethods(Chain.Sui);
    const signed = await wallet.signTransaction(Uint8Array.from([1, 2, 3]));

    expect(wallet.address).toBe(SUI_ADDRESS);
    expect(requests).toEqual([
      "connect",
      { account: { address: SUI_ADDRESS, chains: ["sui:mainnet"] }, chain: "sui:mainnet", transaction: "AQID" },
    ]);
    expect(signed).toEqual({ bytes: "AQID", signature: "c2lnbmF0dXJl" });
  });

  test("rejects a signature over bytes the wallet changed", async () => {
    registerSuiWallet({ signedBytes: "c2lnbmVk" });

    const wallet = await getWalletMethods(Chain.Sui);

    await expect(wallet.signTransaction(Uint8Array.from([1, 2, 3]))).rejects.toThrow("toolbox_sui_signing_error");
  });

  test("rejects a wallet that only returns non-mainnet accounts", async () => {
    registerSuiWallet({ chains: ["sui:testnet"] });

    await expect(getWalletMethods(Chain.Sui)).rejects.toThrow("wallet_okx_chain_not_supported");
  });

  test("skips Sui without a signing feature and keeps the other chains", async () => {
    const requests = registerSuiWallet({ signFeature: false });
    globalThis.window = { okxwallet: { cardano: mockCardano() } };
    const added = [];
    const connectOkx = okxWallet.connectOkx.connectWallet({ addChain: (wallet) => added.push(wallet) });

    expect(await connectOkx([Chain.Cardano, Chain.Sui])).toBe(true);
    expect(added.map(({ chain }) => chain)).toEqual([Chain.Cardano]);
    expect(requests).toEqual([]);
  });
});

describe("OKX TON", () => {
  function mockTonBridge(requests: unknown[]) {
    globalThis.window = {
      okxTonWallet: {
        tonconnect: {
          restoreConnection: async () => ({
            event: "connect",
            payload: { items: [{ address: RAW_TON_ADDRESS, name: "ton_addr", network: "-239" }] },
          }),
          send: (request) => {
            requests.push(JSON.parse(request.params[0]));
            return Promise.resolve({ id: request.id, result: beginCell().endCell().toBoc().toString("base64") });
          },
        },
      },
    };
  }

  test("sends friendly destinations and returns the message hash", async () => {
    const requests = [];
    mockTonBridge(requests);

    const wallet = await getWalletMethods(Chain.Ton);
    const hash = await wallet.signAndBroadcastTransaction([{ address: RAW_TON_ADDRESS, amount: "1000" }]);

    expect(wallet.address).toBe(Address.parse(RAW_TON_ADDRESS).toString({ bounceable: false, urlSafe: true }));
    expect(requests[0].messages).toEqual([
      { address: Address.parse(RAW_TON_ADDRESS).toString({ bounceable: true, urlSafe: true }), amount: "1000" },
    ]);
    expect(hash).toBe(beginCell().endCell().hash().toString("hex"));
  });

  test.each([0, 130])("rejects send mode %d before reaching the wallet", async (sendMode) => {
    const requests = [];
    mockTonBridge(requests);

    const wallet = await getWalletMethods(Chain.Ton);
    const transaction = { messages: [{ address: RAW_TON_ADDRESS, amount: "1000" }], sendMode };

    await expect(wallet.signAndBroadcastTransaction(transaction)).rejects.toThrow("core_swap_invalid_params");
    expect(requests).toHaveLength(0);
  });

  test("rejects a TON balance sweep before reaching the wallet", async () => {
    const requests = [];
    mockTonBridge(requests);

    const wallet = await getWalletMethods(Chain.Ton);
    const sweep = wallet.transfer({
      assetValue: AssetValue.from({ chain: Chain.Ton, value: "1" }),
      recipient: RAW_TON_ADDRESS,
      sweep: true,
    });

    await expect(sweep).rejects.toThrow("core_swap_invalid_params");
    expect(requests).toHaveLength(0);
  });
});

describe("OKX Cosmos", () => {
  const COSMOS_ADDRESS = "cosmos1okx";
  const RECIPIENT = "cosmos1recipient";
  const refusal = new Error("User rejected the request");
  let fetchSpy: ReturnType<typeof spyOn>;

  function encodeAccountResponse() {
    const field = (tag, bytes) => [tag, bytes.length, ...bytes];
    const text = (value) => new TextEncoder().encode(value);
    const baseAccount = Uint8Array.from([...field(0x0a, text(COSMOS_ADDRESS)), 0x18, 17, 0x20, 4]);
    const account = Uint8Array.from([
      ...field(0x0a, text("/cosmos.auth.v1beta1.BaseAccount")),
      ...field(0x12, baseAccount),
    ]);
    return Buffer.from(field(0x0a, account)).toString("base64");
  }

  function mockCosmosNode(_input, init) {
    if (!init?.body) return Promise.resolve(Response.json([]));

    const { id, method } = JSON.parse(String(init.body));
    const result =
      method === "abci_query"
        ? { response: { code: 0, height: "1", value: encodeAccountResponse() } }
        : { node_info: { network: "cosmoshub-4" }, sync_info: { latest_block_height: "1" } };
    return Promise.resolve(Response.json({ id, jsonrpc: "2.0", result }));
  }

  function mockKeplr(signRequests) {
    const signer = {
      getAccounts: async () => [{ address: COSMOS_ADDRESS, algo: "secp256k1", pubkey: new Uint8Array(33).fill(2) }],
      signAmino: (signerAddress, signDoc) => {
        signRequests.push({ signDoc, signerAddress });
        return Promise.reject(refusal);
      },
    };
    globalThis.window = { okxwallet: { keplr: { enable: async () => {}, getOfflineSignerOnlyAmino: () => signer } } };
  }

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(mockCosmosNode);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("asks the wallet to sign the ATOM amount, recipient and memo it was given", async () => {
    const signRequests = [];
    mockKeplr(signRequests);

    const wallet = await getWalletMethods(Chain.Cosmos);
    const transfer = wallet.transfer({
      assetValue: AssetValue.from({ chain: Chain.Cosmos, value: "0.1" }),
      memo: "okx transfer",
      recipient: RECIPIENT,
    });

    await expect(transfer).rejects.toBe(refusal);
    expect(signRequests).toHaveLength(1);
    expect(signRequests[0].signerAddress).toBe(COSMOS_ADDRESS);
    expect(signRequests[0].signDoc.memo).toBe("okx transfer");
    expect(signRequests[0].signDoc.msgs).toEqual([
      {
        type: "cosmos-sdk/MsgSend",
        value: { amount: [{ amount: "100000", denom: "uatom" }], from_address: COSMOS_ADDRESS, to_address: RECIPIENT },
      },
    ]);
  });

  test("rejects a non-ATOM asset before reaching the wallet", async () => {
    const signRequests = [];
    mockKeplr(signRequests);

    const wallet = await getWalletMethods(Chain.Cosmos);
    fetchSpy.mockClear();
    const transfer = wallet.transfer({
      assetValue: AssetValue.from({ asset: "GAIA.KUJI", value: "0.1" }),
      memo: "okx transfer",
      recipient: RECIPIENT,
    });

    await expect(transfer).rejects.toThrow("wallet_okx_chain_not_supported");
    expect(signRequests).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
