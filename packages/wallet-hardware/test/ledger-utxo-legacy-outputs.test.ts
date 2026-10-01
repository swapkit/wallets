import { describe, expect, it, mock } from "bun:test";
import {
  ApduResponse,
  DeviceActionStatus,
  type DeviceManagementKit,
  DmkResultStatus,
  type InternalApi,
} from "@ledgerhq/device-management-kit";
import { serializeTransactionOutputs } from "@ledgerhq/hw-app-btc/serializeTransaction";
import { splitTransaction } from "@ledgerhq/hw-app-btc/splitTransaction";
import Transport from "@ledgerhq/hw-transport";
import { hex } from "@scure/base";
import type { UTXOType } from "@swapkit/toolboxes/utxo";
import { OutScript, RawTx, Script, Transaction } from "@swapkit/utxo-signer";
import { from } from "rxjs";

import { BitcoinCashLedger, DashLedger, DogecoinLedger, LitecoinLedger } from "../src/ledger/clients/utxo";
import { splitOutputsForLegacyApp, withOutputAlignedFinalize } from "../src/ledger/clients/utxo-legacy-outputs";

// lib-app-bitcoin's MAX_OUTPUT_TO_CHECK.
const MAX_OUTPUT_TO_CHECK = 100;
const SW_OK = 0x9000;
const SW_INCORRECT_DATA = 0x6a80;
// HASH_INPUT_START P2 values that open a new transaction; 0x80 continues the current one.
const NEW_TRANSACTION_P2 = [0x00, 0x02, 0x03, 0x04, 0x05];

type Apdu = { cla: number; ins: number; p1: number; p2: number; data: Uint8Array };
type AppReply = { data: number[]; statusCode: number };

// CompactSize in the forms these tests send: one byte below 0xfd, or 0xfd and two bytes.
function readAppVarint(bytes: Uint8Array, offset: number) {
  const marker = bytes[offset];
  if (marker === undefined) return undefined;
  if (marker < 0xfd) return { size: 1, value: marker };
  if (marker !== 0xfd) throw new Error("The fake app reads only one- and three-byte CompactSize values");

  const [low, high] = [bytes[offset + 1], bytes[offset + 2]];
  return low === undefined || high === undefined ? undefined : { size: 3, value: low | (high << 8) };
}

/**
 * What lib-app-bitcoin (e369bc3), behind the Bitcoin Cash, Dash, Dogecoin and Litecoin apps, does with the outputs.
 * HASH_INPUT_START with a new-transaction P2 starts the first signing pass. During it HASH_INPUT_FINALIZE_FULL tests
 * each payload against the room left in the 100-byte output buffer before appending it (0x6a80 when it does not fit),
 * drops the output count, and shows each complete output, which leaves the buffer once the user approves it (here at
 * once). Approving the last output ends the pass: the outputs streamed for later inputs are hashed, not checked.
 */
