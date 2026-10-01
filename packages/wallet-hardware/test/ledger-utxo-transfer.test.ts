import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { DeviceActionStatus, type DeviceManagementKit } from "@ledgerhq/device-management-kit";
import type { LegacyCreateTransactionArg } from "@ledgerhq/device-signer-kit-zcash";
import * as realZcashSignerKit from "@ledgerhq/device-signer-kit-zcash";
import * as realHwAppBtc from "@ledgerhq/hw-app-btc";
import type { CreateTransactionArg } from "@ledgerhq/hw-app-btc/lib-es/createTransaction";
import { splitTransaction } from "@ledgerhq/hw-app-btc/splitTransaction";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import { AssetValue, Chain, FeeOption, type GenericTransferParams } from "@swapkit/helpers";
import type { UTXOBuildTxParams, UTXOForMultiAddressTransfer, UTXOType } from "@swapkit/toolboxes/utxo";
import * as realUtxoToolbox from "@swapkit/toolboxes/utxo";
import {
  createZcashTransaction,
  Script,
  Transaction,
  ZcashConsensusBranchId,
  ZcashVersionGroupId,
} from "@swapkit/utxo-signer";
import { of } from "rxjs";

// THORChain swap memos: with a price limit, streaming parameters and an affiliate fee, and without a limit.
const SWAP_MEMO = "=:ETH.ETH:0x742d35Cc6634C0532925a3b844Bc454e4438f44e:123456789/3/0:sk:15";
const SWAP_MEMO_WITHOUT_LIMIT = "=:ETH.ETH:0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const P2PKH_SCRIPT = Uint8Array.of(0x76, 0xa9, 0x14, ...new Uint8Array(20).fill(1), 0x88, 0xac);
const FEE_RATES = { [FeeOption.Average]: 10, [FeeOption.Fast]: 15, [FeeOption.Fastest]: 20 };

const dmkSession = { dmk: { id: "utxo-dmk" } as unknown as DeviceManagementKit, sessionId: "utxo-session" };

// A valid account address on each chain. The legacy apps run over an injected LedgerJS transport and Zcash signs
// through its signer kit over a DMK session.
const senders = {
  [Chain.BitcoinCash]: {
    address: "qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a",
    transport: { id: Chain.BitcoinCash } as unknown as Transport,
  },
  [Chain.Dash]: {
    address: "XhmXmZ1mXDRRxw98rmxJJS1zTRqmkdmzTq",
    transport: { id: Chain.Dash } as unknown as Transport,
  },
  [Chain.Dogecoin]: {
    address: "DCDnUZJWrv78Lzj9jUddzfVoWDzP6CX5HT",
    transport: { id: Chain.Dogecoin } as unknown as Transport,
  },
  [Chain.Litecoin]: {
    address: "ltc1qfk47rgkt40ncznlvrjph74wne6qjjl38eqftah",
    transport: { id: Chain.Litecoin } as unknown as Transport,
  },
  [Chain.Zcash]: { address: "t1QxHwdn1XpzSQdbSwKTCaiS7skTAYaYRTR", dmkSession },
} as const;

type LedgerUTXOTestChain = keyof typeof senders;

interface LedgerUTXOTestWallet {
  transfer: (params: GenericTransferParams) => Promise<string>;
  transferFromMultipleAddresses: (params: {
    assetValue: AssetValue;
    recipient: string;
    utxos: UTXOForMultiAddressTransfer[];
  }) => Promise<string>;
}

const createTransactionCalls: UTXOBuildTxParams[] = [];
const btcPaymentCalls: CreateTransactionArg[] = [];
const zcashSignCalls: LegacyCreateTransactionArg[] = [];

