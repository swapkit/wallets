import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as realCardanoApp from "@cardano-foundation/ledgerjs-hw-app-cardano";
import type Transport from "@ledgerhq/hw-transport";
import { CborTag, Decoder, Encoder } from "@stricahq/cbors";

// mock.module replaces the whole export namespace process-wide; snapshot the real module so
// afterAll can restore it for test files that run later.
const realCardanoAppSnapshot = { ...realCardanoApp };
const { HARDENED } = realCardanoApp;

const TX =
  "84a500828258203b40265111d8bb3c3c608d95b3a0bf83461ace32d79336579a1939b3aad1c0b700825820fa6f0b48a3a1d4c7ee6d1b9e16c2d8a1d7d4b6a8b2a35e1f6c2b9d0e4f1a2b3c010182a2005839015b1ac02842acd257d33ab3e3142d6e980fe9aaccd06d864a7cb77e614faf8806d4d3bfb9ae5241aade08a6c6162c1bd5689899ddff9eb503011a005b8d80a2005839019493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c4725101821a001bdba3a1581c29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6a1434d494e182a021a0002a8dd031a0a037a00075820b5876c72e8bea78ff57e82306a5c1b83eb86f52a127bd81087b9821e70fd3ef8a0f5d90103a100a11902a2a1636d73678167737761706b6974";
const BODY_HASH = "7d463516ff44682612fa8d24b620764ea59cb2016aed1aec14866df8fa9d977d";
const SENDER =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
const SENDER_HEX =
  "019493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251";
const RECIPIENT_HEX =
  "015b1ac02842acd257d33ab3e3142d6e980fe9aaccd06d864a7cb77e614faf8806d4d3bfb9ae5241aade08a6c6162c1bd5689899ddff9eb503";
const PAYMENT_PATH = [1852 + HARDENED, 1815 + HARDENED, HARDENED, 0, 0];
const STAKING_PATH = [1852 + HARDENED, 1815 + HARDENED, HARDENED, 2, 0];
// Payment and staking keys of the "abandon ... about" seed and the address the SwapKit keystore derives from it
const PUBLIC_KEY = "7ea09a34aebb13c9841c71397b1cabfec5ddf950405293dee496cac2f437480a";
const STAKING_KEY = "012f5dc3115b8a07981e6e50f5a671e2c6fbb26c3ffde1cd1dcaf40a7fe8f160";
const KEYSTORE_ADDRESS =
  "addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv";
const SIGNATURE = "9a".repeat(64);

const signCalls: unknown[] = [];
const publicKeyCalls: unknown[] = [];
let signResponse: { txHashHex: string; witnesses: { path: number[]; witnessSignatureHex: string }[] };

class MockCardanoApp {
  getExtendedPublicKeys = (params: unknown) => {
    publicKeyCalls.push(params);
    return Promise.resolve(
      [PUBLIC_KEY, STAKING_KEY].map((publicKeyHex) => ({ chainCodeHex: "00".repeat(32), publicKeyHex })),
    );
  };

  signTransaction = (params: unknown) => {
    signCalls.push(params);
    return Promise.resolve({ ...signResponse, auxiliaryDataSupplement: null });
  };
}

mock.module("@cardano-foundation/ledgerjs-hw-app-cardano", () => ({
  ...realCardanoAppSnapshot,
  Ada: MockCardanoApp,
  default: MockCardanoApp,
}));

import { CardanoLedger, toLedgerCardanoTransaction } from "../src/ledger/clients/cardano";

const own = { address: SENDER, paymentPath: PAYMENT_PATH, stakingPath: STAKING_PATH };
const transport = { id: "Cardano" } as unknown as Transport;

function withBody(update: (body: Map<unknown, unknown>) => void) {
  const { value } = Decoder.decode(Buffer.from(TX, "hex"));
  update(value[0]);
  return Encoder.encode(value).toString("hex");
}

function withFirstOutput(update: (output: Map<unknown, unknown>) => unknown) {
  return withBody((body) => {
    const outputs = body.get(1) as Map<unknown, unknown>[];
    outputs[0] = (update(outputs[0] as Map<unknown, unknown>) ?? outputs[0]) as Map<unknown, unknown>;
  });
}

