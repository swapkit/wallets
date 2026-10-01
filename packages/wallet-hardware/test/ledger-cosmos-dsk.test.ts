import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { StdSignDoc } from "@cosmjs/amino";
import {
  ApduResponse,
  DeviceActionStatus,
  type DeviceManagementKit,
  GlobalCommandErrorHandler,
} from "@ledgerhq/device-management-kit";
import { AssetValue, Chain, type GenericTransferParams } from "@swapkit/helpers";
import { of } from "rxjs";

const publicKey = Uint8Array.from([2, ...new Uint8Array(32).fill(9)]);
const addressCalls: Array<{ hrp: string; options?: { checkOnDevice?: boolean }; path: string }> = [];
const signCalls: Array<{ hrp: string; message: Uint8Array; path: string }> = [];
let signatureOutput = new Uint8Array(64);
let signatureError: unknown;

function deviceAction<Output>(output: Output) {
  return {
    cancel: mock(() => {}),
    observable: of(
      { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
      { output, status: DeviceActionStatus.Completed },
    ),
  };
}

function failedDeviceAction(error: unknown) {
  return {
    cancel: mock(() => {}),
    observable: of(
      { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
      { error, status: DeviceActionStatus.Error },
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
          return signatureError ? failedDeviceAction(signatureError) : deviceAction(signatureOutput);
        },
      };
    }
  },
}));

import { CosmosLedger } from "../src/ledger/clients/cosmos";
import { ledgerWallet } from "../src/ledger/index";

// cosmjs is CJS requiring ESM-only `@scure/base`; a static import next to `@swapkit/*` fails under Bun.
const { encodeSecp256k1Signature, serializeSignDoc } = await import("@cosmjs/amino");

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
    signatureError = undefined;
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

  it("reports a signature rejected on the device as a user rejection", async () => {
    // The app rejects with 0x6986; the signer kit keys its error table "0x6986", so DMK's fallback handler reports it.
    signatureError = GlobalCommandErrorHandler.handle(
      new ApduResponse({ data: new Uint8Array(), statusCode: Uint8Array.of(0x69, 0x86) }),
    );
    const client = new CosmosLedger({ dmkSession });

    await expect(client.signAmino("cosmos1ledgerdsk", signDoc)).rejects.toMatchObject({
      errorKey: "wallet_connection_rejected_by_user",
      info: { statusWord: "6986" },
    });
  });
});

describe("Ledger Cosmos wallet", () => {
  const ledgerAddress = "cosmos1ledgerdsk";
  const recipient = "cosmos1recipient";
  const broadcasts: string[] = [];
  let broadcastCode = 0;
  let fetchSpy: { mockRestore: () => void } | undefined;

  // QueryAccountResponse { account: Any(BaseAccount { address, account_number: 17, sequence: 4 }) } in protobuf.
  function encodeAccountResponse() {
    const field = (tag: number, bytes: Uint8Array) => [tag, bytes.length, ...bytes];
    const text = (value: string) => new TextEncoder().encode(value);
    const baseAccount = Uint8Array.from([...field(0x0a, text(ledgerAddress)), 0x18, 17, 0x20, 4]);
    const account = Uint8Array.from([
      ...field(0x0a, text("/cosmos.auth.v1beta1.BaseAccount")),
      ...field(0x12, baseAccount),
    ]);
    return Buffer.from(field(0x0a, account)).toString("base64");
  }

  // A Cosmos Hub node over Tendermint JSON-RPC; the SwapKit gas endpoint (GET) returns no rate.
  function mockCosmosNode(_input: string | URL | Request, init?: RequestInit) {
    if (!init?.body) return Promise.resolve(Response.json([]));

    const { id, method, params } = JSON.parse(String(init.body)) as {
      id?: number;
      method?: string;
      params?: { tx?: string };
    };
    if (method === "broadcast_tx_sync") broadcasts.push(params?.tx ?? "");

    const result =
      method === "abci_query"
        ? { response: { code: 0, height: "1", value: encodeAccountResponse() } }
        : method === "broadcast_tx_sync"
          ? { code: broadcastCode, hash: "LEDGERTXHASH", log: broadcastCode ? "insufficient fees" : "" }
          : { node_info: { network: "cosmoshub-4" }, sync_info: { latest_block_height: "1" } };
    return Promise.resolve(Response.json({ id, jsonrpc: "2.0", result }));
  }

  async function connectCosmosLedger() {
    const addChain = mock((_wallet: unknown) => {});
    const connectLedger = ledgerWallet.connectLedger.connectWallet({ addChain: addChain as never });

    await connectLedger([Chain.Cosmos], undefined, { dmkSession });
    return addChain.mock.calls[0]?.[0] as {
      address: string;
      getFees: () => Promise<{
        average: { getBaseValue: (type: "string") => string };
        fast: { getBaseValue: (type: "string") => string };
      }>;
      transfer: (params: GenericTransferParams) => Promise<string>;
    };
  }

  beforeEach(() => {
    addressCalls.length = 0;
    signCalls.length = 0;
    broadcasts.length = 0;
    broadcastCode = 0;
    signatureError = undefined;
    signatureOutput = Uint8Array.from({ length: 64 }, (_, index) => index + 1);
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(mockCosmosNode as typeof fetch);
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("signs and broadcasts through the toolbox transfer", async () => {
    const wallet = await connectCosmosLedger();

    const txHash = await wallet.transfer({
      assetValue: AssetValue.from({ chain: Chain.Cosmos, value: "0.1" }),
      memo: "ledger transfer",
      recipient,
    });
    const fees = await wallet.getFees();

    expect(wallet.address).toBe(ledgerAddress);
    expect(txHash).toBe("LEDGERTXHASH");
    expect(broadcasts).toHaveLength(1);
    // Without a feeOptionKey the toolbox pays its Fast fee, clear of the Hub feemarket floor that Average sits on.
    expect(fees.fast.getBaseValue("string")).not.toBe(fees.average.getBaseValue("string"));
    expect(JSON.parse(new TextDecoder().decode(signCalls[0]?.message))).toEqual({
      account_number: "17",
      chain_id: "cosmoshub-4",
      fee: { amount: [{ amount: fees.fast.getBaseValue("string"), denom: "uatom" }], gas: "200000" },
      memo: "ledger transfer",
      msgs: [
        {
          type: "cosmos-sdk/MsgSend",
          value: { amount: [{ amount: "100000", denom: "uatom" }], from_address: ledgerAddress, to_address: recipient },
        },
      ],
      sequence: "4",
    });
  });

  it("rejects a transfer the node refuses at CheckTx", async () => {
    broadcastCode = 13;
    const wallet = await connectCosmosLedger();

    await expect(
      wallet.transfer({ assetValue: AssetValue.from({ chain: Chain.Cosmos, value: "0.1" }), recipient }),
    ).rejects.toMatchObject({ cause: { code: 13 }, errorKey: "core_swap_transaction_error" });
    expect(broadcasts).toHaveLength(1);
  });
});
