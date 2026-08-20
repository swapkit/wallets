import { describe, expect, it, mock } from "bun:test";
import { type StdSignDoc, serializeSignDoc } from "@cosmjs/amino";
import {
  ApduResponse,
  CallTaskInAppDeviceAction,
  DeviceActionStatus,
  type DeviceManagementKit,
  DmkResultStatus,
  type InternalApi,
  UserInteractionRequired,
} from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { base64, hex } from "@scure/base";
import { concat, from, of } from "rxjs";

import { normalizeThorchainLedgerSignDoc, THORChainLedger } from "../src/ledger/clients/thorchain";
import {
  getThorAddressCommand,
  getThorSignCommands,
  serializeThorPath,
} from "../src/ledger/clients/thorchain/protocol";

interface ThorDmkAction {
  input: {
    appName: string;
    requiredUserInteraction: UserInteractionRequired;
    skipOpenApp: boolean;
    task: (internalApi: InternalApi) => Promise<{ data?: unknown; error?: unknown; status: DmkResultStatus }>;
  };
}

interface ThorDmkExchange {
  cla: number;
  data: Uint8Array;
  ins: number;
  p1: number;
  p2: number;
}

function createThorDmkHarness({ version }: { version: string }) {
  const actions: Array<{ deviceAction: ThorDmkAction; sessionId: string }> = [];
  const exchanges: ThorDmkExchange[] = [];
  const publicSendCommand = mock(() => Promise.reject(new Error("Public DMK sendCommand must not be called")));
  const disconnect = mock(() => Promise.resolve());
  const executeDeviceAction = mock(
    ({ deviceAction, sessionId }: { deviceAction: ThorDmkAction; sessionId: string }) => {
      actions.push({ deviceAction, sessionId });

      const completedState = async () => {
        const sendCommand = mock((command: Parameters<InternalApi["sendCommand"]>[0]) => {
          const apdu = command.getApdu();
          exchanges.push({ cla: apdu.cla, data: apdu.data, ins: apdu.ins, p1: apdu.p1, p2: apdu.p2 });
          const data =
            apdu.ins === 0x02 && apdu.p1 === 0x02
              ? Uint8Array.of(0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02)
              : new Uint8Array();

          return Promise.resolve(
            command.parseResponse(new ApduResponse({ data, statusCode: Uint8Array.of(0x90, 0x00) }), undefined),
          );
        }) as InternalApi["sendCommand"];
        const internalApi = {
          getDeviceSessionState: () => ({ currentApp: { name: "THORChain", version } }),
          sendCommand,
        } as unknown as InternalApi;
        const result = await deviceAction.input.task(internalApi);

        return result.status === DmkResultStatus.Success
          ? { output: result.data, status: DeviceActionStatus.Completed }
          : { error: result.error, status: DeviceActionStatus.Error };
      };

      return {
        cancel: mock(() => {}),
        observable: concat(
          of({
            intermediateValue: { requiredUserInteraction: deviceAction.input.requiredUserInteraction },
            status: DeviceActionStatus.Pending,
          }),
          from(completedState()),
        ),
      };
    },
  );
  const dmk = { disconnect, executeDeviceAction, sendCommand: publicSendCommand } as unknown as DeviceManagementKit;

  return {
    actions,
    disconnect,
    dmkSession: { dmk, sessionId: "thor-session" },
    exchanges,
    executeDeviceAction,
    publicSendCommand,
  };
}

