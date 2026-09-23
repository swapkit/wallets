import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as ledgerDMKModule from "@ledgerhq/device-management-kit";
import { of } from "rxjs";

import { createLedgerSessionSigner, disconnectLedgerDMKSession, getLedgerDMKSession } from "../src/ledger/helpers/dmk";
import { executeLedgerDeviceAction } from "../src/ledger/helpers/executeDeviceAction";

type DeviceManagementKit = ledgerDMKModule.DeviceManagementKit;

const { DeviceActionStatus } = ledgerDMKModule;
const actualLedgerDMKModule = { ...ledgerDMKModule };
const discoveredDevice = { id: "default-ledger-device" };
const lifecycleCalls: string[] = [];
const connectedSessions = new Set<string>();
let connectionAttempts = 0;
let connectionFailures = 0;

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
  lifecycleCalls.length = 0;
  defaultDMK.connect.mockClear();
  defaultDMK.disconnect.mockClear();
  defaultDMK.getConnectedDevice.mockClear();
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
    ];

    for (const { error, errorKey } of cases) {
      const action = { cancel: mock(() => {}), observable: of({ error, status: DeviceActionStatus.Error }) };
      await expect(executeLedgerDeviceAction({ action })).rejects.toMatchObject({ errorKey });
    }
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

  describe("default session lifecycle", () => {
    const originalHidDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, "hid");

    beforeAll(() => {
      Object.defineProperty(globalThis.navigator, "hid", { configurable: true, value: {} });
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
