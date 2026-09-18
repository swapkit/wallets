import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type Transport from "@ledgerhq/hw-transport";
import { Transaction } from "ethers";

type Resolution = {
  erc20Tokens: string[];
  externalPlugin: unknown[];
  plugin: unknown[];
  nfts: unknown[];
  domains: unknown[];
};

type Apdu = { cla: number; ins: number; p1: number; p2: number; data: string };

const signInvocations: Array<Resolution | null | undefined> = [];
const apdus: Apdu[] = [];
let resolutionToReturn: Resolution | null = null;
let resolveShouldThrow = false;
let rejectClearSigningWith: number | null = null;
let acceptClearSigningOnceNetworkIsKnown = false;
let networkKnownByDevice = false;
let iconIsRejected = false;

class MockTransportStatusError extends Error {
  statusCode: number;
  statusText: string;
  constructor(statusCode: number, statusText: string) {
    super(`Ledger device: ${statusText} (0x${statusCode.toString(16)})`);
    this.name = "TransportStatusError";
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
}

mock.module("@ledgerhq/hw-app-eth", () => ({
  default: class MockEthereumApp {
    getAddress = async () => ({ address: "0x0000000000000000000000000000000000000001" });
    getAppConfiguration = async () => ({ arbitraryDataEnabled: 1, version: "1.20.1" });
    signTransaction = (_path: string, _unsignedTx: string, resolution: Resolution | null | undefined) => {
      signInvocations.push(resolution);
      const networkAccepted = acceptClearSigningOnceNetworkIsKnown && networkKnownByDevice;
      if (rejectClearSigningWith !== null && resolution && !networkAccepted) {
        const code = rejectClearSigningWith;
        throw new MockTransportStatusError(
          code,
          code === 0x6a80 ? "INCORRECT_DATA" : "CONDITIONS_OF_USE_NOT_SATISFIED",
        );
      }
      return { r: "1".padStart(64, "0"), s: "2".padStart(64, "0"), v: "01" };
    };
  },
  ledgerService: {
    resolveTransaction: () =>
      resolveShouldThrow ? Promise.reject(new Error("CAL unreachable")) : Promise.resolve(resolutionToReturn),
  },
}));

import { ArcLedger } from "../src/ledger/clients/evm";
import {
  encodeNetworkInfoPayload,
  fetchLedgerNetworkDescriptor,
  provideLedgerNetworkInformation,
} from "../src/ledger/helpers/ledgerNetworkInfo";

const USDC_ARC = "0x3600000000000000000000000000000000000000";
const usdcArcDescriptor = { domains: [], erc20Tokens: ["04555344433600"], externalPlugin: [], nfts: [], plugin: [] };

const ARC_NANOX_DESCRIPTOR = {
  data: "010108020101510101230800000000000013b252034172632404555344435320f220b08815631e275dba75dd9ae6a30630980a2784a2393edd55bdc3cfdca021",
  icon: "0e000e0000190000001c0fe0ff8fcc783380ce03380ce001e003f003ff03fc0070",
  signature:
    "3044022062db1ce5c6df646e26c23725dbbe7e7e5ba1b54764dd5d9d512ebf4707bebf0e022026b79ea6799c1d676ca073f2c58be23a538532f0eea9a5d52d04f9a7789bf18b",
};

const ARC_CERTIFICATE = {
  data: "0101010201023501023601011004030100001302000214010120076e6574776f726b3002000a31010c32012134010133210272e8e8c69a8d9cec8fa22ea676a45099bcbc0301eba78ccca639e8173feafbab",
  signature:
    "30440220754341b03ab7479badfeffeb800dd66f79d8ec5d1d60d727a6336c25ed410aca02206a68e8e63de56ea5e8256d27eb574652b173ab0e6ce8942de74b38a66e799de1",
};

const calCertificatesResponse = [
  { descriptor: { data: ARC_CERTIFICATE.data, signatures: { prod: ARC_CERTIFICATE.signature, test: "00" } } },
];

const calNetworksResponse = [
  {
    chain_id: 5042,
    descriptors: {
      nanox: { data: ARC_NANOX_DESCRIPTOR.data, signatures: { prod: ARC_NANOX_DESCRIPTOR.signature, test: "00" } },
      stax: { data: "aa", signatures: { prod: "bb" } },
    },
    icons: { nanox: ARC_NANOX_DESCRIPTOR.icon, stax: "cc" },
  },
];

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
let fetchedUrls: string[] = [];
let warnings: string[] = [];
let calResponse: { ok: boolean; body: unknown } = { body: calNetworksResponse, ok: true };

function makeTransport(deviceModelId?: string) {
  return {
    deviceModel: deviceModelId ? { id: deviceModelId } : undefined,
    send: (cla: number, ins: number, p1: number, p2: number, data?: Buffer) => {
      apdus.push({ cla, data: data?.toString("hex") ?? "", ins, p1, p2 });

      if (cla === 0xb0) return Promise.resolve(Buffer.from("9000", "hex"));
      if (ins === 0x30 && p2 === 0x01 && iconIsRejected) {
        networkKnownByDevice = false;
        return Promise.reject(new MockTransportStatusError(0x6a80, "INCORRECT_DATA"));
      }
      if (ins === 0x30 && p2 === 0x00) networkKnownByDevice = true;

      return Promise.resolve(Buffer.from("9000", "hex"));
    },
  } as unknown as Transport;
}

function makeClient(deviceModelId?: string) {
  const provider = {} as Parameters<typeof ArcLedger>[0]["provider"];
  return ArcLedger({ provider, transport: makeTransport(deviceModelId) });
}

const approveTx = {
  data: "0x095ea7b3000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000f4240",
  gasLimit: 60000n,
  maxFeePerGas: 2n,
  maxPriorityFeePerGas: 1n,
  nonce: 0,
  to: USDC_ARC,
  type: 2,
  value: 0n,
};

describe("ledger EVM signer — chains the Ethereum app doesn't know", () => {
  beforeEach(() => {
    signInvocations.length = 0;
    apdus.length = 0;
    fetchedUrls = [];
    warnings = [];
    resolutionToReturn = null;
    resolveShouldThrow = false;
    rejectClearSigningWith = null;
    acceptClearSigningOnceNetworkIsKnown = false;
    networkKnownByDevice = false;
    iconIsRejected = false;
    calResponse = { body: calNetworksResponse, ok: true };
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
    globalThis.fetch = ((url: string) => {
      fetchedUrls.push(String(url));
      const body = String(url).includes("/certificates") ? calCertificatesResponse : calResponse.body;
      return Promise.resolve({ json: () => Promise.resolve(body), ok: calResponse.ok });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  });

  it("registers the chain up front so the app never rejects the metadata", async () => {
    resolutionToReturn = usdcArcDescriptor;
    rejectClearSigningWith = 0x6a80;
    acceptClearSigningOnceNetworkIsKnown = true;

    const signedTx = await makeClient("nanoX").signTransaction(approveTx);

    expect(fetchedUrls.sort()).toEqual([
      "https://crypto-assets-service.api.ledger.com/v1/certificates?output=descriptor&public_key_usage=network&target_device=nanox",
      "https://crypto-assets-service.api.ledger.com/v1/networks?chain_id=5042&output=chain_id,descriptors,icons",
    ]);
    expect(apdus.map(({ cla, ins, p1, p2 }) => ({ cla, ins, p1, p2 }))).toEqual([
      { cla: 0xb0, ins: 0x06, p1: 0x0c, p2: 0x00 },
      { cla: 0xe0, ins: 0x30, p1: 0x01, p2: 0x00 },
      { cla: 0xe0, ins: 0x30, p1: 0x01, p2: 0x01 },
    ]);
    expect(apdus[0]?.data).toBe(`${ARC_CERTIFICATE.data}1546${ARC_CERTIFICATE.signature}`);
    expect(apdus[1]?.data).toBe(encodeNetworkInfoPayload(ARC_NANOX_DESCRIPTOR).toString("hex"));
    expect(apdus[2]?.data).toBe(ARC_NANOX_DESCRIPTOR.icon);
    expect(signInvocations).toEqual([usdcArcDescriptor]);
    expect(warnings).toHaveLength(0);
    expect(Transaction.from(signedTx).chainId).toBe(5042n);
  });

  it("signs blind when Ledger publishes no descriptor for that device model", async () => {
    resolutionToReturn = usdcArcDescriptor;
    rejectClearSigningWith = 0x6a80;
    acceptClearSigningOnceNetworkIsKnown = true;

    await makeClient("nanoS").signTransaction(approveTx);

    expect(apdus).toHaveLength(0);
    expect(signInvocations).toEqual([usdcArcDescriptor, null]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("signing blind");
  });

  it("signs blind when the transport exposes no device model", async () => {
    resolutionToReturn = usdcArcDescriptor;
    rejectClearSigningWith = 0x6a80;

    await makeClient().signTransaction(approveTx);

    expect(fetchedUrls).toHaveLength(0);
    expect(signInvocations).toEqual([usdcArcDescriptor, null]);
    expect(warnings[0]).toContain("signing blind");
  });

  it("signs blind when the device refuses the network descriptor, e.g. an app older than 1.13", async () => {
    resolutionToReturn = usdcArcDescriptor;
    rejectClearSigningWith = 0x6a80;
    acceptClearSigningOnceNetworkIsKnown = true;
    const provider = {} as Parameters<typeof ArcLedger>[0]["provider"];
    const transport = {
      deviceModel: { id: "nanoX" },
      send: () => Promise.reject(new MockTransportStatusError(0x6d00, "INS_NOT_SUPPORTED")),
    } as unknown as Transport;

    await ArcLedger({ provider, transport }).signTransaction(approveTx);

    expect(signInvocations).toEqual([usdcArcDescriptor, null]);
    expect(warnings[0]).toContain("signing blind");
  });

  it("signs blind when the app still rejects metadata after the chain was registered", async () => {
    resolutionToReturn = usdcArcDescriptor;
    rejectClearSigningWith = 0x6a80;

    await makeClient("nanoX").signTransaction(approveTx);

    expect(signInvocations).toEqual([usdcArcDescriptor, null]);
    expect(warnings[0]).toContain("signing blind");
  });

  it("re-registers the chain when the device rejects the icon, which would drop the network", async () => {
    resolutionToReturn = usdcArcDescriptor;
    rejectClearSigningWith = 0x6a80;
    acceptClearSigningOnceNetworkIsKnown = true;
    iconIsRejected = true;

    await makeClient("nanoX").signTransaction(approveTx);

    expect(apdus.map(({ cla, p2 }) => (cla === 0xb0 ? "cert" : p2))).toEqual(["cert", 0x00, 0x01, 0x00]);
    expect(signInvocations).toEqual([usdcArcDescriptor]);
    expect(warnings).toHaveLength(0);
  });

  it("registers the chain once per client and reuses it on later signatures", async () => {
    resolutionToReturn = usdcArcDescriptor;

    const client = makeClient("nanoX");
    await client.signTransaction(approveTx);
    await client.signTransaction(approveTx);

    expect(fetchedUrls).toHaveLength(2);
    expect(apdus).toHaveLength(3);
    expect(signInvocations).toEqual([usdcArcDescriptor, usdcArcDescriptor]);
    expect(warnings).toHaveLength(0);
  });

  it("does not sign blind when there was no metadata to blame", async () => {
    resolutionToReturn = { domains: [], erc20Tokens: [], externalPlugin: [], nfts: [], plugin: [] };
    rejectClearSigningWith = 0x6a80;

    await expect(makeClient("nanoX").signTransaction(approveTx)).rejects.toMatchObject({ statusCode: 0x6a80 });
    expect(signInvocations).toHaveLength(1);
  });

  it("does not retry when the user rejected on device", async () => {
    resolutionToReturn = usdcArcDescriptor;
    rejectClearSigningWith = 0x6985;

    await expect(makeClient("nanoX").signTransaction(approveTx)).rejects.toMatchObject({ statusCode: 0x6985 });
    expect(signInvocations).toHaveLength(1);
  });

  it("falls back to blind signing when the Ledger asset list can't be fetched", async () => {
    resolveShouldThrow = true;

    await makeClient("nanoX").signTransaction(approveTx);

    expect(signInvocations).toEqual([null]);
  });
});

describe("ledger network descriptor helpers", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("encodes the network payload as <u16 length><tlv><0x15 len signature>", () => {
    const payload = encodeNetworkInfoPayload(ARC_NANOX_DESCRIPTOR);
    const tlv = Buffer.from(ARC_NANOX_DESCRIPTOR.data, "hex");
    const signature = Buffer.from(ARC_NANOX_DESCRIPTOR.signature, "hex");

    expect(payload.readUInt16BE(0)).toBe(tlv.length + 2 + signature.length);
    expect(payload.subarray(2, 2 + tlv.length).toString("hex")).toBe(ARC_NANOX_DESCRIPTOR.data);
    expect(payload[2 + tlv.length]).toBe(0x15);
    expect(payload[3 + tlv.length]).toBe(signature.length);
    expect(payload.subarray(4 + tlv.length).toString("hex")).toBe(ARC_NANOX_DESCRIPTOR.signature);
  });

  it("picks the descriptor and icon matching the connected device model", async () => {
    const fetchFn = (() =>
      Promise.resolve({ json: () => Promise.resolve(calNetworksResponse), ok: true })) as unknown as typeof fetch;

    expect(await fetchLedgerNetworkDescriptor(5042, "nanoX", fetchFn)).toEqual(ARC_NANOX_DESCRIPTOR);
    expect(await fetchLedgerNetworkDescriptor(5042, "stax", fetchFn)).toEqual({
      data: "aa",
      icon: "cc",
      signature: "bb",
    });
    expect(await fetchLedgerNetworkDescriptor(5042, "nanoS", fetchFn)).toBeNull();
    expect(await fetchLedgerNetworkDescriptor(5042, "blue", fetchFn)).toBeNull();
    expect(await fetchLedgerNetworkDescriptor(1, "nanoX", fetchFn)).toBeNull();
  });

  it("splits payloads larger than 255 bytes into first/following chunks", async () => {
    const sent: Array<{ p1: number; p2: number; length: number }> = [];
    const transport = {
      send: (_cla: number, _ins: number, p1: number, p2: number, data: Buffer) => {
        sent.push({ length: data.length, p1, p2 });
        return Promise.resolve(Buffer.from("9000", "hex"));
      },
    } as unknown as Transport;

    await provideLedgerNetworkInformation(transport, { ...ARC_NANOX_DESCRIPTOR, icon: "ab".repeat(300) });

    expect(sent).toEqual([
      { length: encodeNetworkInfoPayload(ARC_NANOX_DESCRIPTOR).length, p1: 0x01, p2: 0x00 },
      { length: 255, p1: 0x01, p2: 0x01 },
      { length: 45, p1: 0x00, p2: 0x01 },
    ]);
  });
});
