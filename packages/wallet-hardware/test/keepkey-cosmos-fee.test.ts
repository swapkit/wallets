import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { KeepKeySdk } from "@keepkey/keepkey-sdk";
import { AssetValue, Chain, FeeOption } from "@swapkit/helpers";
import { DEFAULT_COSMOS_FEE_MAINNET } from "@swapkit/toolboxes/cosmos";

import { cosmosWalletMethods } from "../src/keepkey/chains/cosmos";

type StdFee = { amount: { amount: string; denom: string }[]; gas: string };

const keepkeyAddress = "cosmos1keepkey";
const recipient = "cosmos1recipient";
const assetValue = AssetValue.from({ chain: Chain.Cosmos, value: "0.1" });
const signedFees: StdFee[] = [];

// The KeepKey Desktop REST client: hands out the address and signs whatever amino sign doc it is given.
const sdk = {
  address: { cosmosGetAddress: () => Promise.resolve({ address: keepkeyAddress }) },
  cosmos: {
    cosmosSignAmino: ({ signDoc }: { signDoc: { fee: StdFee } }) => {
      signedFees.push(signDoc.fee);
      return Promise.resolve({ serialized: btoa("signed") });
    },
  },
} as unknown as KeepKeySdk;

// QueryAccountResponse { account: Any(BaseAccount { address, account_number: 17, sequence: 4 }) } in protobuf.
function encodeAccountResponse() {
  const field = (tag: number, bytes: Uint8Array) => [tag, bytes.length, ...bytes];
  const text = (value: string) => new TextEncoder().encode(value);
  const baseAccount = Uint8Array.from([...field(0x0a, text(keepkeyAddress)), 0x18, 17, 0x20, 4]);
  const account = Uint8Array.from([
    ...field(0x0a, text("/cosmos.auth.v1beta1.BaseAccount")),
    ...field(0x12, baseAccount),
  ]);
  return Buffer.from(field(0x0a, account)).toString("base64");
}

// A Cosmos Hub node over Tendermint JSON-RPC; the SwapKit gas endpoint (GET) returns no rate.
function mockCosmosNode(_input: string | URL | Request, init?: RequestInit) {
  if (!init?.body) return Promise.resolve(Response.json([]));

  const { id, method } = JSON.parse(String(init.body)) as { id?: number; method?: string };
  const result =
    method === "abci_query"
      ? { response: { code: 0, height: "1", value: encodeAccountResponse() } }
      : method === "broadcast_tx_sync"
        ? { code: 0, hash: "KEEPKEYTXHASH", log: "" }
        : { node_info: { network: "cosmoshub-4" }, sync_info: { latest_block_height: "1" } };
  return Promise.resolve(Response.json({ id, jsonrpc: "2.0", result }));
}

describe("KeepKey Cosmos transfer fee", () => {
  // The toolbox's shared default fee. Releases before swapkit/sdk#423 already hold the 500 uatom an older connect
  // wrote into it, so it gets another amount here for such a write to show.
  const [sharedDefaultFee] = DEFAULT_COSMOS_FEE_MAINNET.amount as [{ amount: string; denom: string }];
  let sharedDefaultAmount = "";
  let fetchSpy: { mockRestore: () => void } | undefined;

  beforeEach(() => {
    signedFees.length = 0;
    sharedDefaultAmount = sharedDefaultFee.amount;
    sharedDefaultFee.amount = "1400";
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(mockCosmosNode as typeof fetch);
  });

  afterEach(() => {
    sharedDefaultFee.amount = sharedDefaultAmount;
    fetchSpy?.mockRestore();
  });

  it("signs a fee object of its own and leaves the shared default fee as it was", async () => {
    const wallet = await cosmosWalletMethods({ sdk });
    const txHash = await wallet.transfer({ assetValue, recipient });

    expect(txHash).toBe("KEEPKEYTXHASH");
    expect(signedFees[0]).not.toBe(DEFAULT_COSMOS_FEE_MAINNET);
    expect(signedFees[0]?.amount).not.toBe(DEFAULT_COSMOS_FEE_MAINNET.amount);
    expect(DEFAULT_COSMOS_FEE_MAINNET).toEqual({ amount: [{ amount: "1400", denom: "uatom" }], gas: "200000" });
  });

  it("pays the fee of the chosen option, or the fee rate it is given", async () => {
    const wallet = await cosmosWalletMethods({ sdk });
    const fees = await wallet.getFees();
    const feeOf = (amount: string) => ({ amount: [{ amount, denom: "uatom" }], gas: "200000" });

    await wallet.transfer({ assetValue, feeOptionKey: FeeOption.Average, recipient });
    await wallet.transfer({ assetValue, feeOptionKey: FeeOption.Fastest, recipient });
    await wallet.transfer({ assetValue, recipient });
    await wallet.transfer({ assetValue, feeRate: 4321, recipient });

    expect(fees.average.getBaseValue("string")).not.toBe(fees.fastest.getBaseValue("string"));
    expect(signedFees).toEqual([
      feeOf(fees.average.getBaseValue("string")),
      feeOf(fees.fastest.getBaseValue("string")),
      // Like the toolbox's own transfer, no option means Fast.
      feeOf(fees.fast.getBaseValue("string")),
      feeOf("4321"),
    ]);
  });

  it("pays at least the Cosmos Hub feemarket minimum of 0.005 uatom per gas by default", async () => {
    const wallet = await cosmosWalletMethods({ sdk });
    await wallet.transfer({ assetValue, recipient });

    const [fee] = signedFees;
    expect(BigInt(fee?.amount[0]?.amount ?? 0) * 1000n).toBeGreaterThanOrEqual(5n * BigInt(fee?.gas ?? 0));
  });
});
