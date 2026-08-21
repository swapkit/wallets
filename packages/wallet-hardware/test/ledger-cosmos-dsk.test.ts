import { beforeEach, describe, expect, it, mock } from "bun:test";
import { encodeSecp256k1Signature, type StdSignDoc, serializeSignDoc } from "@cosmjs/amino";
import { DeviceActionStatus, type DeviceManagementKit } from "@ledgerhq/device-management-kit";
import { of } from "rxjs";

const publicKey = Uint8Array.from([2, ...new Uint8Array(32).fill(9)]);
const addressCalls: Array<{ hrp: string; options?: { checkOnDevice?: boolean }; path: string }> = [];
const signCalls: Array<{ hrp: string; message: Uint8Array; path: string }> = [];
let signatureOutput = new Uint8Array(64);

function deviceAction<Output>(output: Output) {
  return {
    cancel: mock(() => {}),
    observable: of(
      { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
      { output, status: DeviceActionStatus.Completed },
    ),
  };
}

mock.module("@ledgerhq/device-signer-kit-cosmos", () => ({
  SignerCosmosBuilder: class MockSignerCosmosBuilder {
    build() {
      return {
        getAddress: (path: string, hrp: string, options?: { checkOnDevice?: boolean }) => {
          addressCalls.push({ hrp, options, path });
          return deviceAction({ address: "cosmos1ledgerdsk", publicKey });
        },
        signTransaction: (path: string, hrp: string, message: Uint8Array) => {
          signCalls.push({ hrp, message, path });
          return deviceAction(signatureOutput);
        },
      };
    }
  },
}));

import { CosmosLedger } from "../src/ledger/clients/cosmos";

const dmkSession = { dmk: { id: "cosmos-dmk" } as unknown as DeviceManagementKit, sessionId: "cosmos-session" };
const signDoc: StdSignDoc = {
  account_number: "17",
  chain_id: "cosmoshub-4",
  fee: { amount: [{ amount: "123", denom: "uatom" }], gas: "200000" },
  memo: "Ledger DSK",
  msgs: [{ type: "cosmos-sdk/MsgSend", value: { amount: [], from_address: "a", to_address: "b" } }],
  sequence: "4",
};

describe("Ledger Cosmos Device Signer Kit client", () => {
  beforeEach(() => {
    addressCalls.length = 0;
    signCalls.length = 0;
    signatureOutput = new Uint8Array(64);
  });

  it("serializes the amino sign doc and normalizes a DER signature", async () => {
    signatureOutput = Uint8Array.of(0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02);
    const states: string[] = [];
    const client = new CosmosLedger({
      derivationPath: "m/44'/118'/3'/0/7",
      dmkSession,
      onDeviceActionState: ({ status }) => states.push(status),
    });

    const response = await client.signAmino("cosmos1ledgerdsk", signDoc);
    const fixedSignature = Uint8Array.from([...new Uint8Array(31), 1, ...new Uint8Array(31), 2]);

    expect(signCalls).toEqual([{ hrp: "cosmos", message: serializeSignDoc(signDoc), path: "44'/118'/3'/0/7" }]);
    expect(response).toEqual({ signature: encodeSecp256k1Signature(publicKey, fixedSignature), signed: signDoc });
    expect(addressCalls).toEqual([{ hrp: "cosmos", options: undefined, path: "44'/118'/3'/0/7" }]);
    expect(states).toEqual(["pending", "completed", "pending", "completed"]);
  });

  it("preserves a fixed-length signature for the legacy transaction result", async () => {
    signatureOutput = Uint8Array.from({ length: 64 }, (_, index) => index + 1);
    const client = new CosmosLedger({ dmkSession });

    const result = await client.signTransaction('{"account_number":"1"}', "9");

    expect(signCalls).toEqual([
      { hrp: "cosmos", message: new TextEncoder().encode('{"account_number":"1"}'), path: "44'/118'/0'/0/0" },
    ]);
    expect(result).toEqual([
      {
        pub_key: { type: "tendermint/PubKeySecp256k1", value: Buffer.from(publicKey).toString("base64") },
        sequence: "9",
        signature: signatureOutput,
      },
    ]);
  });

  it("requests on-device address verification with the normalized path", async () => {
    const client = new CosmosLedger({ derivationPath: "m/44'/118'/0'/1/12", dmkSession });

    const response = await client.showAddressAndPubKey();

    expect(response).toEqual({ address: "cosmos1ledgerdsk", publicKey: Buffer.from(publicKey).toString("hex") });
    expect(addressCalls).toEqual([{ hrp: "cosmos", options: { checkOnDevice: true }, path: "44'/118'/0'/1/12" }]);
  });
});
