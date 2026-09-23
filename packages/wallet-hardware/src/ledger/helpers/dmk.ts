import type { DeviceManagementKit, DeviceSessionId } from "@ledgerhq/device-management-kit";
import { SwapKitError } from "@swapkit/helpers";
import { firstValueFrom } from "rxjs";

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

async function connectLedgerDMK({ dmk }: { dmk: DeviceManagementKit }) {
  let discoveryStarted = false;

  try {
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
 * replaced, so a device that was unplugged and reconnected keeps working without a new connect.
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
  return getDefaultDMK();
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

  await sessionToDisconnect.dmk.disconnect({ sessionId: sessionToDisconnect.sessionId });
}
