import { describe, expect, it, mock } from "bun:test";
import {
  ApduResponse,
  DeviceActionStatus,
  type DeviceManagementKit,
  DmkResultStatus,
  type InternalApi,
  UserInteractionRequired,
} from "@ledgerhq/device-management-kit";
import type { Transaction as NearTransaction } from "@near-js/transactions";
import { decode } from "ripple-binary-codec";
import { from } from "rxjs";
import type { Payment } from "xrpl";

import { getNearLedgerClient } from "../src/ledger/clients/near";
import { SuiLedger } from "../src/ledger/clients/sui";
import { TronLedger } from "../src/ledger/clients/tron";
import { BitcoinCashLedger, DashLedger, DogecoinLedger, LitecoinLedger } from "../src/ledger/clients/utxo";
import { XRPLedger } from "../src/ledger/clients/xrp";

interface ExchangeRecord {
  actionIndex: number;
  appName: string;
  cla: number;
  ins: number;
  p1: number;
  p2: number;
  data: Uint8Array;
}

function ledgerAddressResponse({ address, publicKey }: { address: string; publicKey: Uint8Array }) {
  return new Uint8Array([
    publicKey.length,
    ...publicKey,
    address.length,
    ...Buffer.from(address),
    ...new Uint8Array(32),
  ]);
}

function getResponseData({ appName, ins, p1 }: Pick<ExchangeRecord, "appName" | "ins" | "p1">) {
  if (appName === "NEAR") {
    if (ins === 0x04) return new Uint8Array(32);
    if (ins === 0x02 && p1 === 0x80) return new Uint8Array(64).fill(0x71);
    return new Uint8Array();
  }

  if (appName === "XRP") {
    if (ins === 0x02) {
      return ledgerAddressResponse({
        address: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
        publicKey: new Uint8Array([0x02, ...new Uint8Array(32).fill(0x11)]),
      });
    }
    if (ins === 0x04) return new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]);
  }

  if (appName === "Tron") {
    if (ins === 0x02) {
      return ledgerAddressResponse({
        address: "TR9VSvyaqPs5whY6oeYMTVbyAH27hoNFUW",
        publicKey: new Uint8Array([0x04, ...new Uint8Array(64).fill(0x22)]),
      });
    }
    if (ins === 0x04) return new Uint8Array(65).fill(0xab);
  }

  if (appName === "Sui") {
    if (ins === 0x00) return new Uint8Array([0x01, 0x01, 0x00, 0x00]);
    if (ins === 0x02) {
      return new Uint8Array([0x01, 32, ...new Uint8Array(32).fill(0x33), 32, ...new Uint8Array(32).fill(0x44)]);
    }
    if (ins === 0x03) return new Uint8Array([0x01, ...new Uint8Array(64).fill(0x55)]);
  }

  if (["Bitcoin Cash", "Dash", "Dogecoin", "Litecoin"].includes(appName) && ins === 0x40) {
    return ledgerAddressResponse({
      address: `${appName.toLowerCase().replace(" ", "-")}-ledger-address`,
      publicKey: new Uint8Array([0x02, ...new Uint8Array(32).fill(0x66)]),
    });
  }

  throw new Error(`Unexpected ${appName} APDU instruction 0x${ins.toString(16)}`);
}

function createDmkHarness() {
  const actions: Array<{ appName: string; requiredUserInteraction: UserInteractionRequired }> = [];
  const exchanges: ExchangeRecord[] = [];
  const executeDeviceAction = mock(
    ({
      deviceAction,
    }: {
      deviceAction: {
        input: {
          appName: string;
          requiredUserInteraction: UserInteractionRequired;
          task: (internalApi: InternalApi) => Promise<{ data?: unknown; error?: unknown; status: DmkResultStatus }>;
        };
      };
    }) => {
      const actionIndex = actions.length;
      actions.push({
        appName: deviceAction.input.appName,
        requiredUserInteraction: deviceAction.input.requiredUserInteraction,
      });

      const completedState = async () => {
        const sendCommand = (command: Parameters<InternalApi["sendCommand"]>[0]) => {
          const apdu = command.getApdu();
          const exchange = {
            actionIndex,
            appName: deviceAction.input.appName,
            cla: apdu.cla,
            data: apdu.data,
            ins: apdu.ins,
            p1: apdu.p1,
            p2: apdu.p2,
          };
          exchanges.push(exchange);
          return Promise.resolve(
            command.parseResponse(
              new ApduResponse({ data: getResponseData(exchange), statusCode: new Uint8Array([0x90, 0x00]) }),
              undefined,
            ),
          );
        };
        const result = await deviceAction.input.task({ sendCommand } as unknown as InternalApi);
        return result.status === DmkResultStatus.Success
          ? { output: result.data, status: DeviceActionStatus.Completed }
          : { error: result.error, status: DeviceActionStatus.Error };
      };

      return { cancel: mock(() => {}), observable: from(completedState()) };
    },
  );
  const dmk = { executeDeviceAction } as unknown as DeviceManagementKit;

  return { actions, dmkSession: { dmk, sessionId: "ledger-session" }, exchanges, executeDeviceAction };
}