function createLegacyBitcoinApp() {
  const apdus: Apdu[] = [];
  // `needed` is the buffer room the payload took: the bytes already waiting there plus the payload.
  const finalizeApdus: Array<Apdu & { needed: number }> = [];
  const approvedScripts: string[] = [];
  let checkingOutputs = false;
  let buffered = new Uint8Array();
  let remainingOutputs: number | undefined;

  function stopChecking() {
    checkingOutputs = false;
    buffered = new Uint8Array();
    remainingOutputs = undefined;
  }

  function approveCompleteOutputs() {
    if (remainingOutputs === undefined) {
      const count = readAppVarint(buffered, 0);
      if (!count) return;
      remainingOutputs = count.value;
      buffered = buffered.slice(count.size);
    }

    while (remainingOutputs > 0) {
      // An output is an 8-byte amount, the script length and the script.
      const scriptLength = readAppVarint(buffered, 8);
      const outputLength = scriptLength && 8 + scriptLength.size + scriptLength.value;
      if (!(scriptLength && outputLength) || buffered.length < outputLength) return;

      approvedScripts.push(hex.encode(buffered.subarray(8 + scriptLength.size, outputLength)));
      buffered = buffered.slice(outputLength);
      remainingOutputs -= 1;
    }

    stopChecking();
  }

  function finalizeFull(apdu: Apdu): AppReply {
    finalizeApdus.push({ ...apdu, needed: (checkingOutputs ? buffered.length : 0) + apdu.data.length });

    if (checkingOutputs) {
      if (buffered.length + apdu.data.length > MAX_OUTPUT_TO_CHECK) {
        stopChecking();
        return { data: [], statusCode: SW_INCORRECT_DATA };
      }
      buffered = new Uint8Array([...buffered, ...apdu.data]);
      approveCompleteOutputs();
    }

    return { data: apdu.p1 === 0x80 ? [0x00, 0x00] : [0x00], statusCode: SW_OK };
  }

  function respond(apdu: Apdu): AppReply {
    apdus.push(apdu);
    const { cla, ins, p1, p2 } = apdu;
    if (cla !== 0xe0) throw new Error(`Unexpected CLA 0x${cla.toString(16)}`);

    if (ins === 0x40) {
      const publicKey = [0x04, ...new Array(64).fill(0x11)];
      const address = [...Buffer.from("legacy-ledger-address")];
      return {
        data: [publicKey.length, ...publicKey, address.length, ...address, ...new Array(32).fill(0)],
        statusCode: SW_OK,
      };
    }
    // A trusted input: magic, nonce, previous txid and index, amount, HMAC.
    if (ins === 0x42) return { data: [0x32, 0x00, 0x00, 0x00, ...new Array(52).fill(0x09)], statusCode: SW_OK };
    if (ins === 0x44) {
      if (p1 === 0x00 && NEW_TRANSACTION_P2.includes(p2)) {
        stopChecking();
        checkingOutputs = true;
      }
      return { data: [], statusCode: SW_OK };
    }
    if (ins === 0x4a) return finalizeFull(apdu);
    if (ins === 0x48) return { data: [0x31, 0x44, ...new Array(68).fill(0x22), 0x41], statusCode: SW_OK };

    throw new Error(`Unexpected INS 0x${ins.toString(16)}`);
  }

  return { apdus, approvedScripts, finalizeApdus, respond };
}

type LegacyBitcoinApp = ReturnType<typeof createLegacyBitcoinApp>;

// A caller-injected LedgerJS transport; hw-transport's own `send` frames each APDU and checks its status word.
function createLegacyAppTransport(app: LegacyBitcoinApp) {
  const transport = new Transport();
  transport.exchange = (apdu: Buffer) => {
    const [cla = 0, ins = 0, p1 = 0, p2 = 0] = apdu;
    const { data, statusCode } = app.respond({ cla, data: apdu.subarray(5), ins, p1, p2 });
    return Promise.resolve(Buffer.from([...data, statusCode >> 8, statusCode & 0xff]));
  };
  return transport;
}

// The default path: the client opens the app through a DMK device action and talks to it over the bridge transport.
function createDmkHarness(app: LegacyBitcoinApp) {
  const executeDeviceAction = mock(
    ({
      deviceAction,
    }: {
      deviceAction: {
        input: {
          task: (internalApi: InternalApi) => Promise<{ data?: unknown; error?: unknown; status: DmkResultStatus }>;
        };
      };
    }) => {
      const sendCommand = (command: Parameters<InternalApi["sendCommand"]>[0]) => {
        const { cla, data, ins, p1, p2 } = command.getApdu();
        const reply = app.respond({ cla, data, ins, p1, p2 });
        const statusCode = new Uint8Array([reply.statusCode >> 8, reply.statusCode & 0xff]);
        return Promise.resolve(
          command.parseResponse(new ApduResponse({ data: new Uint8Array(reply.data), statusCode }), undefined),
        );
      };
      const completedState = async () => {
        const result = await deviceAction.input.task({ sendCommand } as unknown as InternalApi);
        return result.status === DmkResultStatus.Success
          ? { output: result.data, status: DeviceActionStatus.Completed }
          : { error: result.error, status: DeviceActionStatus.Error };
      };

      return { cancel: () => {}, observable: from(completedState()) };
    },
  );
  const dmk = { executeDeviceAction } as unknown as DeviceManagementKit;

  return { dmkSession: { dmk, sessionId: "legacy-utxo-session" }, executeDeviceAction };
}

const p2pkh = (fill: number) => OutScript.encode({ hash: new Uint8Array(20).fill(fill), type: "pkh" });
const p2wpkh = (fill: number) => OutScript.encode({ hash: new Uint8Array(20).fill(fill), type: "wpkh" });
const memoOfLength = (length: number) => "=:ETH.ETH:".padEnd(length, "0");

