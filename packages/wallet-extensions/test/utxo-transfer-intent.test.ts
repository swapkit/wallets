import { describe, expect, test } from "bun:test";
import { Chain } from "@swapkit/helpers";
import { compileMemo, getNetworkForChain } from "@swapkit/toolboxes/utxo";
import { Transaction } from "@swapkit/utxo-signer";
import { extractUtxoTransferIntent, getNativeUtxoAsset } from "../src/helpers/utxoTransferIntent";

const btcSender = "1BoatSLRHtKNngkdXEeobR76b53LETtpyT";
const btcRecipient = "1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp";
const btcChange = "1CounterpartyXXXXXXXXXXXXXXXUWLpVr";

function createBtcTransaction({
  changeAddress = btcSender,
  memo,
  recipient = btcRecipient,
}: {
  changeAddress?: string;
  memo?: string;
  recipient?: string;
} = {}) {
  const tx = new Transaction({ allowUnknownOutputs: true });
  const network = getNetworkForChain(Chain.Bitcoin);

  tx.addOutputAddress(recipient, 12_345n, network);
  tx.addOutputAddress(changeAddress, 67_890n, network);
  if (memo) {
    tx.addOutput({ amount: 0n, script: compileMemo(memo) });
  }

  return tx;
}

describe("extractUtxoTransferIntent", () => {
  test("extracts recipient, amount, memo, and active-address change", () => {
    const intent = extractUtxoTransferIntent({
      chain: Chain.Bitcoin,
      senderAddress: btcSender,
      tx: createBtcTransaction({ memo: "=:ETH.ETH:0xabc" }),
    });

    expect(intent).toEqual({
      amountBase: 12_345n,
      asset: { chain: "BTC", symbol: "BTC", ticker: "BTC" },
      assetValue: intent.assetValue,
      changeOutputs: [{ address: btcSender, amountBase: 67_890n }],
      from: btcSender,
      memo: "=:ETH.ETH:0xabc",
      recipient: btcRecipient,
    });
    expect(intent.assetValue.getBaseValue("string")).toBe("12345");
    expect(intent.assetValue.getValue("string")).toBe("0.00012345");
  });

  test("supports caller-provided change addresses", () => {
    const intent = extractUtxoTransferIntent({
      chain: Chain.Bitcoin,
      changeAddresses: [btcChange],
      senderAddress: btcSender,
      tx: createBtcTransaction({ changeAddress: btcChange }),
    });

    expect(intent.recipient).toBe(btcRecipient);
    expect(intent.changeOutputs).toEqual([{ address: btcChange, amountBase: 67_890n }]);
  });

  test("throws when change cannot be distinguished from a second recipient", () => {
    expect(() =>
      extractUtxoTransferIntent({
        chain: Chain.Bitcoin,
        senderAddress: btcSender,
        tx: createBtcTransaction({ changeAddress: btcChange }),
      }),
    ).toThrow("plugin_swapkit_invalid_transaction");
  });

  test("normalizes Bitcoin Cash cashaddr outputs without prefix", () => {
    const tx = new Transaction({ allowUnknownOutputs: true });
    const network = getNetworkForChain(Chain.BitcoinCash);
    const sender = "qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a";
    const recipient = "qqr0rdn0leya7l7wdpxlzmrz7kwuntda8uljtmlva9";

    tx.addOutputAddress("1dice8EMZmqKvrGE4Qc9bUFf9PX3xaYDp", 20_000n, network);
    tx.addOutputAddress("1BpEi6DfDAUFd7GtittLSdBeYJvcoaVggu", 30_000n, network);

    const intent = extractUtxoTransferIntent({ chain: Chain.BitcoinCash, senderAddress: sender, tx });

    expect(intent.recipient).toBe(recipient);
    expect(intent.changeOutputs).toEqual([{ address: sender, amountBase: 30_000n }]);
    expect(intent.asset).toEqual({ chain: "BCH", symbol: "BCH", ticker: "BCH" });
  });

  test("builds native UTXO asset identifiers", () => {
    expect(getNativeUtxoAsset(Chain.Dogecoin)).toEqual({ chain: "DOGE", symbol: "DOGE", ticker: "DOGE" });
  });
});
