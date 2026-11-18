import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { KeepKeySdk } from "@keepkey/keepkey-sdk";
import { AssetValue, Chain, type GenericTransferParams } from "@swapkit/helpers";
import * as realRippleToolbox from "@swapkit/toolboxes/ripple";

const realRippleToolboxSnapshot = { ...realRippleToolbox };
const keepKeyAddress = "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH";
const recipient = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

const createTransactionCalls: GenericTransferParams[] = [];
const signCalls: Array<Record<string, any>> = [];
const broadcasts: string[] = [];

mock.module("@swapkit/toolboxes/ripple", () => ({
  ...realRippleToolboxSnapshot,
  getRippleToolbox: () => ({
    broadcastTransaction: (txBlobHex: string) => {
      broadcasts.push(txBlobHex);
      return Promise.resolve("XRPTXHASH");
    },
    createTransaction: (params: GenericTransferParams) => {
      createTransactionCalls.push(params);
      return Promise.resolve({
        Account: keepKeyAddress,
        Amount: "1500000",
        Destination: params.recipient,
        Fee: "12",
        Flags: 0,
        LastLedgerSequence: 100,
        Memos: [{ Memo: { MemoData: Buffer.from(params.memo ?? "").toString("hex") } }],
        Sequence: 7,
        TransactionType: "Payment",
      });
    },
  }),
}));

const { rippleWalletMethods } = await import("../src/keepkey/chains/ripple");

const sdk = {
  address: { xrpGetAddress: () => Promise.resolve({ address: keepKeyAddress }) },
  xrp: {
    xrpSignTransaction: mock((request: Record<string, any>) => {
      signCalls.push(request);
      return Promise.resolve(JSON.stringify({ value: { signatures: [{ serializedTx: "EjQ=" }] } }));
    }),
  },
} as unknown as KeepKeySdk;

describe("KeepKey XRP transfer", () => {
  beforeEach(() => {
    createTransactionCalls.length = 0;
    signCalls.length = 0;
    broadcasts.length = 0;
  });

  afterAll(() => {
    mock.module("@swapkit/toolboxes/ripple", () => realRippleToolboxSnapshot);
  });

  it("asks the device to sign the XRP amount, recipient and memo it was given", async () => {
    const wallet = await rippleWalletMethods({ sdk });

    const txHash = await wallet.transfer({
      assetValue: AssetValue.from({ chain: Chain.Ripple, value: "1.5" }),
      memo: "keepkey transfer",
      recipient,
    });

    expect(txHash).toBe("XRPTXHASH");
    expect(createTransactionCalls).toEqual([
      expect.objectContaining({ memo: "keepkey transfer", recipient, sender: keepKeyAddress }),
    ]);
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0]?.payment).toEqual({ amount: "1500000", destination: recipient, destinationTag: "0" });
    expect(signCalls[0]?.tx.value.memo).toBe("keepkey transfer");
    expect(signCalls[0]?.tx.value.msg).toEqual([
      {
        type: "ripple-sdk/MsgSend",
        value: { amount: [{ amount: "1500000", denom: "drop" }], from_address: keepKeyAddress, to_address: recipient },
      },
    ]);
    expect(broadcasts).toEqual(["1234"]);
  });

  it("rejects an issued token before building the payment or reaching the device", async () => {
    const wallet = await rippleWalletMethods({ sdk });

    const transfer = wallet.transfer({
      assetValue: AssetValue.from({ asset: "XRP.RLUSD-rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De", value: "1.5" }),
      memo: "keepkey transfer",
      recipient,
    });

    await expect(transfer).rejects.toThrow("wallet_keepkey_method_not_supported");
    expect(createTransactionCalls).toHaveLength(0);
    expect(signCalls).toHaveLength(0);
  });
});