function signWith(tx: string) {
  return CardanoLedger([1852, 1815, 0, 0, 0], transport).then((signer) => signer.signTransaction(tx));
}

beforeEach(() => {
  signCalls.length = 0;
  publicKeyCalls.length = 0;
  signResponse = { txHashHex: BODY_HASH, witnesses: [{ path: PAYMENT_PATH, witnessSignatureHex: SIGNATURE }] };
});

describe("ledger cardano transaction", () => {
  it("derives the keystore address from both keys in a single device call", async () => {
    const signer = await CardanoLedger({ derivationPath: [1852, 1815, 0, 0, 0], transport });

    expect(signer.getAddress()).toBe(KEYSTORE_ADDRESS);
    expect(signer.publicKey.toString("hex")).toBe(PUBLIC_KEY);
    expect(publicKeyCalls).toEqual([{ paths: [PAYMENT_PATH, STAKING_PATH] }]);
  });

  it("rejects derivation paths that are not a payment address path", async () => {
    await expect(CardanoLedger([1852, 1815, 0, 2, 0], transport)).rejects.toThrow(
      "wallet_ledger_derivation_path_error",
    );
    expect(publicKeyCalls).toHaveLength(0);
  });

  it("maps an ADA transfer with token change keeping amounts, addresses and inputs", async () => {
    expect(
      await toLedgerCardanoTransaction(
        withBody((body) => body.set(8, 167000000)),
        own,
        realCardanoApp,
      ),
    ).toEqual({
      additionalWitnessPaths: [],
      options: { tagCborSets: false },
      signingMode: "ordinary_transaction",
      tx: {
        auxiliaryData: {
          params: { hashHex: "b5876c72e8bea78ff57e82306a5c1b83eb86f52a127bd81087b9821e70fd3ef8" },
          type: "arbitrary_hash",
        },
        fee: "174301",
        inputs: [
          {
            outputIndex: 0,
            path: PAYMENT_PATH,
            txHashHex: "3b40265111d8bb3c3c608d95b3a0bf83461ace32d79336579a1939b3aad1c0b7",
          },
          {
            outputIndex: 1,
            path: PAYMENT_PATH,
            txHashHex: "fa6f0b48a3a1d4c7ee6d1b9e16c2d8a1d7d4b6a8b2a35e1f6c2b9d0e4f1a2b3c",
          },
        ],
        network: { networkId: 1, protocolMagic: 764824073 },
        outputs: [
          { amount: "6000000", destination: { params: { addressHex: RECIPIENT_HEX }, type: "third_party" }, format: 1 },
          {
            amount: "1825699",
            destination: {
              params: { params: { spendingPath: PAYMENT_PATH, stakingPath: STAKING_PATH }, type: 0 },
              type: "device_owned",
            },
            format: 1,
            tokenBundle: [
              {
                policyIdHex: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6",
                tokens: [{ amount: "42", assetNameHex: "4d494e" }],
              },
            ],
          },
        ],
        ttl: "168000000",
        validityIntervalStart: "167000000",
      },
    });
  });

  it("keeps the legacy output format and tagged input sets", async () => {
    const tx = withBody((body) => {
      const [output] = body.get(1) as Map<number, unknown>[];
      (body.get(1) as unknown[])[0] = [output?.get(0), output?.get(1)];
      body.set(0, new CborTag(body.get(0), 258));
    });

    const request = await toLedgerCardanoTransaction(tx, own, realCardanoApp);
    expect(request.options).toEqual({ tagCborSets: true });
    expect(request.tx.outputs[0]).toEqual({
      amount: "6000000",
      destination: { params: { addressHex: RECIPIENT_HEX }, type: "third_party" },
      format: 0,
    });
  });

  it("adds the device witness to the original transaction without re-encoding the body", async () => {
    const signed = await signWith(TX);

    const [witnessStart] = (
      Decoder.decode(Buffer.from(TX, "hex")).value[1] as { getByteSpan: () => number[] }
    ).getByteSpan();
    const original = Buffer.from(TX, "hex");
    const witnessSet = `a10081825820${PUBLIC_KEY}5840${SIGNATURE}`;

    expect(signed).toBe(
      original.subarray(0, witnessStart).toString("hex") +
        witnessSet +
        original.subarray(witnessStart + 1).toString("hex"),
    );
    // The signer derives the keystore address, so the fixture's change output is a third-party address here
    const expectedRequest = await toLedgerCardanoTransaction(TX, { ...own, address: KEYSTORE_ADDRESS }, realCardanoApp);
    expect(signCalls).toEqual([expectedRequest]);
    expect(expectedRequest.tx.outputs[1]?.destination).toEqual({
      params: { addressHex: SENDER_HEX },
      type: "third_party",
    });
  });

  it("refuses to return a signature for a body the device did not hash", async () => {
    signResponse = { ...signResponse, txHashHex: "00".repeat(32) };
    await expect(signWith(TX)).rejects.toThrow("wallet_ledger_invalid_signature");
  });

  it("refuses a witness signed with a key other than the payment key", async () => {
    signResponse = { txHashHex: BODY_HASH, witnesses: [{ path: STAKING_PATH, witnessSignatureHex: SIGNATURE }] };
    await expect(signWith(TX)).rejects.toThrow("wallet_ledger_signing_error");

    signResponse = { txHashHex: BODY_HASH, witnesses: [] };
    await expect(signWith(TX)).rejects.toThrow("wallet_ledger_signing_error");
  });

  const keyHash = Buffer.alloc(28, 1);
  const txIn = [Buffer.alloc(32, 2), 0];
  const unsupported: [string, string][] = [
    ["certificates", withBody((body) => body.set(4, [[0, [0, keyHash]]]))],
    ["withdrawals", withBody((body) => body.set(5, new Map([[Buffer.concat([Buffer.from([0xe1]), keyHash]), 1]])))],
    ["mint", withBody((body) => body.set(9, new Map([[keyHash, new Map([[Buffer.from("01", "hex"), 1]])]])))],
    ["script data hash", withBody((body) => body.set(11, Buffer.alloc(32)))],
    ["collateral inputs", withBody((body) => body.set(13, [txIn]))],
    ["required signers", withBody((body) => body.set(14, [keyHash]))],
    ["network id", withBody((body) => body.set(15, 1))],
    ["collateral return", withBody((body) => body.set(16, [Buffer.from(SENDER_HEX, "hex"), 1]))],
    ["total collateral", withBody((body) => body.set(17, 1))],
    ["reference inputs", withBody((body) => body.set(18, [txIn]))],
    ["voting procedures", withBody((body) => body.set(19, new Map()))],
    ["treasury value", withBody((body) => body.set(21, 1))],
    ["donation", withBody((body) => body.set(22, 1))],
    ["inline datum", withFirstOutput((output) => output.set(2, [1, new CborTag(Buffer.from("00", "hex"), 24)]))],
    ["reference script", withFirstOutput((output) => output.set(3, new CborTag(Buffer.from("00", "hex"), 24)))],
    ["unknown output field", withFirstOutput((output) => output.set(4, 1))],
    ["legacy datum hash", withFirstOutput((output) => [output.get(0), output.get(1), Buffer.alloc(32)])],
    ["non-integer output amount", withFirstOutput((output) => output.set(1, -1))],
    ["extra input element", withBody((body) => (body.get(0) as unknown[][])[0]?.push(0))],
    ["extra output value element", withBody((body) => (body.get(1) as Map<number, unknown[]>[])[1]?.get(1)?.push(0))],
  ];

  it.each(unsupported)("rejects %s before calling the device", async (_, tx) => {
    await expect(signWith(tx)).rejects.toThrow("wallet_ledger_method_not_supported");
    expect(signCalls).toHaveLength(0);
  });
});

afterAll(() => {
  mock.module("@cardano-foundation/ledgerjs-hw-app-cardano", () => realCardanoAppSnapshot);
});
