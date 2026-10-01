import { describe, expect, it, mock } from "bun:test";
import {
  ApduResponse,
  DeviceActionStatus,
  type DeviceManagementKit,
  DmkResultStatus,
  type InternalApi,
  UserInteractionRequired,
} from "@ledgerhq/device-management-kit";
import Transport from "@ledgerhq/hw-transport";
import { SwapKitError } from "@swapkit/helpers";
import { concat, from, of } from "rxjs";

import { runLedgerJsOperation } from "../src/ledger/helpers/ledgerJsDmkBridge";
import { LedgerJsDmkTransport } from "../src/ledger/helpers/ledgerJsDmkTransport";

function createInternalApi({
  responseData = new Uint8Array([0xaa]),
  statusCode = new Uint8Array([0x90, 0x00]),
}: {
  responseData?: Uint8Array;
  statusCode?: Uint8Array;
} = {}) {
  const apdus: Uint8Array[] = [];
  const abortTimeouts: Array<number | undefined> = [];
  const sendCommand = mock((command: Parameters<InternalApi["sendCommand"]>[0], abortTimeout?: number) => {
    apdus.push(command.getApdu().getRawApdu());
    abortTimeouts.push(abortTimeout);
    return Promise.resolve(command.parseResponse(new ApduResponse({ data: responseData, statusCode }), undefined));
  }) as InternalApi["sendCommand"];

  return { abortTimeouts, apdus, internalApi: { sendCommand } as unknown as InternalApi, sendCommand };
}

// An injected LedgerJS transport whose device answers every APDU with `statusWord`, so hw-transport's own `send`
// rejects with its TransportStatusError.
function createStatusWordTransport(statusWord: number) {
  const transport = new Transport();
  transport.exchange = () => Promise.resolve(Buffer.from([statusWord >> 8, statusWord & 0xff]));
  return transport;
}

