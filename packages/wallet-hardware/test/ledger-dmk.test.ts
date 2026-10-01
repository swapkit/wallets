import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, mock } from "bun:test";
import * as ledgerDMKModule from "@ledgerhq/device-management-kit";
import { SwapKitError } from "@swapkit/helpers";
import { concat, Observable, of } from "rxjs";

import { createLedgerSessionSigner, disconnectLedgerDMKSession, getLedgerDMKSession } from "../src/ledger/helpers/dmk";
import { executeLedgerDeviceAction, ZONDAX_USER_REFUSED_STATUS_WORDS } from "../src/ledger/helpers/executeDeviceAction";

type DeviceManagementKit = ledgerDMKModule.DeviceManagementKit;

const {
  ApduResponse,
  DeviceActionStatus,
  DeviceDisconnectedWhileSendingError,
  GlobalCommandErrorHandler,
  LEDGER_VENDOR_ID,
  UnknownDeviceExchangeError,
} = ledgerDMKModule;
const actualLedgerDMKModule = { ...ledgerDMKModule };
const discoveredDevice = { id: "default-ledger-device" };
const lifecycleCalls: string[] = [];
const connectedSessions = new Set<string>();
let connectionAttempts = 0;
let connectionFailures = 0;
let grantedHidDevices: Array<{ vendorId: number }> = [];
let availableDevices: Observable<unknown[]> = of([]);

const defaultDMK = {
  connect: mock(({ device }: { device: unknown }) => {
    connectionAttempts += 1;
    lifecycleCalls.push(`connect:${device === discoveredDevice}:${connectionAttempts}`);

    if (connectionAttempts <= connectionFailures) {
      return Promise.reject(new Error(`Connection attempt ${connectionAttempts} failed`));
    }

    const sessionId = `default-ledger-session-${connectionAttempts}`;
    connectedSessions.add(sessionId);
    return Promise.resolve(sessionId);
  }),
  disconnect: mock(({ sessionId }: { sessionId: string }) => {
    lifecycleCalls.push(`disconnect:${sessionId}`);
    connectedSessions.delete(sessionId);
    return Promise.resolve();
  }),
  getConnectedDevice: mock(({ sessionId }: { sessionId: string }) => {
    if (!connectedSessions.has(sessionId)) throw new Error(`Session ${sessionId} is disconnected`);
    return { sessionId };
  }),
  listenToAvailableDevices: mock(() => {
    lifecycleCalls.push("listen");
    return availableDevices;
  }),
  startDiscovering: mock(() => {
    lifecycleCalls.push("discover");
    return of(discoveredDevice);
  }),
  stopDiscovering: mock(() => {
    lifecycleCalls.push("stop");
    return Promise.resolve();
  }),
};

class MockDeviceManagementKitBuilder {
  addTransport() {
    return this;
  }

  build() {
    return defaultDMK as unknown as DeviceManagementKit;
  }
}

mock.module("@ledgerhq/device-management-kit", () => ({
  ...actualLedgerDMKModule,
  DeviceManagementKitBuilder: MockDeviceManagementKitBuilder,
}));

function resetDefaultDMK({ failures = 0 }: { failures?: number } = {}) {
  connectedSessions.clear();
  connectionAttempts = 0;
  connectionFailures = failures;
  grantedHidDevices = [];
  availableDevices = of([]);
  lifecycleCalls.length = 0;
  defaultDMK.connect.mockClear();
  defaultDMK.disconnect.mockClear();
  defaultDMK.getConnectedDevice.mockClear();
  defaultDMK.listenToAvailableDevices.mockClear();
  defaultDMK.startDiscovering.mockClear();
  defaultDMK.stopDiscovering.mockClear();
}