describe("ledger THORChain protocol", () => {
  it("serializes the app v2 derivation path as five little-endian integers", () => {
    expect(Array.from(serializeThorPath({ path: [44, 931, 0, 0, 7] }))).toEqual([
      44, 0, 0, 128, 163, 3, 0, 128, 0, 0, 0, 128, 0, 0, 0, 0, 7, 0, 0, 0,
    ]);
  });

  it("builds the address APDU with the selected HRP and device confirmation flag", () => {
    const apdu = getThorAddressCommand({ checkOnDevice: true, hrp: "sthor", path: [44, 931, 0, 0, 0] }).getApdu();

    expect({ cla: apdu.cla, data: Array.from(apdu.data), ins: apdu.ins, p1: apdu.p1, p2: apdu.p2 }).toEqual({
      cla: 0x55,
      data: [5, 115, 116, 104, 111, 114, 44, 0, 0, 128, 163, 3, 0, 128, 0, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0],
      ins: 0x04,
      p1: 1,
      p2: 0,
    });
  });

  it("keeps every signing chunk inside one app-v2 command sequence", () => {
    const message = Uint8Array.from({ length: 501 }, (_, index) => index % 256);
    const commands = getThorSignCommands({ message, path: [44, 931, 0, 0, 0] }).map((command) => command.getApdu());

    expect(commands.map(({ cla, data, ins, p1, p2 }) => ({ cla, dataLength: data.length, ins, p1, p2 }))).toEqual([
      { cla: 0x55, dataLength: 20, ins: 0x02, p1: 0, p2: 0 },
      { cla: 0x55, dataLength: 250, ins: 0x02, p1: 1, p2: 0 },
      { cla: 0x55, dataLength: 250, ins: 0x02, p1: 1, p2: 0 },
      { cla: 0x55, dataLength: 1, ins: 0x02, p1: 2, p2: 0 },
    ]);
  });

  it("rejects derivation paths that app v2 cannot consume", () => {
    expect(() => serializeThorPath({ path: [44, 931, 0, 0] })).toThrow("wallet_ledger_invalid_params");
    expect(() => serializeThorPath({ path: [44, 931, undefined, 0, 0] })).toThrow("wallet_ledger_invalid_params");
  });

  it("normalizes legacy toolbox deposit assets to canonical Ledger Amino bytes", () => {
    const signDoc = {
      account_number: "1",
      chain_id: "thorchain-1",
      fee: { amount: [], gas: "500000" },
      memo: "",
      msgs: [
        {
          type: "thorchain/MsgDeposit",
          value: {
            coins: [{ amount: "123", asset: { chain: "THOR", symbol: "RUNE", synth: false, ticker: "RUNE" } }],
            memo: "=:BTC.BTC:bc1recipient",
            signer: "thor1signer",
          },
        },
      ],
      sequence: "2",
    };

    const normalized = normalizeThorchainLedgerSignDoc(signDoc);

    expect(normalized.msgs[0]).toMatchObject({
      type: "thorchain/MsgDeposit",
      value: { coins: [{ amount: "123", asset: "THOR.RUNE" }] },
    });
    expect(hex.encode(serializeSignDoc(normalized))).toBe(
      "7b226163636f756e745f6e756d626572223a2231222c22636861696e5f6964223a2274686f72636861696e2d31222c22666565223a7b22616d6f756e74223a5b5d2c22676173223a22353030303030227d2c226d656d6f223a22222c226d736773223a5b7b2274797065223a2274686f72636861696e2f4d73674465706f736974222c2276616c7565223a7b22636f696e73223a5b7b22616d6f756e74223a22313233222c226173736574223a2254484f522e52554e45227d5d2c226d656d6f223a223d3a4254432e4254433a626331726563697069656e74222c227369676e6572223a2274686f72317369676e6572227d7d5d2c2273657175656e6365223a2232227d",
    );
  });

  it("normalizes native and synth assets only at the signAmino serialization boundary", async () => {
    const signerAddress = "thor1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5e949nr";
    const publicKey = Uint8Array.from([0x02, ...new Uint8Array(32).fill(0x11)]);
    const signingChunks: Uint8Array[] = [];
    const signingCalls: Array<{ dataLength: number; p1: number }> = [];
    const signDoc: StdSignDoc = {
      account_number: "7",
      chain_id: "thorchain-1",
      fee: { amount: [], gas: "500000000" },
      memo: "outer",
      msgs: [
        {
          type: "thorchain/MsgDeposit",
          value: {
            coins: [
              { amount: "123", asset: { chain: "THOR", symbol: "RUNE", synth: false, ticker: "RUNE" } },
              { amount: "456", asset: { chain: "BTC", symbol: "BTC", synth: true, ticker: "BTC" } },
            ],
            memo: "=:BTC.BTC:bc1recipient",
            signer: signerAddress,
          },
        },
      ],
      sequence: "9",
    };
    const expectedPayload =
      `{"account_number":"7","chain_id":"thorchain-1","fee":{"amount":[],"gas":"500000000"},` +
      `"memo":"outer","msgs":[{"type":"thorchain/MsgDeposit","value":{"coins":[` +
      `{"amount":"123","asset":"THOR.RUNE"},{"amount":"456","asset":"BTC/BTC"}],` +
      `"memo":"=:BTC.BTC:bc1recipient","signer":"${signerAddress}"}}],"sequence":"9"}`;
    const transport = {
      send: (_cla: number, ins: number, p1: number, _p2: number, data = new Uint8Array()) => {
        if (ins === 0x00) return Buffer.from([0x00, 0x02, 0x05, 0x01, 0x90, 0x00]);
        if (ins === 0x04) return Buffer.from([...publicKey, ...new TextEncoder().encode(signerAddress), 0x90, 0x00]);

        signingCalls.push({ dataLength: data.length, p1 });
        if (p1 !== 0x00) signingChunks.push(Uint8Array.from(data));
        if (p1 === 0x02) {
          return Buffer.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x90, 0x00]);
        }
        return Buffer.from([0x90, 0x00]);
      },
    } as unknown as Transport;
    const ledger = new THORChainLedger({ derivationPath: [44, 931, 0, 0, 0], transport });

    const response = await ledger.signAmino(signerAddress, signDoc);
    const serializedPayload = Uint8Array.from(signingChunks.flatMap((chunk) => Array.from(chunk)));
    const fixedSignature = Uint8Array.from([...new Uint8Array(31), 0x01, ...new Uint8Array(31), 0x02]);

    expect(new TextDecoder().decode(serializedPayload)).toBe(expectedPayload);
    expect(signingCalls).toEqual([
      { dataLength: 20, p1: 0x00 },
      { dataLength: 250, p1: 0x01 },
      { dataLength: 85, p1: 0x02 },
    ]);
    expect(response.signature).toEqual({
      pub_key: { type: "tendermint/PubKeySecp256k1", value: base64.encode(publicKey) },
      signature: base64.encode(fixedSignature),
    });
    expect(response.signed).toBe(signDoc);
    expect(signDoc.msgs[0]?.value.coins).toEqual([
      { amount: "123", asset: { chain: "THOR", symbol: "RUNE", synth: false, ticker: "RUNE" } },
      { amount: "456", asset: { chain: "BTC", symbol: "BTC", synth: true, ticker: "BTC" } },
    ]);
  });

  it("executes every app-v2 signing chunk atomically through one real DMK action", async () => {
    const v2Harness = createThorDmkHarness({ version: "2.5.1" });
    const v2Progress: Array<{ requiredUserInteraction: string | null; status: string }> = [];
    const v2Ledger = new THORChainLedger({
      derivationPath: [44, 931, 0, 0, 0],
      dmkSession: v2Harness.dmkSession,
      onDeviceActionState: (state) => {
        v2Progress.push({
          requiredUserInteraction:
            state.status === DeviceActionStatus.Pending ? state.intermediateValue.requiredUserInteraction : null,
          status: state.status,
        });
      },
    });

    const signature = await v2Ledger.sign("x".repeat(501));

    expect(Buffer.from(base64.decode(signature)).toString("hex")).toBe(`${"00".repeat(31)}01${"00".repeat(31)}02`);
    expect(v2Harness.executeDeviceAction).toHaveBeenCalledTimes(1);
    expect(v2Harness.actions[0]?.deviceAction).toBeInstanceOf(CallTaskInAppDeviceAction);
    expect(
      v2Harness.actions.map(({ deviceAction, sessionId }) => ({
        appName: deviceAction.input.appName,
        requiredUserInteraction: deviceAction.input.requiredUserInteraction,
        sessionId,
        skipOpenApp: deviceAction.input.skipOpenApp,
      })),
    ).toEqual([
      {
        appName: "THORChain",
        requiredUserInteraction: UserInteractionRequired.SignTransaction,
        sessionId: "thor-session",
        skipOpenApp: false,
      },
    ]);
    expect(
      v2Harness.exchanges.map(({ cla, data, ins, p1, p2 }) => ({ cla, dataLength: data.length, ins, p1, p2 })),
    ).toEqual([
      { cla: 0x55, dataLength: 20, ins: 0x02, p1: 0x00, p2: 0x00 },
      { cla: 0x55, dataLength: 250, ins: 0x02, p1: 0x01, p2: 0x00 },
      { cla: 0x55, dataLength: 250, ins: 0x02, p1: 0x01, p2: 0x00 },
      { cla: 0x55, dataLength: 1, ins: 0x02, p1: 0x02, p2: 0x00 },
    ]);
    expect(v2Progress).toEqual([
      { requiredUserInteraction: UserInteractionRequired.SignTransaction, status: DeviceActionStatus.Pending },
      { requiredUserInteraction: null, status: DeviceActionStatus.Completed },
    ]);
    expect(v2Harness.publicSendCommand).toHaveBeenCalledTimes(0);
    expect(v2Harness.disconnect).toHaveBeenCalledTimes(0);

    const v1Harness = createThorDmkHarness({ version: "1.9.0" });
    const v1Progress: Array<{ requiredUserInteraction: string | null; status: string }> = [];
    const v1Ledger = new THORChainLedger({
      derivationPath: [44, 931, 0, 0, 0],
      dmkSession: v1Harness.dmkSession,
      onDeviceActionState: (state) => {
        v1Progress.push({
          requiredUserInteraction:
            state.status === DeviceActionStatus.Pending ? state.intermediateValue.requiredUserInteraction : null,
          status: state.status,
        });
      },
    });

    await expect(v1Ledger.sign("x")).rejects.toMatchObject({
      _tag: "InvalidResponseFormatError",
      originalError: { message: "THORChain Ledger app major 2 is required, received 1.9.0" },
    });
    expect(v1Harness.executeDeviceAction).toHaveBeenCalledTimes(1);
    expect(v1Harness.actions[0]?.deviceAction).toBeInstanceOf(CallTaskInAppDeviceAction);
    expect(
      v1Harness.actions.map(({ deviceAction, sessionId }) => ({
        appName: deviceAction.input.appName,
        requiredUserInteraction: deviceAction.input.requiredUserInteraction,
        sessionId,
        skipOpenApp: deviceAction.input.skipOpenApp,
      })),
    ).toEqual([
      {
        appName: "THORChain",
        requiredUserInteraction: UserInteractionRequired.SignTransaction,
        sessionId: "thor-session",
        skipOpenApp: false,
      },
    ]);
    expect(v1Harness.exchanges).toEqual([]);
    expect(v1Progress).toEqual([
      { requiredUserInteraction: UserInteractionRequired.SignTransaction, status: DeviceActionStatus.Pending },
      { requiredUserInteraction: null, status: DeviceActionStatus.Error },
    ]);
    expect(v1Harness.publicSendCommand).toHaveBeenCalledTimes(0);
    expect(v1Harness.disconnect).toHaveBeenCalledTimes(0);
  });

  it("keeps the complete legacy fallback signing exchange scoped to app v2", async () => {
    const calls: Array<{ data: number[]; ins: number; p1: number }> = [];
    const transport = {
      send: (_cla: number, ins: number, p1: number, _p2: number, data = new Uint8Array()) => {
        calls.push({ data: Array.from(data), ins, p1 });
        if (ins === 0) return Buffer.from([0, 2, 5, 1, 0x90, 0x00]);
        if (p1 === 0) return Buffer.from([0x90, 0x00]);
        return Buffer.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02, 0x90, 0x00]);
      },
    } as unknown as Transport;
    const ledger = new THORChainLedger({ derivationPath: [44, 931, 0, 0, 0], transport });

    const signature = await ledger.sign("hello");

    expect(Buffer.from(base64.decode(signature)).toString("hex")).toBe(`${"00".repeat(31)}01${"00".repeat(31)}02`);
    expect(calls).toEqual([
      { data: [], ins: 0, p1: 0 },
      { data: [44, 0, 0, 128, 163, 3, 0, 128, 0, 0, 0, 128, 0, 0, 0, 0, 0, 0, 0, 0], ins: 2, p1: 0 },
      { data: [104, 101, 108, 108, 111], ins: 2, p1: 2 },
    ]);
  });
});
