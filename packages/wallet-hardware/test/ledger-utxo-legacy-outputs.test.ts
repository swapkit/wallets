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

// lib-app-bitcoin's MAX_OUTPUT_TO_CHECK, TRUSTED_INPUT_TOTAL_SIZE and MAGIC_TRUSTED_INPUT.
const MAX_OUTPUT_TO_CHECK = 100;
const TRUSTED_INPUT_TOTAL_SIZE = 56;
const MAGIC_TRUSTED_INPUT = 0x32;
const SW_OK = 0x9000;
const SW_INCORRECT_DATA = 0x6a80;
// HASH_INPUT_START P2 values that open a new transaction; 0x80 continues the current one.
const NEW_TRANSACTION_P2 = [0x00, 0x02, 0x03, 0x04, 0x05];
// The flag byte in front of an input passed to HASH_INPUT_START as a trusted input.
const TRUSTED_INPUT_FLAG = 0x01;

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
 * GET_TRUSTED_INPUT hashes the previous transaction as it streams in, and HASH_INPUT_START accepts only trusted inputs
 * the app issued.
 */
function createLegacyBitcoinApp() {
  const apdus: Apdu[] = [];
  // `needed` is the buffer room the payload took: the bytes already waiting there plus the payload.
  const finalizeApdus: Array<Apdu & { needed: number }> = [];
  const approvedScripts: string[] = [];
  let checkingOutputs = false;
  let buffered = new Uint8Array();
  let remainingOutputs: number | undefined;
  // The output index and the previous transaction streamed so far to GET_TRUSTED_INPUT.
  let previousTxStream: { bytes: Uint8Array; index: number } | undefined;
  const trustedInputs: Array<{ index: number; txid: string; value: string }> = [];
  // The P2 of every HASH_INPUT_START that opened a transaction, and the flag byte of every input it was sent.
  const newTransactionP2s: number[] = [];
  const inputFlags: number[] = [];

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

  // Returns the trusted input once the previous transaction is complete: magic, flags, nonce, txid, output index,
  // amount and an HMAC (a stand-in: hashInputStart accepts only trusted inputs this fake issued).
  function getTrustedInput({ data, p1 }: Apdu): AppReply {
    if (p1 === 0x00) {
      const index = new DataView(data.buffer, data.byteOffset, 4).getUint32(0);
      previousTxStream = { bytes: data.slice(4), index };
    } else if (previousTxStream) {
      previousTxStream.bytes = new Uint8Array([...previousTxStream.bytes, ...data]);
    } else {
      return { data: [], statusCode: SW_INCORRECT_DATA };
    }

    let previousTx: Transaction;
    try {
      previousTx = Transaction.fromRaw(previousTxStream.bytes, { allowUnknownOutputs: true });
    } catch {
      // Not complete yet: hw-app-btc is still streaming it.
      return { data: [], statusCode: SW_OK };
    }

    const { index } = previousTxStream;
    previousTxStream = undefined;
    if (index >= previousTx.outputsLength) return { data: [], statusCode: SW_INCORRECT_DATA };

    const trustedInput = new Uint8Array(TRUSTED_INPUT_TOTAL_SIZE);
    const view = new DataView(trustedInput.buffer);
    trustedInput.set([MAGIC_TRUSTED_INPUT, 0x00, 0x00, trustedInputs.length]);
    trustedInput.set(hex.decode(previousTx.id).reverse(), 4);
    view.setUint32(36, index, true);
    view.setBigUint64(40, previousTx.getOutput(index).amount ?? 0n, true);
    trustedInput.fill(0x0a, 48);
    trustedInputs.push({ index, txid: previousTx.id, value: hex.encode(trustedInput) });

    return { data: [...trustedInput], statusCode: SW_OK };
  }

  function hashInputStart({ data, p1, p2 }: Apdu): AppReply {
    if (p1 === 0x00 && NEW_TRANSACTION_P2.includes(p2)) {
      stopChecking();
      checkingOutputs = true;
      newTransactionP2s.push(p2);
    }

    // hash_input_start.c's IS_INPUT: the APDU that carries an input's flag byte and its (trusted) input.
    const [flag = 0xff] = data;
    const isInput = p1 === 0x80 && data.length - 1 > 8 && data.length - 1 <= TRUSTED_INPUT_TOTAL_SIZE + 2 && flag <= 2;
    if (!isInput) return { data: [], statusCode: SW_OK };

    inputFlags.push(flag);
    if (flag === TRUSTED_INPUT_FLAG) {
      const value = hex.encode(data.subarray(2, 2 + TRUSTED_INPUT_TOTAL_SIZE));
      const issued = data[1] === TRUSTED_INPUT_TOTAL_SIZE && trustedInputs.some((input) => input.value === value);
      return { data: [], statusCode: issued ? SW_OK : SW_INCORRECT_DATA };
    }
    return { data: [], statusCode: SW_OK };
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
    if (ins === 0x42) return getTrustedInput(apdu);
    if (ins === 0x44) return hashInputStart(apdu);
    if (ins === 0x4a) return finalizeFull(apdu);
    // A signature that ends with the sighash type requested in the APDU's last byte.
    if (ins === 0x48) {
      return { data: [0x31, 0x44, ...new Array(68).fill(0x22), apdu.data.at(-1) ?? 0], statusCode: SW_OK };
    }

    throw new Error(`Unexpected INS 0x${ins.toString(16)} (P1 0x${p1.toString(16)}, P2 0x${p2.toString(16)})`);
  }

  return { apdus, approvedScripts, finalizeApdus, inputFlags, newTransactionP2s, respond, trustedInputs };
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
const memoScript = (length: number) => Script.encode(["RETURN", new TextEncoder().encode(memoOfLength(length))]);

// What the SDK toolbox builds for a THORChain swap: the vault output, the memo, then the change. With
// `previousMemoLength` every input spends the change of an earlier swap with a memo of that length.
function thorchainSwap({
  inputCount = 1,
  memoLength,
  previousMemoLength,
  script,
}: {
  inputCount?: number;
  memoLength: number;
  previousMemoLength?: number;
  script: (fill: number) => Uint8Array;
}) {
  const tx = new Transaction({ allowUnknownOutputs: true, version: 1 });
  const inputUtxos: UTXOType[] = [];
  const previousOutputs =
    previousMemoLength === undefined
      ? [{ amount: 1_000_000n, script: script(2) }]
      : [
          { amount: 500_000n, script: script(1) },
          { amount: 0n, script: memoScript(previousMemoLength) },
          { amount: 1_000_000n, script: script(2) },
        ];
  const spentIndex = previousOutputs.length - 1;

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
        outputs: previousOutputs,
        segwitFlag: undefined,
        version: 1,
        witnesses: undefined,
      }),
    );
    const previousTx = Transaction.fromRaw(hex.decode(txHex), { allowUnknownOutputs: true });
    tx.addInput({ index: spentIndex, nonWitnessUtxo: hex.decode(txHex), txid: previousTx.id });
    inputUtxos.push({ hash: previousTx.id, index: spentIndex, txHex, value: 1_000_000 });
  }

  const scripts = [script(1), memoScript(memoLength), script(2)];
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

