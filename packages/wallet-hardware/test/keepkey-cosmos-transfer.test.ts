import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { KeepKeySdk } from "@keepkey/keepkey-sdk";
import { AssetValue, Chain, GAIAConfig } from "@swapkit/helpers";

import { cosmosWalletMethods } from "../src/keepkey/chains/cosmos";

const keepKeyAddress = "cosmos1keepkey";
const recipient = "cosmos1recipient";

function encodeAccountResponse() {
  const field = (tag: number, bytes: Uint8Array) => [tag, bytes.length, ...bytes];
  const text = (value: string) => new TextEncoder().encode(value);
  const baseAccount = Uint8Array.from([...field(0x0a, text(keepKeyAddress)), 0x18, 17, 0x20, 4]);
  const account = Uint8Array.from([
    ...field(0x0a, text("/cosmos.auth.v1beta1.BaseAccount")),
    ...field(0x12, baseAccount),
  ]);
  return Buffer.from(field(0x0a, account)).toString("base64");
}

const nodeRequests: string[] = [];

function mockCosmosNode(_input: string | URL | Request, init?: RequestInit) {
  if (!init?.body) return Promise.resolve(Response.json([]));

  const { id, method } = JSON.parse(String(init.body)) as { id?: number; method?: string };
  nodeRequests.push(method ?? "");

  const result =
    method === "abci_query"
      ? { response: { code: 0, height: "1", value: encodeAccountResponse() } }
      : { node_info: { network: "cosmoshub-4" }, sync_info: { latest_block_height: "1" } };
  return Promise.resolve(Response.json({ id, jsonrpc: "2.0", result }));
}

const deviceRefusal = new Error("refused on device");
const signCalls: unknown[] = [];

const sdk = {
  address: { cosmosGetAddress: () => Promise.resolve({ address: keepKeyAddress }) },
  cosmos: {
    cosmosSignAmino: mock((request: unknown) => {
      signCalls.push(request);
      return Promise.reject(deviceRefusal);
    }),
  },
} as unknown as KeepKeySdk;

describe("KeepKey Cosmos transfer", () => {
  let fetchSpy: { mockRestore: () => void } | undefined;

  beforeEach(() => {
    signCalls.length = 0;
    nodeRequests.length = 0;
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(mockCosmosNode as typeof fetch);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("asks the device to sign the ATOM amount, recipient and memo it was given", async () => {
    const wallet = await cosmosWalletMethods({ sdk });

    const transfer = wallet.transfer({
      assetValue: AssetValue.from({ chain: Chain.Cosmos, value: "0.1" }),
      memo: "keepkey transfer",
      recipient,
    });

    await expect(transfer).rejects.toBe(deviceRefusal);
    expect(signCalls).toEqual([
      {
        signDoc: expect.objectContaining({
          account_number: "17",
          chain_id: GAIAConfig.chainId,
          memo: "keepkey transfer",
          msgs: [
            {
              type: "cosmos-sdk/MsgSend",
              value: {
                amount: [{ amount: "100000", denom: "uatom" }],
                from_address: keepKeyAddress,
                to_address: recipient,
              },
            },
          ],
          sequence: "4",
        }),
        signerAddress: keepKeyAddress,
      },
    ]);
  });

  it("rejects a non-ATOM asset before reaching the node or the device", async () => {
    const wallet = await cosmosWalletMethods({ sdk });
    nodeRequests.length = 0;

    const transfer = wallet.transfer({
      assetValue: AssetValue.from({ asset: "GAIA.KUJI", value: "0.1" }),
      memo: "keepkey transfer",
      recipient,
    });

    await expect(transfer).rejects.toThrow("wallet_keepkey_method_not_supported");
    expect(signCalls).toHaveLength(0);
    expect(nodeRequests).toHaveLength(0);
  });
});
