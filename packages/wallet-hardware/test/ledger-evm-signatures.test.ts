import { afterAll, describe, expect, it, mock, spyOn } from "bun:test";
import {
  type ContextModule,
  ContextModuleBuilder,
  ContextModuleChainID,
  DefaultContextModule,
} from "@ledgerhq/context-module";
import { DeviceActionStatus, type DeviceManagementKit, noopLoggerFactory } from "@ledgerhq/device-management-kit";
import * as realSignerKitEthereum from "@ledgerhq/device-signer-kit-ethereum";
import {
  hashMessage,
  hexlify,
  keccak256,
  type Provider,
  Transaction,
  type TransactionRequest,
  TypedDataEncoder,
  type TypedDataField,
  verifyMessage,
  verifyTypedData,
  Wallet,
} from "ethers";
import { of } from "rxjs";

// Synthetic key standing in for the device, so every signature must recover to the account it reports.
const device = new Wallet(`0x${"42".repeat(32)}`);
const contextModules: ContextModule[] = [];
const deviceCalls: string[] = [];
const signedTransactions: Uint8Array[] = [];

function deviceAction<Output>(method: string, output: Output) {
  deviceCalls.push(method);
  return { cancel: mock(() => {}), observable: of({ output, status: DeviceActionStatus.Completed }) };
}

function signDigest(digest: string) {
  const { r, s, v } = device.signingKey.sign(digest);
  return { r, s, v };
}

// Mirrors what the signer kit returns: the y-parity for typed transactions, and for legacy ones the
// EIP-155 v that SendSignTransactionTask rebuilds from the device's truncated byte.
function signLikeSignerKit(unsigned: Uint8Array) {
  const { chainId, type } = Transaction.from(hexlify(unsigned));
  const { r, s, yParity } = device.signingKey.sign(keccak256(unsigned));
  return { r, s, v: type === 0 ? Number(chainId) * 2 + 35 + yParity : yParity };
}

// mock.module replaces the whole export namespace process-wide; snapshot the real module so
// afterAll can restore it for test files that run later.
const realSignerKitEthereumSnapshot = { ...realSignerKitEthereum };

mock.module("@ledgerhq/device-signer-kit-ethereum", () => ({
  ...realSignerKitEthereumSnapshot,
  SignerEthBuilder: class MockSignerEthBuilder {
    withContextModule(contextModule: ContextModule) {
      contextModules.push(contextModule);
      return this;
    }
    build = () => ({
      getAddress: () => deviceAction("getAddress", { address: device.address, publicKey: device.signingKey.publicKey }),
      signMessage: (_path: string, message: Uint8Array) =>
        deviceAction("signMessage", signDigest(hashMessage(message))),
      signTransaction: (_path: string, transaction: Uint8Array) => {
        signedTransactions.push(transaction);
        return deviceAction("signTransaction", signLikeSignerKit(transaction));
      },
      signTypedData: (
        _path: string,
        {
          domain,
          message,
          types: { EIP712Domain: _, ...types },
        }: {
          domain: Record<string, unknown>;
          message: Record<string, unknown>;
          types: Record<string, TypedDataField[]>;
        },
      ) => deviceAction("signTypedData", signDigest(TypedDataEncoder.hash(domain, types, message))),
    });
  },
}));

import { ArbitrumLedger, AvalancheLedger, BinanceSmartChainLedger, EthereumLedger } from "../src/ledger/clients/evm";

const dmkSession = {
  dmk: { getLoggerFactory: () => noopLoggerFactory } as unknown as DeviceManagementKit,
  sessionId: "evm-signatures",
};
const provider = {} as Provider;
const recipient = "0x0000000000000000000000000000000000000002";
const accessList = [{ address: recipient, storageKeys: [`0x${"4".repeat(64)}`] }];