// What the SDK toolbox builds for a THORChain swap: the vault output, the memo, then the change.
function thorchainSwap({
  inputCount = 1,
  memoLength,
  script,
}: {
  inputCount?: number;
  memoLength: number;
  script: (fill: number) => Uint8Array;
}) {
  const tx = new Transaction({ allowUnknownOutputs: true, version: 1 });
  const inputUtxos: UTXOType[] = [];

  for (let index = 0; index < inputCount; index += 1) {
    const txHex = hex.encode(
      RawTx.encode({
        inputs: [
          {
            finalScriptSig: new Uint8Array(),
            index: 0,
            sequence: 0xffffffff,
            txid: new Uint8Array(32).fill(index + 3),
          },
        ],
        lockTime: 0,
        outputs: [{ amount: 1_000_000n, script: script(2) }],
        segwitFlag: undefined,
        version: 1,
        witnesses: undefined,
      }),
    );
    const previousTx = Transaction.fromRaw(hex.decode(txHex), { allowUnknownOutputs: true });
    tx.addInput({ index: 0, nonWitnessUtxo: hex.decode(txHex), txid: previousTx.id });
    inputUtxos.push({ hash: previousTx.id, index: 0, txHex, value: 1_000_000 });
  }

  const scripts = [script(1), Script.encode(["RETURN", new TextEncoder().encode(memoOfLength(memoLength))]), script(2)];
  const [vault, memo, change] = scripts as [Uint8Array, Uint8Array, Uint8Array];
  tx.addOutput({ amount: 500_000n, script: vault });
  tx.addOutput({ amount: 0n, script: memo });
  tx.addOutput({ amount: 400_000n * BigInt(inputCount), script: change });

  return { inputUtxos, scripts, tx };
}

// The output stream hw-app-btc hands to HASH_INPUT_FINALIZE_FULL.
function serialisedOutputs(tx: Transaction) {
  return serializeTransactionOutputs(splitTransaction(hex.encode(tx.unsignedTx), true));
}

// One APDU per output, the first carrying the output count (every script here is shorter than 0xfd bytes).
function outputAlignedApdus(scripts: Uint8Array[]) {
  return scripts.map((script, index) => ({
    length: (index === 0 ? 1 : 0) + 8 + 1 + script.length,
    p1: index === scripts.length - 1 ? 0x80 : 0x00,
  }));
}

function catchError(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to throw");
}

// BIP143 apps (Bitcoin Cash, segwit Litecoin) hash the outputs once per transaction; the others once per input.
const legacyClients = [
  { chain: "bitcoin-cash", client: BitcoinCashLedger, name: "Bitcoin Cash", path: "m/44'/145'/0'/0/0", script: p2pkh },
  { chain: "dash", client: DashLedger, name: "Dash", path: "m/44'/5'/0'/0/0", perInput: true, script: p2pkh },
  {
    chain: "dogecoin",
    client: DogecoinLedger,
    name: "Dogecoin",
    path: "m/44'/3'/0'/0/0",
    perInput: true,
    script: p2pkh,
  },
  { chain: "litecoin", client: LitecoinLedger, name: "Litecoin", path: "m/84'/2'/0'/0/0", script: p2wpkh },
];