function deviceAction<Output>(output: Output) {
  return {
    cancel: mock(() => {}),
    observable: of(
      { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
      { output, status: DeviceActionStatus.Completed },
    ),
  };
}

function uint32LE(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

// A minimal transparent v5 transaction: the previous transaction a Zcash input spends, and the device's reply.
function v5Transaction(amount: bigint) {
  const value = new Uint8Array(8);
  new DataView(value.buffer).setBigUint64(0, amount, true);
  return hex.encode(
    Uint8Array.from([
      ...uint32LE(0x80000005),
      ...uint32LE(ZcashVersionGroupId.NU5),
      ...uint32LE(ZcashConsensusBranchId.NU6_2),
      ...uint32LE(0),
      ...uint32LE(3_364_700),
      0,
      1,
      ...value,
      P2PKH_SCRIPT.length,
      ...P2PKH_SCRIPT,
      0,
      0,
      0,
    ]),
  );
}

// An output of a funding transaction, with the full previous transaction the legacy apps stream.
function fundingUtxo({ fill, value }: { fill: number; value: number }): UTXOType {
  const funding = new Transaction({ allowLegacyWitnessUtxo: true });
  funding.addInput({ index: 0, txid: new Uint8Array(32).fill(fill) });
  funding.addOutput({ amount: BigInt(value), script: P2PKH_SCRIPT });
  return { hash: funding.id, index: 0, txHex: hex.encode(funding.unsignedTx), value };
}

// Mirrors the toolbox: one input, the recipient output, then the OP_RETURN compiled from the memo it was given.
function buildTransaction({ assetValue, memo, recipient, sender }: UTXOBuildTxParams) {
  const compiledMemo = memo ? realUtxoToolbox.compileMemo(memo) : null;
  const amount = assetValue.getBaseValue("bigint");

  if (assetValue.chain === Chain.Zcash) {
    const tx = createZcashTransaction({
      consensusBranchId: ZcashConsensusBranchId.NU6_2,
      expiryHeight: 0,
      lockTime: 0,
      version: 4,
      versionGroupId: ZcashVersionGroupId.SAPLING,
    });
    tx.addInput({ index: 0, script: P2PKH_SCRIPT, txid: new Uint8Array(32).fill(7), value: 10_000n });
    tx.addOutput({ amount, script: P2PKH_SCRIPT });
    if (compiledMemo) tx.addOutput({ amount: 0n, script: compiledMemo });
    return { inputs: [{ hash: "07".repeat(32), index: 0, txHex: v5Transaction(10_000n), value: 10_000 }], tx };
  }

  const utxo = fundingUtxo({ fill: 9, value: 10_000 });
  const tx = new Transaction({ allowUnknownOutputs: !!compiledMemo, version: 1 });
  realUtxoToolbox.addInputsAndOutputs({
    chain: assetValue.chain as LedgerUTXOTestChain,
    compiledMemo,
    inputs: [utxo],
    outputs: [
      { address: recipient, value: Number(amount) },
      ...(compiledMemo ? [{ script: compiledMemo, value: 0 }] : []),
    ],
    sender: sender ?? recipient,
    tx,
  });
  return { inputs: [utxo], tx };
}

// Reads the OP_RETURN payloads back out of the serialised outputs the device is asked to sign. These
// transactions carry a few short scripts, so every count and length is a one-byte CompactSize.
function signedMemos(outputScriptHex: string) {
  const bytes = hex.decode(outputScriptHex);
  const memos: string[] = [];
  let offset = 1;
  for (let output = 0; output < (bytes[0] ?? 0); output++) {
    const scriptLength = bytes[offset + 8] ?? 0;
    const script = bytes.slice(offset + 9, offset + 9 + scriptLength);
    offset += 9 + scriptLength;
    const [opcode, data] = Script.decode(script);
    if (opcode === "RETURN" && data instanceof Uint8Array) memos.push(new TextDecoder().decode(data));
  }
  return memos;
}

// mock.module replaces the whole export namespace process-wide; snapshot the real modules so
// afterAll can restore them for test files that run later.
const realZcashSignerKitSnapshot = { ...realZcashSignerKit };
const realHwAppBtcSnapshot = { ...realHwAppBtc };
const realUtxoToolboxSnapshot = { ...realUtxoToolbox };

mock.module("@ledgerhq/device-signer-kit-zcash", () => ({
  ...realZcashSignerKitSnapshot,
  SignerZcashBuilder: class MockSignerZcashBuilder {
    build() {
      return {
        signTransaction: (args: LegacyCreateTransactionArg) => {
          zcashSignCalls.push(args);
          return deviceAction(`0x${v5Transaction(9_000n)}`);
        },
      };
    }
  },
}));

mock.module("@ledgerhq/hw-app-btc", () => ({
  default: class MockBitcoinApp {
    splitTransaction = splitTransaction;
    createPaymentTransaction = (arg: CreateTransactionArg) => {
      btcPaymentCalls.push(arg);
      return Promise.resolve("signed-legacy-transaction");
    };
  },
}));

mock.module("@swapkit/toolboxes/utxo", () => ({
  ...realUtxoToolboxSnapshot,
  getUtxoToolbox: () => ({
    accumulative: realUtxoToolboxSnapshot.accumulative,
    broadcastTx: (txHex: string) => Promise.resolve(`broadcast:${txHex.length}`),
    createTransaction: (params: UTXOBuildTxParams) => {
      createTransactionCalls.push(params);
      return Promise.resolve(buildTransaction(params));
    },
    getBalance: () => Promise.resolve([]),
    getFeeRates: () => Promise.resolve(FEE_RATES),
  }),
}));

import { ledgerWallet } from "../src/ledger/index";

async function connect(chain: LedgerUTXOTestChain) {
  const addChain = mock((_wallet: LedgerUTXOTestWallet) => {});
  const connectLedger = ledgerWallet.connectLedger.connectWallet({ addChain: addChain as never });

  await connectLedger([chain], undefined, senders[chain]);
  const wallet = addChain.mock.calls[0]?.[0];
  if (!wallet) throw new Error(`${chain} wallet was not added`);
  return wallet;
}

function deviceOutputs(chain: LedgerUTXOTestChain) {
  const call = chain === Chain.Zcash ? zcashSignCalls[0] : btcPaymentCalls[0];
  return call?.outputScriptHex ?? "";
}

describe("Ledger UTXO transfer", () => {
  beforeEach(() => {
    createTransactionCalls.length = 0;
    btcPaymentCalls.length = 0;
    zcashSignCalls.length = 0;
  });

  const memoCases = ([Chain.BitcoinCash, Chain.Dash, Chain.Dogecoin, Chain.Litecoin, Chain.Zcash] as const).flatMap(
    (chain) => [[chain, SWAP_MEMO] as const, [chain, SWAP_MEMO_WITHOUT_LIMIT] as const],
  );

  it.each(memoCases)("asks the device to sign the %s route memo unchanged: %s", async (chain, memo) => {
    const wallet = await connect(chain);

    await wallet.transfer({
      assetValue: AssetValue.from({ chain, value: "0.00009" }),
      memo,
      recipient: senders[chain].address,
    });

    expect(createTransactionCalls[0]?.memo).toBe(memo);
    expect(signedMemos(deviceOutputs(chain))).toEqual([memo]);
  });

  it.each([
    ["the toolbox default", {}, FEE_RATES[FeeOption.Fast]],
    ["an average fee option", { feeOptionKey: FeeOption.Average }, FEE_RATES[FeeOption.Average]],
    ["a fastest fee option", { feeOptionKey: FeeOption.Fastest }, FEE_RATES[FeeOption.Fastest]],
    ["an explicit fee rate", { feeOptionKey: FeeOption.Fastest, feeRate: 7 }, 7],
  ] as const)("pays the fee rate of %s", async (_case, fee, expected) => {
    const wallet = await connect(Chain.BitcoinCash);

    await wallet.transfer({
      ...fee,
      assetValue: AssetValue.from({ chain: Chain.BitcoinCash, value: "0.00009" }),
      recipient: senders[Chain.BitcoinCash].address,
    });

    expect(createTransactionCalls[0]?.feeRate).toBe(expected);
  });

  it("signs each input of a multi-address transfer with the path of its own address", async () => {
    const wallet = await connect(Chain.BitcoinCash);
    const address = senders[Chain.BitcoinCash].address;

    await wallet.transferFromMultipleAddresses({
      assetValue: AssetValue.from({ chain: Chain.BitcoinCash, value: "0.0015" }),
      recipient: address,
      utxos: [
        { ...fundingUtxo({ fill: 1, value: 100_000 }), address, derivationIndex: 7, isChange: false },
        { ...fundingUtxo({ fill: 2, value: 100_000 }), address, derivationIndex: 3, isChange: true },
      ],
    });

    // Keyed by the funding transaction each input spends, which the test fills with one byte.
    const payment = btcPaymentCalls[0];
    const pathsByFunding = Object.fromEntries(
      payment?.inputs.map(([previous], inputIndex) => [
        previous.inputs[0]?.prevout[0],
        payment.associatedKeysets[inputIndex],
      ]) ?? [],
    );
    expect(pathsByFunding).toEqual({ 1: "m/44'/145'/0'/0/7", 2: "m/44'/145'/0'/1/3" });
  });

  it("refuses a multi-address input with a negative address index before reaching the device", async () => {
    const wallet = await connect(Chain.BitcoinCash);
    const address = senders[Chain.BitcoinCash].address;

    await expect(
      wallet.transferFromMultipleAddresses({
        assetValue: AssetValue.from({ chain: Chain.BitcoinCash, value: "0.0005" }),
        recipient: address,
        utxos: [{ ...fundingUtxo({ fill: 1, value: 100_000 }), address, derivationIndex: -1, isChange: false }],
      }),
    ).rejects.toThrow(RangeError);
    expect(btcPaymentCalls).toHaveLength(0);
  });
});

afterAll(() => {
  mock.module("@ledgerhq/device-signer-kit-zcash", () => realZcashSignerKitSnapshot);
  mock.module("@ledgerhq/hw-app-btc", () => realHwAppBtcSnapshot);
  mock.module("@swapkit/toolboxes/utxo", () => realUtxoToolboxSnapshot);
});
