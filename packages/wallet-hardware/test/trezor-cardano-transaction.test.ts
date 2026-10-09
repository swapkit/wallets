import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CborTag, Decoder, Encoder } from "@stricahq/cbors";

// Built with @stricahq/typhonjs 3.1.0 like the SDK toolbox: two inputs, 6 ADA to the recipient,
// change with 42 native tokens back to the sender and a CIP-20 memo
const TX =
  "84a500828258203b40265111d8bb3c3c608d95b3a0bf83461ace32d79336579a1939b3aad1c0b700825820fa6f0b48a3a1d4c7ee6d1b9e16c2d8a1d7d4b6a8b2a35e1f6c2b9d0e4f1a2b3c010182a2005839015b1ac02842acd257d33ab3e3142d6e980fe9aaccd06d864a7cb77e614faf8806d4d3bfb9ae5241aade08a6c6162c1bd5689899ddff9eb503011a005b8d80a2005839019493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c4725101821a001bdba3a1581c29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6a1434d494e182a021a0002a8dd031a0a037a00075820b5876c72e8bea78ff57e82306a5c1b83eb86f52a127bd81087b9821e70fd3ef8a0f5d90103a100a11902a2a1636d73678167737761706b6974";
const BODY_HASH = "7d463516ff44682612fa8d24b620764ea59cb2016aed1aec14866df8fa9d977d";
const SENDER =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
const RECIPIENT =
  "addr1q9d34spgg2kdy47n82e7x9pdd6vql6d2engxmpj20jmhuc2047yqd4xnh7u6u5jp4t0q3fkxzckph4tgnzvamlu7k5psuahzcp";
const PATH = "m/1852'/1815'/0'/0/0";
const STAKING_PATH = "m/1852'/1815'/0'/2/0";
const PUBLIC_KEY = "5d010cf16fdeff40955633d6c565f3844a288a24967cf6b76acbeb271b4f13c1";
const SIGNATURE = "9a".repeat(64);

const signCalls: unknown[] = [];
let signPayload: { hash: string; witnesses: { type: number; pubKey: string; signature: string }[] };

mock.module("@trezor/connect-web", () => ({
  default: {
    cardanoGetPublicKey: () =>
      Promise.resolve({ payload: { publicKey: `${PUBLIC_KEY}${"00".repeat(32)}` }, success: true }),
    cardanoSignTransaction: (params: unknown) => {
      signCalls.push(params);
      return Promise.resolve({ payload: signPayload, success: true });
    },
  },
}));

const { getCardanoSigner, toTrezorCardanoTransaction } = await import("../src/trezor/cardanoSigner");

const own = { address: SENDER, path: PATH, stakingPath: STAKING_PATH };

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
  return getCardanoSigner({ address: SENDER, derivationPath: [1852, 1815, 0, 0, 0] }).then((signer) =>
    signer.signTransaction(tx),
  );
}

beforeEach(() => {
  signCalls.length = 0;
  signPayload = { hash: BODY_HASH, witnesses: [{ pubKey: PUBLIC_KEY, signature: SIGNATURE, type: 1 }] };
});

describe("trezor cardano transaction", () => {
  it("maps an ADA transfer with token change keeping amounts, addresses and inputs", () => {
    expect(toTrezorCardanoTransaction(TX, own)).toEqual({
      auxiliaryData: { hash: "b5876c72e8bea78ff57e82306a5c1b83eb86f52a127bd81087b9821e70fd3ef8" },
      derivationType: 1,
      fee: "174301",
      inputs: [
        { path: PATH, prev_hash: "3b40265111d8bb3c3c608d95b3a0bf83461ace32d79336579a1939b3aad1c0b7", prev_index: 0 },
        { path: PATH, prev_hash: "fa6f0b48a3a1d4c7ee6d1b9e16c2d8a1d7d4b6a8b2a35e1f6c2b9d0e4f1a2b3c", prev_index: 1 },
      ],
      networkId: 1,
      outputs: [
        { address: RECIPIENT, amount: "6000000", format: 1 },
        {
          addressParameters: { addressType: 0, path: PATH, stakingPath: STAKING_PATH },
          amount: "1825699",
          format: 1,
          tokenBundle: [
            {
              policyId: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6",
              tokenAmounts: [{ amount: "42", assetNameBytes: "4d494e" }],
            },
          ],
        },
      ],
      protocolMagic: 764824073,
      signingMode: 0,
      tagCborSets: false,
      ttl: "168000000",
    });
  });

  it("keeps the legacy output format and tagged input sets", () => {
    const tx = withBody((body) => {
      const [output] = body.get(1) as Map<number, unknown>[];
      (body.get(1) as unknown[])[0] = [output?.get(0), output?.get(1)];
      body.set(0, new CborTag(body.get(0), 258));
    });

    const params = toTrezorCardanoTransaction(tx, own);
    expect(params.tagCborSets).toBe(true);
    expect(params.outputs[0]).toEqual({ address: RECIPIENT, amount: "6000000", format: 0 });
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
    expect(signCalls).toEqual([toTrezorCardanoTransaction(TX, own)]);
  });

  it("refuses to return a signature for a body the device did not hash", async () => {
    signPayload = { ...signPayload, hash: "00".repeat(32) };
    await expect(signWith(TX)).rejects.toThrow("wallet_trezor_failed_to_sign_transaction");

    signPayload = { hash: BODY_HASH, witnesses: [{ pubKey: "11".repeat(32), signature: SIGNATURE, type: 1 }] };
    await expect(signWith(TX)).rejects.toThrow("wallet_trezor_failed_to_sign_transaction");
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
    ["reference inputs", withBody((body) => body.set(18, [txIn]))],
    ["voting procedures", withBody((body) => body.set(19, new Map()))],
    ["donation", withBody((body) => body.set(22, 1))],
    ["inline datum", withFirstOutput((output) => output.set(2, [1, new CborTag(Buffer.from("00", "hex"), 24)]))],
    ["reference script", withFirstOutput((output) => output.set(3, new CborTag(Buffer.from("00", "hex"), 24)))],
    ["legacy datum hash", withFirstOutput((output) => [output.get(0), output.get(1), Buffer.alloc(32)])],
    [
      "reward address output",
      withFirstOutput((output) => output.set(0, Buffer.concat([Buffer.from([0xe1]), keyHash]))),
    ],
  ];

  it.each(unsupported)("rejects %s before calling the device", async (_, tx) => {
    await expect(signWith(tx)).rejects.toThrow("wallet_trezor_method_not_supported");
    expect(signCalls).toHaveLength(0);
  });
});