function legacyClient(name: string) {
  const found = legacyClients.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No legacy client named ${name}`);
  return found;
}

describe("splitOutputsForLegacyApp", () => {
  it("cuts the outputs on output boundaries, the count riding on the first piece", () => {
    const { scripts, tx } = thorchainSwap({ memoLength: 74, script: p2pkh });
    const outputs = serialisedOutputs(tx);

    const pieces = splitOutputsForLegacyApp(outputs, "bitcoin-cash");

    expect(pieces.map((piece) => piece.length)).toEqual(outputAlignedApdus(scripts).map(({ length }) => length));
    expect(pieces.map((piece) => piece.length)).toEqual([35, 85, 34]);
    expect(hex.encode(Buffer.concat(pieces))).toBe(hex.encode(outputs));
  });

  it("accepts a 100-byte memo output and rejects a 101-byte one with its context", () => {
    const fits = serialisedOutputs(thorchainSwap({ memoLength: 88, script: p2pkh }).tx);
    const tooLong = serialisedOutputs(thorchainSwap({ memoLength: 89, script: p2pkh }).tx);

    expect(splitOutputsForLegacyApp(fits, "bitcoin-cash")[1]).toHaveLength(MAX_OUTPUT_TO_CHECK);
    expect(catchError(() => splitOutputsForLegacyApp(tooLong, "bitcoin-cash"))).toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
      info: { chain: "bitcoin-cash", maxLength: 100, outputIndex: 1, pieceLength: 101 },
    });
  });

  it("counts the output count against the first piece", () => {
    const memoOnly = Buffer.concat([
      Buffer.from([0x01]),
      Buffer.alloc(8),
      Buffer.from([91]),
      Script.encode(["RETURN", new Uint8Array(88)]),
    ]);

    expect(catchError(() => splitOutputsForLegacyApp(memoOnly, "dogecoin"))).toMatchObject({
      info: { outputIndex: 0, pieceLength: 101 },
    });
  });

  it("reads a three-byte output count", () => {
    // 253 outputs with an empty script: an 8-byte amount and a zero script length each.
    const outputs = Buffer.concat([Buffer.from([0xfd, 0xfd, 0x00]), Buffer.alloc(253 * 9)]);

    const pieces = splitOutputsForLegacyApp(outputs, "dash");

    expect(pieces).toHaveLength(253);
    expect(pieces.map((piece) => piece.length).slice(0, 3)).toEqual([12, 9, 9]);
  });

  it.each([
    ["no output count", ""],
    ["zero outputs", "00"],
    ["an 8-byte output count", `ff${"00".repeat(8)}`],
    ["a missing script length", `01${"00".repeat(8)}`],
    ["a truncated script", `01${"00".repeat(8)}1976a914`],
    ["trailing bytes", `01${"00".repeat(8)}00ff`],
  ])("rejects %s", (_, outputs) => {
    expect(catchError(() => splitOutputsForLegacyApp(hex.decode(outputs), "litecoin"))).toMatchObject({
      errorKey: "wallet_ledger_invalid_params",
      info: { chain: "litecoin", operation: "splitOutputsForLegacyApp" },
    });
  });
});

describe("withOutputAlignedFinalize", () => {
  it("holds the output chunks back, passes every other APDU through, and returns the device's last response", async () => {
    const sent: Array<[number, number, number, number, string]> = [];
    const transport = {
      send: (cla: number, ins: number, p1: number, p2: number, data: Buffer) => {
        sent.push([cla, ins, p1, p2, data.toString("hex")]);
        return Promise.resolve(Buffer.from([ins, 0x90, 0x00]));
      },
    } as unknown as Transport;
    const { tx } = thorchainSwap({ memoLength: 80, script: p2pkh });
    const outputs = serialisedOutputs(tx);
    const pieces = splitOutputsForLegacyApp(outputs, "dogecoin");
    const wrapped = withOutputAlignedFinalize(transport, "dogecoin");

    const responses = [
      await wrapped.send(0xe0, 0x44, 0x00, 0x00, Buffer.from("01", "hex")),
      await wrapped.send(0xe0, 0x4a, 0xff, 0x00, Buffer.from("00", "hex")),
    ];
    // hw-app-btc's hashOutputFull: 50-byte chunks, P1 0x80 on the last.
    for (let offset = 0; offset < outputs.length; offset += 50) {
      const p1 = offset + 50 >= outputs.length ? 0x80 : 0x00;
      responses.push(await wrapped.send(0xe0, 0x4a, p1, 0x00, outputs.subarray(offset, offset + 50)));
    }

    expect(outputs).toHaveLength(161);
    expect(responses.map((response) => response.toString("hex"))).toEqual([
      "449000",
      "4a9000",
      "009000",
      "009000",
      "009000",
      "4a9000",
    ]);
    expect(sent).toEqual([
      [0xe0, 0x44, 0x00, 0x00, "01"],
      [0xe0, 0x4a, 0xff, 0x00, "00"],
      ...pieces.map((piece, index): [number, number, number, number, string] => [
        0xe0,
        0x4a,
        index === pieces.length - 1 ? 0x80 : 0x00,
        0x00,
        hex.encode(piece),
      ]),
    ]);
  });
});

describe("legacy UTXO Ledger apps sign THORChain swaps with a memo (API-3863)", () => {
  const memoCases = legacyClients.flatMap(({ name }) =>
    [51, 58, 74, 80, 88].map((memoLength) => [name, memoLength] as const),
  );

  it.each(memoCases)("%s signs a swap with a %i-byte memo, one output per finalize APDU", async (name, memoLength) => {
    const { client, path, script } = legacyClient(name);
    const app = createLegacyBitcoinApp();
    const { inputUtxos, scripts, tx } = thorchainSwap({ memoLength, script });
    const outputs = serialisedOutputs(tx);

    const signedTx = await client({ derivationPath: path, transport: createLegacyAppTransport(app) }).signTransaction(
      tx,
      inputUtxos,
    );

    expect(signedTx).toContain(hex.encode(outputs));
    expect(app.approvedScripts).toEqual(scripts.map((output) => hex.encode(output)));
    expect(app.finalizeApdus.map(({ data, p1 }) => ({ length: data.length, p1 }))).toEqual(outputAlignedApdus(scripts));
    expect(Math.max(...app.finalizeApdus.map(({ needed }) => needed))).toBeLessThanOrEqual(MAX_OUTPUT_TO_CHECK);
    expect(hex.encode(Buffer.concat(app.finalizeApdus.map(({ data }) => data)))).toBe(hex.encode(outputs));
  });

  it.each([
    ["Dogecoin", 2],
    ["Dogecoin", 3],
    ["Dash", 3],
    ["Bitcoin Cash", 3],
    ["Litecoin", 3],
  ] as const)("%s signs a %i-input swap, re-chunking every output stream", async (name, inputCount) => {
    const { client, path, perInput, script } = legacyClient(name);
    const app = createLegacyBitcoinApp();
    const { inputUtxos, scripts, tx } = thorchainSwap({ inputCount, memoLength: 80, script });
    const outputs = serialisedOutputs(tx);
    const streams = perInput ? inputCount : 1;

    const signedTx = await client({ derivationPath: path, transport: createLegacyAppTransport(app) }).signTransaction(
      tx,
      inputUtxos,
    );

    expect(signedTx).toContain(hex.encode(outputs));
    expect(app.approvedScripts).toEqual(scripts.map((output) => hex.encode(output)));
    expect(app.finalizeApdus.map(({ data, p1 }) => ({ length: data.length, p1 }))).toEqual(
      Array.from({ length: streams }, () => outputAlignedApdus(scripts)).flat(),
    );
    expect(Math.max(...app.finalizeApdus.map(({ needed }) => needed))).toBeLessThanOrEqual(MAX_OUTPUT_TO_CHECK);
  });

  it.each([
    ["Bitcoin Cash", 1],
    ["Dogecoin", 2],
  ] as const)("%s re-chunks a %i-input swap over the DMK bridge", async (name, inputCount) => {
    const { client, path, perInput, script } = legacyClient(name);
    const app = createLegacyBitcoinApp();
    const { dmkSession, executeDeviceAction } = createDmkHarness(app);
    const { inputUtxos, scripts, tx } = thorchainSwap({ inputCount, memoLength: 80, script });

    const signedTx = await client({ derivationPath: path, dmkSession }).signTransaction(tx, inputUtxos);

    expect(signedTx).toContain(hex.encode(serialisedOutputs(tx)));
    expect(executeDeviceAction).toHaveBeenCalledTimes(1);
    expect(app.finalizeApdus.map(({ data, p1 }) => ({ length: data.length, p1 }))).toEqual(
      Array.from({ length: perInput ? inputCount : 1 }, () => outputAlignedApdus(scripts)).flat(),
    );
  });

  it.each(
    legacyClients.map(({ name }) => name),
  )("%s rejects an 89-byte memo the app cannot check before any APDU", async (name) => {
    const { chain, client, path, script } = legacyClient(name);
    const { inputUtxos, tx } = thorchainSwap({ memoLength: 89, script });
    const tooLong = {
      errorKey: "wallet_ledger_invalid_params",
      info: { chain, maxLength: 100, outputIndex: 1, pieceLength: 101 },
    };
    const app = createLegacyBitcoinApp();
    const injected = client({ derivationPath: path, transport: createLegacyAppTransport(app) });
    const dmkApp = createLegacyBitcoinApp();
    const { dmkSession, executeDeviceAction } = createDmkHarness(dmkApp);
    const overDmk = client({ derivationPath: path, dmkSession });

    await expect(injected.signTransaction(tx, inputUtxos)).rejects.toMatchObject(tooLong);
    await expect(injected.signTransactionWithMultiplePaths(tx, inputUtxos, [path])).rejects.toMatchObject(tooLong);
    await expect(overDmk.signTransaction(tx, inputUtxos)).rejects.toMatchObject(tooLong);

    expect(app.apdus).toEqual([]);
    expect(dmkApp.apdus).toEqual([]);
    expect(executeDeviceAction).not.toHaveBeenCalled();
  });
});
