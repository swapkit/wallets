import type { DeviceManagementKit, DeviceSessionId, DiscoveredDevice } from "@ledgerhq/device-management-kit";
import { SwapKitError } from "@swapkit/helpers";
import { filter, firstValueFrom, map, timeout } from "rxjs";

import { toLedgerDeviceError } from "./executeDeviceAction";

// Bounds the wait for a granted device that DMK never lists (an unrecognised model); the picker opens instead.
const AUTHORISED_DEVICE_TIMEOUT_MS = 1_000;

type WebHidNavigator = Navigator & { hid?: { getDevices?: () => Promise<Array<{ vendorId: number }>> } };

export interface LedgerDMKSession {
  dmk: DeviceManagementKit;
  sessionId: DeviceSessionId;
}

let defaultDMKPromise: Promise<DeviceManagementKit> | undefined;
let defaultSessionPromise: Promise<LedgerDMKSession> | undefined;

function createDefaultDMKPromise() {
  if (typeof navigator === "undefined" || !("hid" in navigator)) {
    return Promise.reject(new SwapKitError("wallet_ledger_webhid_not_supported"));
  }

  return Promise.all([import("@ledgerhq/device-management-kit"), import("@ledgerhq/device-transport-kit-web-hid")])
    .then(([{ DeviceManagementKitBuilder }, { webHidTransportFactory }]) =>
      new DeviceManagementKitBuilder().addTransport(webHidTransportFactory).build(),
    )
    .catch((error) => {
      defaultDMKPromise = undefined;
      if (error instanceof SwapKitError) throw error;
      throw new SwapKitError("wallet_ledger_connection_error", error);
    });
}

function getDefaultDMK() {
  defaultDMKPromise ??= createDefaultDMKPromise();
  return defaultDMKPromise;
}

function createDefaultSessionPromise() {
  return getDefaultDMK().then((dmk) => connectLedgerDMK({ dmk }));
}

function isSessionNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "_tag" in error && error._tag === "DeviceSessionNotFound";
}

function isSessionConnected({ dmk, sessionId }: LedgerDMKSession) {
  try {
    dmk.getConnectedDevice({ sessionId });
    return true;
  } catch (error) {
    void error;
    return false;
  }
}

async function getValidDefaultSession({ sessionPromise }: { sessionPromise: Promise<LedgerDMKSession> }) {
  let activeSessionPromise = sessionPromise;

  try {
    const session = await activeSessionPromise;
    if (isSessionConnected(session)) return session;

    if (defaultSessionPromise === activeSessionPromise) {
      defaultSessionPromise = createDefaultSessionPromise();
    }

    defaultSessionPromise ??= createDefaultSessionPromise();
    activeSessionPromise = defaultSessionPromise;

    return await activeSessionPromise;
  } catch (error) {
    if (defaultSessionPromise === activeSessionPromise) defaultSessionPromise = undefined;
    if (error instanceof SwapKitError) throw error;
    throw new SwapKitError("wallet_ledger_connection_error", error);
  }
}

async function hasAuthorisedLedger() {
  const hid = typeof navigator === "undefined" ? undefined : (navigator as WebHidNavigator).hid;
  if (typeof hid?.getDevices !== "function") return false;

  try {
    const [devices, { LEDGER_VENDOR_ID }] = await Promise.all([
      hid.getDevices(),
      import("@ledgerhq/device-management-kit"),
    ]);
    return devices.some(({ vendorId }) => vendorId === LEDGER_VENDOR_ID);
  } catch (error) {
    void error;
    return false;
  }
}

/**
 * `startDiscovering` always opens the WebHID picker, which needs a fresh user gesture. A plugged-in Ledger the user
 * already granted (page reload, replug after DMK's reconnect window) is listed without one.
 */
async function findAuthorisedDevice({ dmk }: { dmk: DeviceManagementKit }) {
  // Nothing granted: go straight to the picker while the caller's user gesture is still fresh.
  if (!(await hasAuthorisedLedger())) return undefined;

  try {
    return await firstValueFrom(
      dmk.listenToAvailableDevices({}).pipe(
        // The WebHID list replays its last value (initially empty) before it re-reads the granted devices.
        map(([device]) => device),
        filter((device): device is DiscoveredDevice => device !== undefined),
        timeout({ first: AUTHORISED_DEVICE_TIMEOUT_MS }),
      ),
    );
  } catch (error) {
    void error;
    return undefined;
  }
}