describe("ledger EVM signatures recover to the Ledger account", () => {
  const requests: Array<[string, typeof EthereumLedger, TransactionRequest, number]> = [
    [
      "legacy",
      BinanceSmartChainLedger,
      { gasLimit: 21000n, gasPrice: 1n, nonce: 0, to: recipient, type: 0, value: 1n },
      0,
    ],
    // chainId * 2 + 35 does not fit the single v byte the device returns.
    [
      "legacy on a high chain id",
      AvalancheLedger,
      { gasLimit: 21000n, gasPrice: 1n, nonce: 1, to: recipient, type: 0, value: 1n },
      0,
    ],
    // ethers alone would infer EIP-2930; the LedgerJS client signed these as legacy.
    [
      "untyped gasPrice-only",
      BinanceSmartChainLedger,
      { gasLimit: 21000n, gasPrice: 1n, nonce: 2, to: recipient, value: 1n },
      0,
    ],
    ["EIP-2930", ArbitrumLedger, { accessList, gasLimit: 25000n, gasPrice: 1n, nonce: 3, to: recipient, type: 1 }, 1],
    ["untyped access-list", ArbitrumLedger, { accessList, gasLimit: 25000n, gasPrice: 1n, nonce: 4, to: recipient }, 1],
    [
      "EIP-1559",
      EthereumLedger,
      { gasLimit: 21000n, maxFeePerGas: 3n, maxPriorityFeePerGas: 1n, nonce: 5, to: recipient, type: 2, value: 1n },
      2,
    ],
    [
      "untyped fee-market",
      EthereumLedger,
      { gasLimit: 21000n, gasPrice: 1n, maxFeePerGas: 3n, maxPriorityFeePerGas: 1n, nonce: 6, to: recipient },
      2,
    ],
    [
      "EIP-1559 contract creation",
      EthereumLedger,
      { data: "0x6000", gasLimit: 60000n, maxFeePerGas: 3n, maxPriorityFeePerGas: 1n, nonce: 7, type: 2 },
      2,
    ],
  ];

  for (const [name, createClient, request, expectedType] of requests) {
    it(`signs ${name} transactions as type ${expectedType}`, async () => {
      const signed = Transaction.from(await createClient({ dmkSession, provider }).signTransaction(request));

      expect(signed.from).toBe(device.address);
      expect(signed.type).toBe(expectedType);
      expect(signed.to).toBe(request.to ? recipient : null);
      expect(hexlify(signedTransactions.at(-1) ?? new Uint8Array())).toBe(signed.unsignedSerialized);
    });
  }

  it("rejects a transaction for another chain before reaching the device", async () => {
    deviceCalls.length = 0;
    const client = ArbitrumLedger({ dmkSession, provider });

    // Without a nonce and with a from address, any later check would first ask the device for its address.
    await expect(
      client.signTransaction({
        chainId: 1n,
        from: device.address,
        gasLimit: 21000n,
        maxFeePerGas: 3n,
        maxPriorityFeePerGas: 1n,
        to: recipient,
        type: 2,
        value: 1n,
      }),
    ).rejects.toMatchObject({
      cause: { chainId: 1n, expectedChainId: 42161n },
      errorKey: "wallet_ledger_invalid_params",
    });
    expect(deviceCalls).toEqual([]);
  });

  it("signs through sendTransaction after ethers populates the request", async () => {
    let broadcast = "";
    const networkProvider = {
      broadcastTransaction: (signedTx: string) => {
        broadcast = signedTx;
        return Promise.resolve({ hash: Transaction.from(signedTx).hash });
      },
      estimateGas: () => Promise.resolve(21000n),
      getFeeData: () => Promise.resolve({ gasPrice: 5n, maxFeePerGas: 7n, maxPriorityFeePerGas: 2n }),
      getNetwork: () => Promise.resolve({ chainId: 1n }),
      getTransactionCount: () => Promise.resolve(9),
    } as unknown as Provider;

    await EthereumLedger({ dmkSession, provider: networkProvider }).sendTransaction({ to: recipient, value: 1n });

    expect(Transaction.from(broadcast)).toMatchObject({
      chainId: 1n,
      from: device.address,
      maxFeePerGas: 7n,
      nonce: 9,
      type: 2,
    });
  });

  it("signs personal messages and EIP-712 data with the Ledger account", async () => {
    const client = ArbitrumLedger({ dmkSession, provider });
    const domain = { chainId: 42161n, name: "SwapKit", verifyingContract: recipient, version: "1" };
    const types = { Message: [{ name: "contents", type: "string" }] };
    const value = { contents: "typed" };

    expect(verifyMessage("Zażółć 💩", await client.signMessage("Zażółć 💩"))).toBe(device.address);
    expect(verifyTypedData(domain, types, value, await client.signTypedData(domain, types, value))).toBe(
      device.address,
    );
  });

  it("builds the real context module with both signing reporters kept off the network", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    // The reporters forward the event as-is, so its contents do not matter here.
    const reportParams = {} as Parameters<ContextModule["report"]>[0];
    const signReportParams = {} as Parameters<NonNullable<ContextModule["signReport"]>>[0];

    try {
      await EthereumLedger({ dmkSession, provider }).getAddress();
      const contextModule = contextModules.at(-1);

      expect(contextModule).toBeInstanceOf(DefaultContextModule);
      expect(contextModule?.signReport).not.toBe(DefaultContextModule.prototype.signReport);
      await contextModule?.report(reportParams);
      await contextModule?.signReport?.(signReportParams);
      expect(fetchSpy).not.toHaveBeenCalled();

      // Control: the reporter the signer kit would otherwise build posts the event to Ledger.
      await new ContextModuleBuilder({}).setChain(ContextModuleChainID.Ethereum).build().report(reportParams);
      expect(fetchSpy.mock.calls.map(([input]) => String(input))).toEqual([
        expect.stringContaining("/v1/blind-signing-events"),
      ]);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

afterAll(() => {
  mock.module("@ledgerhq/device-signer-kit-ethereum", () => realSignerKitEthereumSnapshot);
});
