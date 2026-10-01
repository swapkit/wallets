import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  DeviceActionStatus,
  type DeviceManagementKit,
  type InternalApi,
  isSuccessDmkResult,
} from "@ledgerhq/device-management-kit";
import * as realZcashSignerKit from "@ledgerhq/device-signer-kit-zcash";
// The real task behind SignerZcash.signTransaction, so previous transactions go through the DSK's own framing.
import { SignTransactionTask } from "@ledgerhq/device-signer-kit-zcash/internal/app-binder/task/SignTransactionTask.js";
import type Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import { utils, ZcashConsensusBranchId, ZcashTransaction, ZcashVersionGroupId } from "@swapkit/utxo-signer";
import { from, map, of } from "rxjs";

const addressCalls: Array<{ options?: { checkOnDevice?: boolean }; path: string }> = [];
const signCalls: unknown[] = [];
let signedRaw = "";
let emulatedApp: ReturnType<typeof emulatedZcashApp> | undefined;

function deviceAction<Output>(output: Output) {
  return {
    cancel: mock(() => {}),
    observable: of(
      { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
      { output, status: DeviceActionStatus.Completed },
    ),
  };
}

// mock.module replaces the whole export namespace process-wide; snapshot the real module so
// afterAll can restore it for test files that run later.
const realZcashSignerKitSnapshot = { ...realZcashSignerKit };

mock.module("@ledgerhq/device-signer-kit-zcash", () => ({
  ...realZcashSignerKitSnapshot,
  SignerZcashBuilder: class MockSignerZcashBuilder {
    build() {
      return {
        getAddress: (path: string, options?: { checkOnDevice?: boolean }) => {
          addressCalls.push({ options, path });
          return deviceAction({
            address: "t1ledgerdsk",
            chainCode: new Uint8Array(32).fill(3),
            publicKey: Uint8Array.from([4, ...new Uint8Array(64).fill(5)]),
          });
        },
        signTransaction: (args: LegacyCreateTransactionArg) => {
          signCalls.push(args);
          if (!emulatedApp) return deviceAction(`0x${signedRaw}`);

          const task = new SignTransactionTask(emulatedApp.api, { transactionArg: args });
          return {
            cancel: mock(() => {}),
            observable: from(task.run()).pipe(
              map((result) =>
                isSuccessDmkResult(result)
                  ? { output: result.data, status: DeviceActionStatus.Completed }
                  : { error: result.error, status: DeviceActionStatus.Error },
              ),
            ),
          };
        },
      };
    }
  },
}));

import type { LegacyCreateTransactionArg } from "@ledgerhq/device-signer-kit-zcash";
import { ZcashLedger } from "../src/ledger/clients/zcash";

const dmkSession = { dmk: { id: "zcash-dmk" } as unknown as DeviceManagementKit, sessionId: "zec-session" };

// Mainnet v4 transaction c16f0e1f…31836b (height 3363685), as in the Zcash DSK's own Ledger Wallet fixture.
const MAINNET_V4_TXID = "c16f0e1f7d53264e78c9e5c2a6fc7fa9da3293a4db7d89bd720dbfc71131836b";
const MAINNET_V4_SIGHASH_AND_PUBLIC_KEY = "012102106a2dcaaac2ae3b24358a03f4264e05db420c5b090399bc23885fa02fef7716";
const MAINNET_V4_TRANSACTION = hex.decode(
  [
    "0400008085202f8903",
    "82408554fb2a500ebe031e6a0a0265d8f3068e14ebf1508b351bf60142388c39000000006a47304402203ab7d1e8fadb344bf8c4903ec741",
    `b048498ab15568007757d2894b37c720de0b02201d94abd82f6974f9603359360ac13c4ff6c17fb729e0e2332358da1d94b91b03${MAINNET_V4_SIGHASH_AND_PUBLIC_KEY}`,
    "ffffffff",
    "440461b63758819b115b4621886e158d7e7b1ccad87143b819abf4b6da095eac000000006a47304402205f3161a994b848c63dc7b24836c6",
    `8582b91649394f9134d651708f987c2e567e02204f15c5cd540d482c681217975e728dd0f26161bcf60239b48fe87e7c4148be8f${MAINNET_V4_SIGHASH_AND_PUBLIC_KEY}`,
    "ffffffff",
    "f6bbd8b5f5413ff1405539c1d70ea1a4a053813e9d92be34ad21733d603564c4010000006b4830450221009ef05270bd4fcdd640a6bd7e2f",
    `6545a856b57118e7579c2a2d5e73981082f8f802201af78b51bcd3f99d64ad1f9f93273bc612953a3c3742d317c2cf719421b79d45${MAINNET_V4_SIGHASH_AND_PUBLIC_KEY}`,
    "ffffffff",
    "0206306900000000001976a9147bf8c56b5c5c57e63e7d7cffffaeaa03e82f99ae88ac",
    "b0bf8b72000000001976a9141634f5ff0b8f6603a17570436d6c12a91f4b1fed88ac",
    // nLockTime, nExpiryHeight, value balance, then no Sapling spends, Sapling outputs or JoinSplits
    "00000000000000000000000000000000000000",
  ].join(""),
);

function uint32LE(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function uint64LE(value: bigint) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function realV5Transaction({
  branchId = ZcashConsensusBranchId.NU6_2,
  expiryHeight = 3_364_700,
  outputAmount = 5_000n,
  outputScript = Uint8Array.of(0x51),
}: {
  branchId?: number;
  expiryHeight?: number;
  outputAmount?: bigint;
  outputScript?: Uint8Array;
} = {}) {
  return hex.encode(
    Uint8Array.from([
      ...uint32LE(0x80000005),
      ...uint32LE(ZcashVersionGroupId.NU5),
      ...uint32LE(branchId),
      ...uint32LE(0),
      ...uint32LE(expiryHeight),
      0,
      1,
      ...uint64LE(outputAmount),
      outputScript.length,
      ...outputScript,
      0,
      0,
      0,
    ]),
  );
}

// Distinct locktime and expiry height, so swapping them changes the bytes the device hashes.
function v4Transaction({ header = 0x80000004 }: { header?: number } = {}) {
  const scriptSig = Uint8Array.from([0x47, ...new Uint8Array(71).fill(0x30), 0x21, ...new Uint8Array(33).fill(2)]);
  return Uint8Array.from([
    ...uint32LE(header),
    ...uint32LE(ZcashVersionGroupId.SAPLING),
    1,
    ...new Uint8Array(32).fill(9),
    ...uint32LE(1),
    scriptSig.length,
    ...scriptSig,
    ...uint32LE(0xfffffffe),
    2,
    ...uint64LE(5_000n),
    1,
    0x51,
    ...uint64LE(70_000n),
    1,
    0x52,
    ...uint32LE(3_099_990),
    ...uint32LE(3_100_000),
    // Value balance, then no Sapling spends, Sapling outputs or JoinSplits
    ...uint64LE(0n),
    0,
    0,
    0,
  ]);
}

// What the device must be streamed for a v4 that, like both fixtures, carries 11 bytes after nExpiryHeight:
// version | nVersionGroupId | consensus branch id (the DSK default, Ironwood, without a per-input block height) |
// transparent body | three empty shielded counts | nLockTime | compact size | nExpiryHeight | the bytes after it.
function ledgerV4TrustedInputStream(wire: Uint8Array) {
  const transparentEnd = wire.length - 19;
  return Uint8Array.from([
    ...wire.slice(0, 8),
    ...uint32LE(ZcashConsensusBranchId.IRONWOOD),
    ...wire.slice(8, transparentEnd),
    0,
    0,
    0,
    ...wire.slice(transparentEnd, transparentEnd + 4),
    15,
    ...wire.slice(transparentEnd + 4),
  ]);
}

function displayTxid(wire: Uint8Array) {
  return hex.encode(utils.sha256x2(wire).reverse());
}

type EmulatedCommand = {
  getApdu: () => { getRawApdu: () => Uint8Array };
  name: string;
  parseResponse: (response: { data: Uint8Array; statusCode: Uint8Array }) => unknown;
};

// Answers the real SignTransactionTask the way the Zcash app does and records each GET_TRUSTED_INPUT stream,
// i.e. the previous transaction bytes the device hashes into the txid of its trusted input.
function emulatedZcashApp(trustedOutpoints: Uint8Array[]) {
  const trustedInputStreams: Uint8Array[] = [];

  function answer(command: EmulatedCommand) {
    const apdu = command.getApdu().getRawApdu();
    const data = apdu.slice(5);
    const respond = (bytes: Uint8Array) =>
      command.parseResponse({ data: bytes, statusCode: Uint8Array.of(0x90, 0x00) });

    if (command.name === "GetTrustedInput") {
      // P1 0x00 opens a stream, prefixed with the big-endian output index
      if (apdu[2] === 0x00) {
        trustedInputStreams.push(data.slice(4));
      } else {
        trustedInputStreams.push(Uint8Array.from([...(trustedInputStreams.pop() ?? []), ...data]));
      }
      const outpoint = trustedOutpoints[trustedInputStreams.length - 1] ?? new Uint8Array(36);
      // magic | random | txid | output index | amount | HMAC
      return respond(Uint8Array.from([0x32, 0x00, 0xab, 0xcd, ...outpoint, ...new Uint8Array(16)]));
    }
    if (command.name === "GetAddress") {
      const address = new TextEncoder().encode("t1ledgerdsk");
      return respond(
        Uint8Array.from([
          65,
          4,
          ...new Uint8Array(64).fill(5),
          address.length,
          ...address,
          ...new Uint8Array(32).fill(3),
        ]),
      );
    }
    if (command.name === "SignTransaction") return respond(Uint8Array.of(0x31, 6, 2, 1, 1, 2, 1, 1, 1));
    return respond(new Uint8Array());
  }

  const api = {
    getDeviceSessionState: () => ({ currentApp: { name: "Zcash", version: "3.0.1" } }),
    sendCommand: (command: EmulatedCommand) => Promise.resolve(answer(command)),
  };

  return { api: api as unknown as InternalApi, trustedInputStreams };
}

function targetTransaction(consensusBranchId: number = ZcashConsensusBranchId.NU6_2) {
  const tx = new ZcashTransaction({
    consensusBranchId,
    expiryHeight: consensusBranchId === ZcashConsensusBranchId.NU6_2 ? 3_364_701 : 3_428_200,
    lockTime: 12,
    version: 5,
    versionGroupId: ZcashVersionGroupId.NU5,
  });
  tx.addInput({ index: 0, sequence: 0xfffffffd, txid: new Uint8Array(32).fill(7), value: 5_000n });
  tx.addOutput({ amount: 4_500n, script: Uint8Array.of(0x51) });
  return tx;
}

function inputUtxo(txHex = realV5Transaction(), hash = "07".repeat(32)): UTXOType {
  return { hash, index: 0, txHex, value: 5_000 };
}

// A planned transaction spending output 1 of a previous transaction, with a display-order txid as the toolbox builds.
function spendOutputOne(previous: Uint8Array, amount: bigint) {
  const txid = displayTxid(previous);
  const tx = new ZcashTransaction({
    consensusBranchId: ZcashConsensusBranchId.IRONWOOD,
    expiryHeight: 3_428_200,
    version: 5,
    versionGroupId: ZcashVersionGroupId.NU5,
  });
  tx.addInput({ index: 1, sequence: 0xfffffffd, txid: hex.decode(txid), value: amount });
  tx.addOutput({ amount: amount - 10_000n, script: Uint8Array.of(0x51) });
  return { inputUtxos: [{ hash: txid, index: 1, txHex: hex.encode(previous), value: Number(amount) }], tx };
}

describe("Ledger Zcash Device Signer Kit client", () => {
  beforeEach(() => {
    addressCalls.length = 0;
    signCalls.length = 0;
    signedRaw = realV5Transaction({ outputAmount: 4_500n });
    emulatedApp = undefined;
  });

  afterAll(() => {
    mock.module("@ledgerhq/device-signer-kit-zcash", () => realZcashSignerKitSnapshot);
  });

  it("maps a real v5 previous transaction into the legacy DSK argument", async () => {
    const previousRaw = realV5Transaction();
    const tx = targetTransaction();
    const states: string[] = [];
    const client = ZcashLedger({
      derivationPath: "m/44'/133'/0'/0/0",
      dmkSession,
      onDeviceActionState: ({ status }) => states.push(status),
    });

    const raw = await client.signTransaction({ inputUtxos: [inputUtxo(previousRaw)], tx });

    expect(raw).toBe(signedRaw);
    expect(signCalls).toHaveLength(1);
    const args = signCalls[0] as LegacyCreateTransactionArg;
    expect(args).toMatchObject({
      additionals: ["zcash", "sapling"],
      associatedKeysets: ["44'/133'/0'/0/0"],
      blockHeight: 3_364_600,
      changePath: "44'/133'/0'/0/0",
      lockTime: 12,
      outputScriptHex: "0194110000000000000151",
    });
    expect(args.expiryHeight).toEqual(uint32LE(3_364_701));
    expect(args.inputs[0]?.[1]).toBe(0);
    expect(args.inputs[0]?.[3]).toBe(0xfffffffd);
    expect(args.inputs[0]?.[0].serializedPreviousTransactionOverride).toEqual(hex.decode(previousRaw));
    expect(args.inputs[0]?.[0].outputs?.[0]).toEqual({ amount: uint64LE(5_000n), script: Uint8Array.of(0x51) });
    expect(states).toEqual(["pending", "completed"]);
  });

  it("uses the Ironwood activation height and exact multi-input paths", async () => {
    const tx = targetTransaction(ZcashConsensusBranchId.IRONWOOD);
    tx.addInput({ index: 0, txid: new Uint8Array(32).fill(8), value: 5_000n });
    const client = ZcashLedger({ derivationPath: "44'/133'/4'/0/0", dmkSession });

    await client.signTransactionWithMultiplePaths({
      derivationPaths: ["m/44'/133'/4'/0/2", "44'/133'/4'/1/9"],
      inputUtxos: [inputUtxo(), inputUtxo(realV5Transaction(), "08".repeat(32))],
      tx,
    });

    expect(signCalls).toHaveLength(1);
    expect(signCalls[0]).toMatchObject({
      associatedKeysets: ["44'/133'/4'/0/2", "44'/133'/4'/1/9"],
      blockHeight: 3_428_143,
    });
  });

  it("fails before device signing when an input has no real txHex", async () => {
    const tx = targetTransaction();
    const client = ZcashLedger({ dmkSession });

    await expect(
      client.signTransaction({ inputUtxos: [{ hash: "07".repeat(32), index: 0, value: 5_000 }], tx }),
    ).rejects.toThrow("wallet_ledger_invalid_params");
    expect(signCalls).toHaveLength(0);
  });

  it("streams a v5 previous transaction to the device from its wire bytes", async () => {
    const previousRaw = hex.decode(realV5Transaction());
    emulatedApp = emulatedZcashApp([Uint8Array.from([...new Uint8Array(32).fill(7), ...uint32LE(0)])]);
    const client = ZcashLedger({ dmkSession });

    const raw = await client.signTransaction({
      inputUtxos: [inputUtxo(hex.encode(previousRaw))],
      tx: targetTransaction(),
    });

    // header | no inputs | one output | empty Sapling, Orchard counts | nLockTime | 4 | nExpiryHeight
    expect(emulatedApp.trustedInputStreams).toEqual([
      Uint8Array.from([
        ...previousRaw.slice(0, 12),
        0,
        ...previousRaw.slice(21, 32),
        0,
        0,
        0,
        ...previousRaw.slice(12, 16),
        4,
        ...previousRaw.slice(16, 20),
      ]),
    ]);
    expect(hex.decode(raw).slice(21, 57)).toEqual(Uint8Array.from([...new Uint8Array(32).fill(7), ...uint32LE(0)]));
  });

  it.each([
    ["mainnet", MAINNET_V4_TRANSACTION, 1_921_761_200n],
    ["synthetic", v4Transaction(), 70_000n],
  ])("frames a %s v4 previous transaction through the DSK instead of overriding it", async (_label, previous, amount) => {
    const { inputUtxos, tx } = spendOutputOne(previous, amount);
    const outpoint = Uint8Array.from([...hex.decode(displayTxid(previous)).reverse(), ...uint32LE(1)]);
    emulatedApp = emulatedZcashApp([outpoint]);
    const client = ZcashLedger({ dmkSession });

    const raw = await client.signTransaction({ inputUtxos, tx });

    const legacyPrevious = (signCalls[0] as LegacyCreateTransactionArg).inputs[0]?.[0];
    expect(legacyPrevious?.serializedPreviousTransactionOverride).toBeUndefined();
    expect(legacyPrevious?.extraData).toEqual(previous.slice(-11));
    expect(legacyPrevious?.outputs).toHaveLength(2);
    expect(emulatedApp.trustedInputStreams).toEqual([ledgerV4TrustedInputStream(previous)]);
    // The signed v5 spends the outpoint the device attested in its trusted input.
    expect(hex.decode(raw).slice(21, 57)).toEqual(outpoint);
  });

  it("keeps the mainnet v4 fixture identical to the confirmed transaction", () => {
    expect(displayTxid(MAINNET_V4_TRANSACTION)).toBe(MAINNET_V4_TXID);
  });

  it("rejects a v4 previous transaction that does not hash to the input txid", async () => {
    const previous = v4Transaction();
    const client = ZcashLedger({ dmkSession });

    await expect(
      client.signTransaction({ inputUtxos: [inputUtxo(hex.encode(previous))], tx: targetTransaction() }),
    ).rejects.toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
      info: { inputIndex: 0, previousTxid: displayTxid(previous), txid: "07".repeat(32) },
    });
    expect(signCalls).toHaveLength(0);
  });

  it("rejects input UTXOs that do not match the planned inputs", async () => {
    const client = ZcashLedger({ dmkSession });

    await expect(
      client.signTransaction({
        inputUtxos: [inputUtxo(realV5Transaction(), "ab".repeat(32))],
        tx: targetTransaction(),
      }),
    ).rejects.toMatchObject({ info: { inputIndex: 0, utxo: { hash: "ab".repeat(32), index: 0 } } });
    await expect(
      client.signTransaction({ inputUtxos: [{ ...inputUtxo(), index: 1 }], tx: targetTransaction() }),
    ).rejects.toMatchObject({ info: { inputIndex: 0, transactionInput: { index: 0 }, utxo: { index: 1 } } });
    expect(signCalls).toHaveLength(0);
  });

  it.each([
    ["Sprout v1", 1, 1],
    ["Sprout v2", 2, 2],
    ["Overwinter v3", 0x80000003, 3],
    ["unknown v7", 0x80000007, 7],
  ])("rejects a %s previous transaction before reaching the device", async (_label, header, version) => {
    const { inputUtxos, tx } = spendOutputOne(v4Transaction({ header }), 70_000n);
    const client = ZcashLedger({ dmkSession });

    await expect(client.signTransaction({ inputUtxos, tx })).rejects.toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
      info: { inputIndex: 0, txid: inputUtxos[0]?.hash, version },
    });
    expect(signCalls).toHaveLength(0);
  });

  it.each([
    ["is not hex", "0x80zz"],
    ["is truncated", hex.encode(v4Transaction().slice(0, 60))],
  ])("rejects a previous transaction that %s with its input context", async (_label, txHex) => {
    const client = ZcashLedger({ dmkSession });

    await expect(
      client.signTransaction({ inputUtxos: [inputUtxo(txHex)], tx: targetTransaction() }),
    ).rejects.toMatchObject({
      cause: expect.any(Error),
      errorKey: "wallet_ledger_invalid_params",
      info: { inputIndex: 0, outputIndex: 0, reason: expect.any(String), txid: "07".repeat(32) },
    });
    expect(signCalls).toHaveLength(0);
  });

  it("refuses to sign over a legacy transport", async () => {
    const send = mock(() => Promise.reject(new Error("no APDU expected")));
    const client = ZcashLedger({ transport: { send } as unknown as Transport });

    await expect(client.signTransaction({ inputUtxos: [inputUtxo()], tx: targetTransaction() })).rejects.toThrow(
      "wallet_ledger_invalid_params",
    );
    expect(send).not.toHaveBeenCalled();
    expect(signCalls).toHaveLength(0);
  });

  it("returns address bytes and propagates address verification state", async () => {
    const states: string[] = [];
    const client = ZcashLedger({
      derivationPath: "m/44'/133'/1'/1/3",
      dmkSession,
      onDeviceActionState: ({ status }) => states.push(status),
    });

    const address = await client.showAddressAndPubKey();

    expect(address).toEqual({ address: "t1ledgerdsk", chainCode: "03".repeat(32), publicKey: `04${"05".repeat(64)}` });
    expect(addressCalls).toEqual([{ options: { checkOnDevice: true }, path: "44'/133'/1'/1/3" }]);
    expect(states).toEqual(["pending", "completed"]);
  });
});