describe("LedgerJS clients over the operation-scoped DMK bridge", () => {
  it("keeps the NEAR address and multi-chunk signature formats without duplicating the key prefix", async () => {
    const harness = createDmkHarness();
    const client = await getNearLedgerClient({ derivationPath: [44, 397, 0, 0, 0], dmkSession: harness.dmkSession });

    const publicKey = await client.getPublicKey();
    const transaction = { encode: () => new Uint8Array(600).fill(0x42) } as unknown as NearTransaction;
    const [signature] = await client.signTransaction(transaction);

    expect(publicKey.toString()).toBe(`ed25519:${"1".repeat(32)}`);
    expect([...signature]).toEqual(new Array(64).fill(0x71));
    expect(harness.actions).toEqual([
      { appName: "NEAR", requiredUserInteraction: UserInteractionRequired.None },
      { appName: "NEAR", requiredUserInteraction: UserInteractionRequired.SignTransaction },
    ]);
    expect(harness.exchanges.map(({ actionIndex, ins, p1 }) => ({ actionIndex, ins, p1 }))).toEqual([
      { actionIndex: 0, ins: 0x04, p1: 0x01 },
      { actionIndex: 1, ins: 0x02, p1: 0x00 },
      { actionIndex: 1, ins: 0x02, p1: 0x00 },
      { actionIndex: 1, ins: 0x02, p1: 0x80 },
    ]);
  });

  it("preserves the XRP public key, DER signature, canonical flag, and signed blob", async () => {
    const harness = createDmkHarness();
    const client = await XRPLedger({ dmkSession: harness.dmkSession });
    const transaction: Payment = {
      Account: client.getAddress(),
      Amount: "1000",
      Destination: "rTooLkitCksh5mQa67eaa2JaWHDBnHkpy",
      Fee: "12",
      Sequence: 1,
      TransactionType: "Payment",
    };

    const signed = await client.signTransaction(transaction);
    const decoded = decode(signed.tx_blob);

    expect(signed.hash).toMatch(/^[A-F0-9]{64}$/);
    expect(decoded).toMatchObject({
      Flags: 2147483648,
      SigningPubKey: `02${"11".repeat(32)}`,
      TxnSignature: "3006020101020101",
    });
    expect(harness.actions).toEqual([
      { appName: "XRP", requiredUserInteraction: UserInteractionRequired.None },
      { appName: "XRP", requiredUserInteraction: UserInteractionRequired.SignTransaction },
    ]);
    expect(harness.exchanges.filter(({ actionIndex }) => actionIndex === 1).every(({ ins }) => ins === 0x04)).toBe(
      true,
    );
  });

  it("preserves Tron's raw transaction and 65-byte signature array", async () => {
    const harness = createDmkHarness();
    const client = TronLedger({ dmkSession: harness.dmkSession });
    const transaction = { raw_data_hex: "0a00", txID: "ledger-tron-tx" } as Parameters<
      typeof client.signTransaction
    >[0];

    const signed = await client.signTransaction(transaction);

    expect(signed).toMatchObject({ raw_data_hex: "0a00", signature: ["ab".repeat(65)], txID: "ledger-tron-tx" });
    expect(harness.actions).toEqual([
      { appName: "Tron", requiredUserInteraction: UserInteractionRequired.SignTransaction },
    ]);
  });

  it("preserves Sui's intent bytes and serialized signature layout", async () => {
    const harness = createDmkHarness();
    const client = SuiLedger({ dmkSession: harness.dmkSession });

    const address = await client.connect();
    const signed = await client.signTransaction(new Uint8Array([0xaa, 0xbb]));
    const serializedSignature = Buffer.from(signed.signature, "base64");

    expect(address).toBe(`0x${"44".repeat(32)}`);
    expect(signed.bytes).toBe("qrs=");
    expect([...serializedSignature]).toEqual([0, ...new Array(64).fill(0x55), ...new Array(32).fill(0x33)]);
    expect(harness.actions).toEqual([
      { appName: "Sui", requiredUserInteraction: UserInteractionRequired.None },
      { appName: "Sui", requiredUserInteraction: UserInteractionRequired.SignTransaction },
    ]);
    expect(harness.exchanges.filter(({ actionIndex }) => actionIndex === 1).map(({ ins }) => ins)).toEqual([
      0x00, 0x03,
    ]);
  });

  it("opens each alt-UTXO app through its own operation and keeps address output intact", async () => {
    const harness = createDmkHarness();
    const clients = [
      BitcoinCashLedger({ derivationPath: "84'/145'/0'/0/0", dmkSession: harness.dmkSession }),
      LitecoinLedger({ derivationPath: "84'/2'/0'/0/0", dmkSession: harness.dmkSession }),
      DogecoinLedger({ derivationPath: "84'/3'/0'/0/0", dmkSession: harness.dmkSession }),
      DashLedger({ derivationPath: "84'/5'/0'/0/0", dmkSession: harness.dmkSession }),
    ];

    const addresses: string[] = [];
    for (const client of clients) addresses.push(await client.getAddress());

    expect(addresses).toEqual([
      "bitcoin-cash-ledger-address",
      "litecoin-ledger-address",
      "dogecoin-ledger-address",
      "dash-ledger-address",
    ]);
    expect(harness.actions.map(({ appName }) => appName)).toEqual(["Bitcoin Cash", "Litecoin", "Dogecoin", "Dash"]);
    expect(harness.exchanges.map(({ actionIndex, ins }) => ({ actionIndex, ins }))).toEqual([
      { actionIndex: 0, ins: 0x40 },
      { actionIndex: 1, ins: 0x40 },
      { actionIndex: 2, ins: 0x40 },
      { actionIndex: 3, ins: 0x40 },
    ]);
  });
});