async function connectLedgerDMK({ dmk }: { dmk: DeviceManagementKit }) {
  let discoveryStarted = false;

  try {
    const authorisedDevice = await findAuthorisedDevice({ dmk });
    if (authorisedDevice) return { dmk, sessionId: await dmk.connect({ device: authorisedDevice }) };

    const discoveredDevices = dmk.startDiscovering({});
    discoveryStarted = true;
    const device = await firstValueFrom(discoveredDevices);
    const sessionId = await dmk.connect({ device });

    return { dmk, sessionId };
  } catch (error) {
    if (error instanceof SwapKitError) throw error;
    throw new SwapKitError("wallet_ledger_connection_error", error);
  } finally {
    if (discoveryStarted) {
      try {
        await dmk.stopDiscovering();
      } catch (error) {
        void error;
      }
    }
  }
}

export function getLedgerDMKSession({ dmk }: { dmk?: DeviceManagementKit } = {}) {
  if (dmk) return connectLedgerDMK({ dmk });

  defaultSessionPromise ??= createDefaultSessionPromise();
  const cachedSessionPromise = defaultSessionPromise;

  return getValidDefaultSession({ sessionPromise: cachedSessionPromise });
}

/**
 * Builds a signer kit instance for the session an operation runs on. A caller-owned session is used
 * as given; the default session is re-validated on every call and the signer is rebuilt when it was
 * replaced. DMK keeps a session through a brief unplug; once it drops one, the next operation connects
 * again, silently to a Ledger the user already granted, otherwise through the WebHID picker, which
 * needs a user gesture.
 */
export function createLedgerSessionSigner<Signer>({
  build,
  dmkSession,
}: {
  build: (session: LedgerDMKSession) => Signer | Promise<Signer>;
  dmkSession?: LedgerDMKSession;
}) {
  let cached: { session: LedgerDMKSession; signer: Promise<Signer> } | undefined;

  return async function getSessionSigner() {
    const session = dmkSession ?? (await getLedgerDMKSession());
    if (cached?.session.dmk !== session.dmk || cached.session.sessionId !== session.sessionId) {
      const signer = Promise.resolve().then(() => build(session));
      cached = { session, signer };
      const pending = cached;
      void signer.catch(() => {
        if (cached === pending) cached = undefined;
      });
    }
    return cached.signer;
  };
}

export function preloadLedgerDMK() {
  const dmkPromise = getDefaultDMK();
  // Preloading is usually fire-and-forget; the connection that follows reports the same failure.
  void dmkPromise.catch(() => undefined);
  return dmkPromise;
}

export async function disconnectLedgerDMKSession({ dmkSession }: { dmkSession?: LedgerDMKSession } = {}) {
  const cachedSessionPromise = defaultSessionPromise;
  let sessionToDisconnect = dmkSession;

  if (!sessionToDisconnect) {
    if (!cachedSessionPromise) return;
    if (defaultSessionPromise === cachedSessionPromise) defaultSessionPromise = undefined;

    try {
      sessionToDisconnect = await cachedSessionPromise;
    } catch {
      return;
    }
  }

  if (cachedSessionPromise) {
    try {
      const cachedSession = await cachedSessionPromise;
      if (
        defaultSessionPromise === cachedSessionPromise &&
        cachedSession.dmk === sessionToDisconnect.dmk &&
        cachedSession.sessionId === sessionToDisconnect.sessionId
      ) {
        defaultSessionPromise = undefined;
      }
    } catch (error) {
      void error;
      if (defaultSessionPromise === cachedSessionPromise) defaultSessionPromise = undefined;
    }
  }

  try {
    await sessionToDisconnect.dmk.disconnect({ sessionId: sessionToDisconnect.sessionId });
  } catch (error) {
    // DMK already dropped the session (device unplugged past its reconnect window): nothing left to release.
    if (isSessionNotFound(error)) return;
    throw toLedgerDeviceError(error);
  }
}