// The previous output each input spends and the sighash type that ends its signature, read from the signed transaction.
function signedInputs(signedTx: string) {
  const signed = Transaction.fromRaw(hex.decode(signedTx), { allowUnknownOutputs: true });

  return Array.from({ length: signed.inputsLength }, (_, inputIndex) => {
    const { finalScriptSig, index, txid } = signed.getInput(inputIndex);
    const [signature] = Script.decode(finalScriptSig ?? new Uint8Array());
    return {
      index,
      sigHashType: signature instanceof Uint8Array ? signature.at(-1) : undefined,
      txid: txid && hex.encode(txid),
    };
  });
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

describe("the Bitcoin Cash Ledger app shows CashAddr outputs and verified inputs", () => {
  const bitcoinCash = legacyClient("Bitcoin Cash");
  const apdusWith = (app: LegacyBitcoinApp, ins: number) => app.apdus.filter((apdu) => apdu.ins === ins);

  it.each([
    ["one input", 1, "signTransaction", "transport"],
    ["two inputs", 2, "signTransaction", "transport"],
    ["two inputs from two addresses", 2, "signTransactionWithMultiplePaths", "transport"],
    ["two inputs over the DMK bridge", 2, "signTransaction", "dmk"],
  ] as const)("signs %s with HASH_INPUT_START P2 0x03, trusted inputs and SIGHASH_FORKID", async (_, inputCount, method, connection) => {
    const app = createLegacyBitcoinApp();
    const { inputUtxos, scripts, tx } = thorchainSwap({ inputCount, memoLength: 80, script: p2pkh });
    const client = bitcoinCash.client(
      connection === "dmk"
        ? { derivationPath: bitcoinCash.path, dmkSession: createDmkHarness(app).dmkSession }
        : { derivationPath: bitcoinCash.path, transport: createLegacyAppTransport(app) },
    );

    const signedTx =
      method === "signTransaction"
        ? await client.signTransaction(tx, inputUtxos)
        : await client.signTransactionWithMultiplePaths(
            tx,
            inputUtxos,
            [bitcoinCash.path, "m/44'/145'/0'/1/0"].slice(0, inputCount),
          );

    // P2 0x03 opens BIP143 signing with the outputs shown as CashAddr; the later passes continue that transaction.
    expect(apdusWith(app, 0x44)[0]).toMatchObject({ p1: 0x00, p2: 0x03 });
    expect(app.newTransactionP2s).toEqual([0x03]);
    // One GET_TRUSTED_INPUT per input, streaming the whole previous transaction: the app's txid is the UTXO's.
    expect(apdusWith(app, 0x42).filter(({ p1 }) => p1 === 0x00)).toHaveLength(inputCount);
    expect(app.trustedInputs.map(({ index, txid }) => ({ index, txid }))).toEqual(
      inputUtxos.map(({ hash, index }) => ({ index, txid: hash })),
    );
    // Trusted inputs only: every input in the first pass, then the input being signed in each later pass.
    expect(app.inputFlags).toEqual(new Array(2 * inputCount).fill(TRUSTED_INPUT_FLAG));
    // The outputs are still sent one per APDU, and checked once because BIP143 hashes them once.
    expect(app.finalizeApdus.map(({ data, p1 }) => ({ length: data.length, p1 }))).toEqual(outputAlignedApdus(scripts));
    expect(Math.max(...app.finalizeApdus.map(({ needed }) => needed))).toBeLessThanOrEqual(MAX_OUTPUT_TO_CHECK);
    expect(app.approvedScripts).toEqual(scripts.map((output) => hex.encode(output)));
    // SIGHASH_ALL | SIGHASH_FORKID requested for every input and carried by its signature.
    expect(apdusWith(app, 0x48).map(({ data }) => data.at(-1))).toEqual(new Array(inputCount).fill(0x41));
    expect(signedTx).toContain(hex.encode(serialisedOutputs(tx)));
    expect(signedInputs(signedTx)).toEqual(
      inputUtxos.map(({ hash, index }) => ({ index, sigHashType: 0x41, txid: hash })),
    );
  });

  it("streams a previous transaction with the largest standard memo to GET_TRUSTED_INPUT unsplit", async () => {
    const app = createLegacyBitcoinApp();
    const { inputUtxos, tx } = thorchainSwap({ memoLength: 80, previousMemoLength: 220, script: p2pkh });
    const [utxo] = inputUtxos;

    const signedTx = await bitcoinCash
      .client({ derivationPath: bitcoinCash.path, transport: createLegacyAppTransport(app) })
      .signTransaction(tx, inputUtxos);

    // GET_TRUSTED_INPUT hashes output scripts as they stream in, without the 100-byte buffer that checks the outputs
    // being signed, so a previous output (amount, script length, script) goes in one APDU of up to 255 bytes.
    const memoOutput = Buffer.concat([Buffer.alloc(8), Buffer.from([223]), memoScript(220)]);
    expect(memoOutput).toHaveLength(232);
    expect(apdusWith(app, 0x42).map(({ data }) => hex.encode(data))).toContain(hex.encode(memoOutput));
    expect(app.trustedInputs).toMatchObject([{ index: 2, txid: utxo?.hash }]);
    expect(signedInputs(signedTx)).toEqual([{ index: 2, sigHashType: 0x41, txid: utxo?.hash }]);
  });
});

describe("the other legacy UTXO Ledger apps keep their signing mode", () => {
  const apdusWith = (app: LegacyBitcoinApp, ins: number) => app.apdus.filter((apdu) => apdu.ins === ins);

  it.each([
    ["Dash", 0x00, 0x01],
    ["Dogecoin", 0x00, 0x01],
    ["Litecoin", 0x02, 0x01],
  ] as const)("%s keeps its HASH_INPUT_START mode, trusted inputs and sighash type", async (name, p2, sigHashType) => {
    const { client, path, script } = legacyClient(name);
    const app = createLegacyBitcoinApp();
    const { inputUtxos, tx } = thorchainSwap({ inputCount: 2, memoLength: 80, script });

    await client({ derivationPath: path, transport: createLegacyAppTransport(app) }).signTransaction(tx, inputUtxos);

    expect(app.newTransactionP2s).toEqual([p2]);
    expect(app.trustedInputs.map(({ index, txid }) => ({ index, txid }))).toEqual(
      inputUtxos.map(({ hash, index }) => ({ index, txid: hash })),
    );
    expect(new Set(app.inputFlags)).toEqual(new Set([TRUSTED_INPUT_FLAG]));
    expect(apdusWith(app, 0x48).map(({ data }) => data.at(-1))).toEqual([sigHashType, sigHashType]);
  });
});