describe("wallet-hardware/ledger DMK", () => {
  it("discovers, connects, and stops discovery for an injected DMK", async () => {
    const device = { id: "ledger-device" };
    const calls: string[] = [];
    const dmk = {
      connect: mock(({ device: selectedDevice }: { device: unknown }) => {
        calls.push(`connect:${selectedDevice === device}`);
        return Promise.resolve("ledger-session");
      }),
      startDiscovering: mock(() => {
        calls.push("discover");
        return of(device);
      }),
      stopDiscovering: mock(() => {
        calls.push("stop");
        return Promise.resolve();
      }),
    } as unknown as DeviceManagementKit;

    const session = await getLedgerDMKSession({ dmk });

    expect(session).toEqual({ dmk, sessionId: "ledger-session" });
    expect(calls).toEqual(["discover", "connect:true", "stop"]);
  });

  it("forwards intermediate states and resolves completed device actions", async () => {
    const states: string[] = [];
    const action = {
      cancel: mock(() => {}),
      observable: of(
        { intermediateValue: { requiredUserInteraction: "confirm-on-device" }, status: DeviceActionStatus.Pending },
        { output: { address: "0xledger" }, status: DeviceActionStatus.Completed },
      ),
    };

    const output = await executeLedgerDeviceAction({
      action,
      onDeviceActionState: ({ status }) => states.push(status),
    });

    expect(output).toEqual({ address: "0xledger" });
    expect(states).toEqual(["pending", "completed"]);
  });

  it("maps device action errors to typed SwapKit errors", async () => {
    const cases = [
      {
        error: { _tag: "EthAppCommandError", errorCode: "6985", message: "Denied" },
        errorKey: "wallet_connection_rejected_by_user",
      },
      { error: { _tag: "RefusedByUserDAError" }, errorKey: "wallet_connection_rejected_by_user" },
      {
        // hw-app status errors reach us nested by the LedgerJS bridge.
        error: { _tag: "UnknownDeviceExchangeError", originalError: { statusCode: 0x6985 } },
        errorKey: "wallet_connection_rejected_by_user",
      },
      { error: { _tag: "DeviceLockedError" }, errorKey: "wallet_ledger_device_locked" },
      { error: { _tag: "InvalidStatusWordError", errorCode: "6E00" }, errorKey: "wallet_ledger_app_not_open" },
      { error: { _tag: "DeviceSessionNotFound" }, errorKey: "wallet_ledger_connection_error" },
      { error: new Error("Ledger rejected the action"), errorKey: "wallet_ledger_transport_error" },
      {
        // DMK nests a status word missing from the app's error table.
        error: { _tag: "UnknownDeviceExchangeError", originalError: { errorCode: "6985", message: "UnknownError" } },
        errorKey: "wallet_connection_rejected_by_user",
      },
      {
        // The Zcash app refuses a request it will not sign with 0x6986; the user did not reject it.
        error: { _tag: "ZcashAppCommandError", errorCode: "6986" },
        errorKey: "wallet_ledger_transport_error",
      },
      {
        error: GlobalCommandErrorHandler.handle(
          new ApduResponse({ data: new Uint8Array(), statusCode: Uint8Array.of(0x69, 0x86) }),
        ),
        errorKey: "wallet_connection_rejected_by_user",
        userRefusedStatusWords: ZONDAX_USER_REFUSED_STATUS_WORDS,
      },
      {
        error: { _tag: "CosmosAppCommandError", errorCode: "0x6986" },
        errorKey: "wallet_connection_rejected_by_user",
        userRefusedStatusWords: ZONDAX_USER_REFUSED_STATUS_WORDS,
      },
      {
        // The device was unplugged during a bridged LedgerJS operation.
        error: new UnknownDeviceExchangeError(new DeviceDisconnectedWhileSendingError()),
        errorKey: "wallet_ledger_connection_error",
      },
    ];

    for (const { error, errorKey, userRefusedStatusWords } of cases) {
      const action = { cancel: mock(() => {}), observable: of({ error, status: DeviceActionStatus.Error }) };
      await expect(executeLedgerDeviceAction({ action, userRefusedStatusWords })).rejects.toMatchObject({ errorKey });
    }
  });

  it("keeps the outermost tag and the nested status word in the error info", async () => {
    const error = new UnknownDeviceExchangeError({ _tag: "InvalidStatusWordError", errorCode: "5515" });
    const action = { cancel: mock(() => {}), observable: of({ error, status: DeviceActionStatus.Error }) };

    await expect(executeLedgerDeviceAction({ action })).rejects.toMatchObject({
      errorKey: "wallet_ledger_device_locked",
      info: { errorTag: "UnknownDeviceExchangeError", statusWord: "5515" },
    });
  });

  it("reports the innermost error message rather than the generic exchange wrapper", async () => {
    const statusError = Object.assign(new Error("Ledger device: Invalid data received (0x6a80)"), {
      statusCode: 0x6a80,
    });
    const error = new UnknownDeviceExchangeError(statusError);
    const action = { cancel: mock(() => {}), observable: of({ error, status: DeviceActionStatus.Error }) };

    await expect(executeLedgerDeviceAction({ action })).rejects.toMatchObject({
      errorKey: "wallet_ledger_transport_error",
      info: {
        errorTag: "UnknownDeviceExchangeError",
        message: "Ledger device: Invalid data received (0x6a80)",
        statusWord: "6a80",
      },
    });
  });

  it("passes through a SwapKitError raised inside a bridged LedgerJS operation", async () => {
    const validationError = new SwapKitError("wallet_ledger_invalid_params", { reason: "Paths do not match inputs" });
    const error = new UnknownDeviceExchangeError(validationError);
    const action = { cancel: mock(() => {}), observable: of({ error, status: DeviceActionStatus.Error }) };

    await expect(executeLedgerDeviceAction({ action })).rejects.toBe(validationError);
  });

  it("maps stopped device actions to a SwapKit error", async () => {
    const action = { cancel: mock(() => {}), observable: of({ status: DeviceActionStatus.Stopped }) };

    await expect(executeLedgerDeviceAction({ action })).rejects.toMatchObject({
      errorKey: "wallet_ledger_connection_error",
    });
  });

  it("isolates consumer progress-handler errors", async () => {
    const action = {
      cancel: mock(() => {}),
      observable: of({ output: "signed", status: DeviceActionStatus.Completed }),
    };

    const output = await executeLedgerDeviceAction({
      action,
      onDeviceActionState: () => {
        throw new Error("UI callback failed");
      },
    });

    expect(output).toBe("signed");
  });

  it("disconnects an explicitly released DMK session", async () => {
    const disconnect = mock((_params: { sessionId: string }) => Promise.resolve());
    const dmk = { disconnect } as unknown as DeviceManagementKit;

    await disconnectLedgerDMKSession({ dmkSession: { dmk, sessionId: "ledger-session" } });

    expect(disconnect).toHaveBeenCalledWith({ sessionId: "ledger-session" });
  });

  it("treats releasing a session DMK already dropped as done", async () => {
    // DMK keeps this error class internal and rejects with the tagged instance.
    const disconnect = mock(() => Promise.reject({ _tag: "DeviceSessionNotFound", originalError: new Error() }));
    const dmk = { disconnect } as unknown as DeviceManagementKit;

    await expect(disconnectLedgerDMKSession({ dmkSession: { dmk, sessionId: "unplugged" } })).resolves.toBeUndefined();
  });

  it("maps any other failure to release a session to a typed SwapKit error", async () => {
    const disconnect = mock(() => Promise.reject(new Error("Transport closed")));
    const dmk = { disconnect } as unknown as DeviceManagementKit;

    await expect(
      disconnectLedgerDMKSession({ dmkSession: { dmk, sessionId: "ledger-session" } }),
    ).rejects.toMatchObject({ errorKey: "wallet_ledger_transport_error", info: { message: "Transport closed" } });
  });

  it("does not leak a rejection when preloading without WebHID", async () => {
    // A fresh module instance keeps its cached rejection away from the default session tests.
    const freshDmkModule = "../src/ledger/helpers/dmk?preload-without-webhid";
    const { preloadLedgerDMK }: typeof import("../src/ledger/helpers/dmk") = await import(freshDmkModule);
    const unhandled = mock((_reason: unknown) => {});
    process.on("unhandledRejection", unhandled);

    try {
      const preload = preloadLedgerDMK();
      await Bun.sleep(0);

      expect(unhandled).not.toHaveBeenCalled();
      await expect(preload).rejects.toMatchObject({ errorKey: "wallet_ledger_webhid_not_supported" });
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  describe("default session lifecycle", () => {
    const originalHidDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, "hid");

    beforeAll(() => {
      Object.defineProperty(globalThis.navigator, "hid", {
        configurable: true,
        value: { getDevices: () => Promise.resolve(grantedHidDevices) },
      });
    });

    beforeEach(() => {
      resetDefaultDMK();
    });

    afterEach(async () => {
      await disconnectLedgerDMKSession();
    });

    afterAll(() => {
      if (originalHidDescriptor) {
        Object.defineProperty(globalThis.navigator, "hid", originalHidDescriptor);
      } else {
        Reflect.deleteProperty(globalThis.navigator, "hid");
      }
    });

    it("shares one discovery and connection across concurrent callers", async () => {
      const [firstSession, secondSession] = await Promise.all([getLedgerDMKSession(), getLedgerDMKSession()]);

      expect(firstSession).toBe(secondSession);
      expect(firstSession).toMatchObject({ sessionId: "default-ledger-session-1" });
      expect(firstSession.dmk).toBe(defaultDMK);
      expect(lifecycleCalls).toEqual(["discover", "connect:true:1", "stop"]);
      expect(defaultDMK.getConnectedDevice).toHaveBeenCalledTimes(2);
    });

    it("clears a rejected connection promise so the next call retries", async () => {
      resetDefaultDMK({ failures: 1 });

      await expect(getLedgerDMKSession()).rejects.toMatchObject({ errorKey: "wallet_ledger_connection_error" });

      const retriedSession = await getLedgerDMKSession();

      expect(retriedSession).toMatchObject({ sessionId: "default-ledger-session-2" });
      expect(retriedSession.dmk).toBe(defaultDMK);
      expect(lifecycleCalls).toEqual(["discover", "connect:true:1", "stop", "discover", "connect:true:2", "stop"]);
      expect(defaultDMK.getConnectedDevice).toHaveBeenCalledTimes(1);
    });

    it("invalidates the cached session on disconnect and discovers again", async () => {
      const firstSession = await getLedgerDMKSession();

      await disconnectLedgerDMKSession();
      const secondSession = await getLedgerDMKSession();

      expect(firstSession).toMatchObject({ sessionId: "default-ledger-session-1" });
      expect(secondSession).toMatchObject({ sessionId: "default-ledger-session-2" });
      expect(secondSession).not.toBe(firstSession);
      expect(lifecycleCalls).toEqual([
        "discover",
        "connect:true:1",
        "stop",
        "disconnect:default-ledger-session-1",
        "discover",
        "connect:true:2",
        "stop",
      ]);
      expect(defaultDMK.disconnect).toHaveBeenCalledTimes(1);
      expect(defaultDMK.getConnectedDevice).toHaveBeenCalledTimes(2);
    });

    it("rebuilds a default-session signer after the device session is lost", async () => {
      const build = mock((session: { sessionId: string }) => ({ sessionId: session.sessionId }));
      const getSigner = createLedgerSessionSigner({ build });

      const first = await getSigner();
      expect(await getSigner()).toBe(first);

      // The device was unplugged: DMK no longer knows the session.
      connectedSessions.clear();
      const second = await getSigner();

      expect(first).toEqual({ sessionId: "default-ledger-session-1" });
      expect(second).toEqual({ sessionId: "default-ledger-session-2" });
      expect(build).toHaveBeenCalledTimes(2);
    });

    it("reuses an already granted Ledger without opening the WebHID picker", async () => {
      grantedHidDevices = [{ vendorId: LEDGER_VENDOR_ID }];
      // Like WebHID, replay the stale empty list before the granted devices are read.
      availableDevices = concat(of([]), of([discoveredDevice]));

      const session = await getLedgerDMKSession();

      expect(session).toMatchObject({ sessionId: "default-ledger-session-1" });
      expect(lifecycleCalls).toEqual(["listen", "connect:true:1"]);
    });

    it("opens the picker straight away when no Ledger was granted", async () => {
      grantedHidDevices = [{ vendorId: 0x1234 }];

      await getLedgerDMKSession();

      expect(lifecycleCalls).toEqual(["discover", "connect:true:1", "stop"]);
    });

    it("falls back to the picker when the granted Ledger is never listed", async () => {
      grantedHidDevices = [{ vendorId: LEDGER_VENDOR_ID }];
      const listening = Promise.withResolvers<void>();
      availableDevices = new Observable<unknown[]>((subscriber) => {
        // A WebHID list that stays empty, e.g. for a device model DMK does not recognise.
        subscriber.next([]);
        listening.resolve();
      });
      jest.useFakeTimers();

      try {
        const sessionPromise = getLedgerDMKSession();
        await listening.promise;
        jest.advanceTimersByTime(1_000);

        expect(await sessionPromise).toMatchObject({ sessionId: "default-ledger-session-1" });
        expect(lifecycleCalls).toEqual(["listen", "discover", "connect:true:1", "stop"]);
      } finally {
        jest.useRealTimers();
      }
    });

    it("keeps a caller-owned session and builds its signer once", async () => {
      const dmkSession = { dmk: defaultDMK as unknown as DeviceManagementKit, sessionId: "caller-session" };
      const build = mock(() => ({}));
      const getSigner = createLedgerSessionSigner({ build, dmkSession });

      await getSigner();
      await getSigner();

      expect(build).toHaveBeenCalledTimes(1);
      expect(lifecycleCalls).toEqual([]);
    });
  });
});