function createDmkHarness(internalApi: InternalApi) {
  const actions: Array<{
    input: {
      appName: string;
      requiredUserInteraction: UserInteractionRequired;
      skipOpenApp: boolean;
      task: (api: InternalApi) => Promise<{ data?: unknown; error?: unknown; status: DmkResultStatus }>;
    };
  }> = [];
  const publicSendCommand = mock(() => Promise.reject(new Error("Public DMK sendCommand must not be called")));
  const executeDeviceAction = mock(({ deviceAction }: { deviceAction: (typeof actions)[number] }) => {
    actions.push(deviceAction);
    const completedState = async () => {
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
  });

  return {
    actions,
    dmk: { executeDeviceAction, sendCommand: publicSendCommand } as unknown as DeviceManagementKit,
    executeDeviceAction,
    publicSendCommand,
  };
}

describe("LedgerJS DMK bridge transport", () => {
  it("validates and forwards a short APDU with its abort timeout", async () => {
    const { abortTimeouts, apdus, internalApi } = createInternalApi({ responseData: new Uint8Array([0xde, 0xad]) });
    const transport = new LedgerJsDmkTransport(internalApi);

    const response = await transport.exchange(Buffer.from([0xe0, 0x02, 0x01, 0x03, 0x02, 0xbe, 0xef]), {
      abortTimeoutMs: 12_345,
    });

    expect(apdus.map((apdu) => [...apdu])).toEqual([[0xe0, 0x02, 0x01, 0x03, 0x02, 0xbe, 0xef]]);
    expect(abortTimeouts).toEqual([12_345]);
    expect([...response]).toEqual([0xde, 0xad, 0x90, 0x00]);
  });

  it("does not impose hw-transport's default exchange timeout", async () => {
    const { abortTimeouts, internalApi } = createInternalApi({ responseData: new Uint8Array() });
    const transport = new LedgerJsDmkTransport(internalApi);

    await transport.exchange(Buffer.from([0xe0, 0x02, 0x00, 0x00, 0x00]));

    expect(abortTimeouts).toEqual([undefined]);
  });

  it("rejects malformed short APDUs before touching DMK", async () => {
    const { internalApi, sendCommand } = createInternalApi();
    const transport = new LedgerJsDmkTransport(internalApi);

    await expect(transport.exchange(Buffer.from([0xe0, 0x02, 0x00, 0x00]))).rejects.toMatchObject({
      id: "InvalidAPDU",
    });
    await expect(transport.exchange(Buffer.from([0xe0, 0x02, 0x00, 0x00, 0x02, 0xaa]))).rejects.toMatchObject({
      id: "InvalidAPDU",
    });
    expect(sendCommand).toHaveBeenCalledTimes(0);
  });

  it("returns data plus status so LedgerJS applies its accepted-status list", async () => {
    const { internalApi } = createInternalApi({
      responseData: new Uint8Array([0x01]),
      statusCode: new Uint8Array([0x6a, 0x80]),
    });
    const transport = new LedgerJsDmkTransport(internalApi);

    await expect(transport.send(0xe0, 0x02, 0x00, 0x00)).rejects.toMatchObject({ statusCode: 0x6a80 });
    const accepted = await transport.send(0xe0, 0x02, 0x00, 0x00, Buffer.alloc(0), [0x6a80]);

    expect([...accepted]).toEqual([0x01, 0x6a, 0x80]);
  });

  it("has a no-op close that does not alter the DMK session", async () => {
    const { internalApi, sendCommand } = createInternalApi();
    const transport = new LedgerJsDmkTransport(internalApi);

    await transport.close();

    expect(sendCommand).toHaveBeenCalledTimes(0);
  });
});

describe("operation-scoped LedgerJS DMK bridge", () => {
  it("keeps a multi-APDU app call in one action and forwards progress", async () => {
    const { internalApi, sendCommand } = createInternalApi();
    const harness = createDmkHarness(internalApi);
    const transports: Transport[] = [];
    const states: string[] = [];

    const output = await runLedgerJsOperation({
      appName: "Litecoin",
      connection: {
        dmkSession: { dmk: harness.dmk, sessionId: "ledger-session" },
        onDeviceActionState: ({ status }) => states.push(status),
      },
      createApp: (transport) => {
        transports.push(transport);
        return {
          async sign() {
            await transport.send(0xe1, 0x01, 0x00, 0x00, Buffer.from([0x01]));
            await transport.send(0xe1, 0x02, 0x00, 0x00, Buffer.from([0x02]));
            return "signed";
          },
        };
      },
      operation: (app) => app.sign(),
      requiredUserInteraction: UserInteractionRequired.SignTransaction,
    });

    expect(output).toBe("signed");
    expect(harness.executeDeviceAction).toHaveBeenCalledTimes(1);
    expect(sendCommand).toHaveBeenCalledTimes(2);
    expect(transports).toHaveLength(1);
    expect(harness.actions[0]?.input).toMatchObject({
      appName: "Litecoin",
      requiredUserInteraction: UserInteractionRequired.SignTransaction,
      skipOpenApp: false,
    });
    expect(states).toEqual([DeviceActionStatus.Pending, DeviceActionStatus.Completed]);
    expect(harness.publicSendCommand).toHaveBeenCalledTimes(0);
  });

  it("uses a fresh bridge transport for each operation and preserves falsy output", async () => {
    const { internalApi } = createInternalApi();
    const harness = createDmkHarness(internalApi);
    const transports: Transport[] = [];
    const connection = { dmkSession: { dmk: harness.dmk, sessionId: "ledger-session" } };
    const createApp = (transport: Transport) => {
      transports.push(transport);
      return { run: async () => "" };
    };

    const first = await runLedgerJsOperation({ appName: "NEAR", connection, createApp, operation: (app) => app.run() });
    const second = await runLedgerJsOperation({
      appName: "NEAR",
      connection,
      createApp,
      operation: (app) => app.run(),
    });

    expect([first, second]).toEqual(["", ""]);
    expect(harness.executeDeviceAction).toHaveBeenCalledTimes(2);
    expect(transports).toHaveLength(2);
    expect(transports[0]).not.toBe(transports[1]);
  });

  it("keeps an explicitly injected LedgerJS transport on the direct fallback path", async () => {
    const transport = { id: "legacy-ledgerjs" } as unknown as Transport;
    const createAppTransports: Transport[] = [];

    const output = await runLedgerJsOperation({
      appName: "XRP",
      connection: { transport },
      createApp: (appTransport) => {
        createAppTransports.push(appTransport);
        return { getAddress: async () => "rLedger" };
      },
      operation: (app) => app.getAddress(),
    });

    expect(output).toBe("rLedger");
    expect(createAppTransports).toEqual([transport]);
  });

  it("maps a device error from an injected LedgerJS transport to a typed SwapKit error", async () => {
    const getAddress = (statusWord: number) =>
      runLedgerJsOperation({
        appName: "XRP",
        connection: { transport: createStatusWordTransport(statusWord) },
        createApp: (transport) => ({ getAddress: () => transport.send(0xe0, 0x02, 0x01, 0x00) }),
        operation: (app) => app.getAddress(),
      });

    await expect(getAddress(0x6985)).rejects.toMatchObject({
      errorKey: "wallet_connection_rejected_by_user",
      info: { statusWord: "6985" },
    });
    await expect(getAddress(0x5515)).rejects.toMatchObject({
      errorKey: "wallet_ledger_device_locked",
      info: { statusWord: "5515" },
    });
  });

  it("maps an unplug on an injected LedgerJS transport to a connection error", async () => {
    // hw-transport-webhid rejects an exchange cut off by an unplug with this error; the class is matched by name.
    const transport = new Transport();
    transport.exchange = () =>
      Promise.reject(
        Object.assign(new Error("Failed to write the report."), { name: "DisconnectedDeviceDuringOperation" }),
      );

    await expect(
      runLedgerJsOperation({
        appName: "XRP",
        connection: { transport },
        createApp: (ledgerTransport) => ({ getAddress: () => ledgerTransport.send(0xe0, 0x02, 0x01, 0x00) }),
        operation: (app) => app.getAddress(),
      }),
    ).rejects.toMatchObject({
      errorKey: "wallet_ledger_connection_error",
      info: { message: "Failed to write the report." },
    });
  });

  it("surfaces a SwapKitError thrown with an injected LedgerJS transport unchanged", async () => {
    const validationError = new SwapKitError("wallet_ledger_invalid_params", { reason: "Paths do not match inputs" });

    await expect(
      runLedgerJsOperation({
        appName: "Litecoin",
        connection: { transport: createStatusWordTransport(0x9000) },
        createApp: () => ({}),
        operation: () => {
          throw validationError;
        },
      }),
    ).rejects.toBe(validationError);
  });

  it("surfaces a SwapKitError thrown by the app operation unchanged", async () => {
    const { internalApi } = createInternalApi();
    const harness = createDmkHarness(internalApi);
    const validationError = new SwapKitError("wallet_ledger_invalid_params", { reason: "Paths do not match inputs" });

    await expect(
      runLedgerJsOperation({
        appName: "Litecoin",
        connection: { dmkSession: { dmk: harness.dmk, sessionId: "ledger-session" } },
        createApp: () => ({}),
        operation: () => {
          throw validationError;
        },
      }),
    ).rejects.toBe(validationError);
  });

  it("maps a dropped caller-owned DMK session to a typed SwapKit error", async () => {
    const executeDeviceAction = mock(() => {
      throw { _tag: "DeviceSessionNotFound" };
    });
    const dmk = { executeDeviceAction } as unknown as DeviceManagementKit;

    await expect(
      runLedgerJsOperation({
        appName: "Litecoin",
        connection: { dmkSession: { dmk, sessionId: "unplugged" } },
        createApp: () => ({}),
        operation: () => "unreachable",
      }),
    ).rejects.toMatchObject({
      errorKey: "wallet_ledger_connection_error",
      info: { errorTag: "DeviceSessionNotFound" },
    });
    expect(executeDeviceAction).toHaveBeenCalledTimes(1);
  });

  it("rejects ambiguous DMK plus LedgerJS transport ownership", async () => {
    const { internalApi } = createInternalApi();
    const harness = createDmkHarness(internalApi);

    await expect(
      runLedgerJsOperation({
        appName: "Sui",
        connection: {
          dmkSession: { dmk: harness.dmk, sessionId: "ledger-session" },
          transport: { id: "legacy" } as unknown as Transport,
        },
        createApp: () => ({ run: async () => true }),
        operation: (app) => app.run(),
      }),
    ).rejects.toMatchObject({ errorKey: "wallet_ledger_invalid_params" });
    expect(harness.executeDeviceAction).toHaveBeenCalledTimes(0);
  });
});
