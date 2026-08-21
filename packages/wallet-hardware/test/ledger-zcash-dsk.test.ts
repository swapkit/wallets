import { beforeEach, describe, expect, it, mock } from "bun:test";
import { DeviceActionStatus, type DeviceManagementKit } from "@ledgerhq/device-management-kit";
import { hex } from "@scure/base";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import { ZcashConsensusBranchId, ZcashTransaction, ZcashVersionGroupId } from "@swapkit/utxo-signer";
import { of } from "rxjs";

const addressCalls: Array<{ options?: { checkOnDevice?: boolean }; path: string }> = [];
const signCalls: unknown[] = [];
let signedRaw = "";

function deviceAction<Output>(output: Output) {
  return {
    cancel: mock(() => {}),
    observable: of(
      { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
      { output, status: DeviceActionStatus.Completed },
    ),
  };
}

mock.module("@ledgerhq/device-signer-kit-zcash", () => ({
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
        signTransaction: (args: unknown) => {
          signCalls.push(args);
          return deviceAction(`0x${signedRaw}`);
        },
      };
    }
  },
}));

import type { LegacyCreateTransactionArg } from "@ledgerhq/device-signer-kit-zcash";
import { ZcashLedger } from "../src/ledger/clients/zcash";

const dmkSession = { dmk: { id: "zcash-dmk" } as unknown as DeviceManagementKit, sessionId: "zec-session" };

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

function targetTransaction(consensusBranchId = ZcashConsensusBranchId.NU6_2) {
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

function inputUtxo(txHex = realV5Transaction()): UTXOType {
  return { hash: "ab".repeat(32), index: 0, txHex, value: 5_000 };
}

describe("Ledger Zcash Device Signer Kit client", () => {
  beforeEach(() => {
    addressCalls.length = 0;
    signCalls.length = 0;
    signedRaw = realV5Transaction({ outputAmount: 4_500n });
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
      inputUtxos: [inputUtxo(), inputUtxo()],
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
      client.signTransaction({ inputUtxos: [{ hash: "ab".repeat(32), index: 0, value: 5_000 }], tx }),
    ).rejects.toThrow("wallet_ledger_invalid_params");
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
