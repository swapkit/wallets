import { describe, expect, mock, test } from "bun:test";
import { Chain } from "@swapkit/helpers";
import type { JsonRpcProvider } from "ethers";

import { getEVMSigner } from "../src/walletconnect/evmSigner";
import type { Walletconnect } from "../src/walletconnect/index";

const TX_HASH = "0x9fc76417374aa880d4449a1f7f31ec597f00b1f6f3dd2d66f4c9c6c445836d8b";

const makeWalletconnect = (requestMock: ReturnType<typeof mock>) =>
  ({
    accounts: ["eip155:1:0x0676d507de026d5c1d0a4fb6c0e9df5bba18b4d7"],
    client: { request: requestMock },
    session: { topic: "test-topic" },
  }) as unknown as Walletconnect;

const provider = {} as JsonRpcProvider;

describe("WalletconnectSigner.sendTransaction", () => {
  test("returns a TransactionResponse-shaped value whose hash is the WalletConnect eth_sendTransaction result", async () => {
    // WalletConnect's eth_sendTransaction resolves with the raw tx hash string,
    // not an ethers TransactionResponse — the signer must adapt it so callers
    // reading `.hash` (e.g. the EVM toolbox) get the real hash.
    const request = mock(() => Promise.resolve(TX_HASH));
    const signer = await getEVMSigner({ chain: Chain.Ethereum, provider, walletconnect: makeWalletconnect(request) });

    const response = await signer.sendTransaction({
      data: "0x",
      from: "0x0676d507de026d5c1d0a4fb6c0e9df5bba18b4d7",
      to: "0x1099c4a01a1a59c4c2bd1b31f19b74f0f5f1a5a1",
      value: 1n,
    });

    expect(response.hash).toBe(TX_HASH);
    expect(request).toHaveBeenCalledTimes(1);
    const [{ request: rpcRequest }] = request.mock.calls[0] as [{ request: { method: string; params: unknown[] } }];
    expect(rpcRequest.method).toBe("eth_sendTransaction");
  });

  test("normalizes a hash returned without a 0x prefix", async () => {
    const request = mock(() => Promise.resolve(TX_HASH.slice(2)));
    const signer = await getEVMSigner({ chain: Chain.Ethereum, provider, walletconnect: makeWalletconnect(request) });

    const response = await signer.sendTransaction({
      from: "0x0676d507de026d5c1d0a4fb6c0e9df5bba18b4d7",
      to: "0x1099c4a01a1a59c4c2bd1b31f19b74f0f5f1a5a1",
      value: 0n,
    });

    expect(response.hash).toBe(TX_HASH);
  });

  test("throws a SwapKitError when the wallet resolves without a hash", async () => {
    const request = mock(() => Promise.resolve(null));
    const signer = await getEVMSigner({ chain: Chain.Ethereum, provider, walletconnect: makeWalletconnect(request) });

    expect(
      signer.sendTransaction({
        from: "0x0676d507de026d5c1d0a4fb6c0e9df5bba18b4d7",
        to: "0x1099c4a01a1a59c4c2bd1b31f19b74f0f5f1a5a1",
        value: 0n,
      }),
    ).rejects.toThrow("wallet_walletconnect_invalid_method");
  });
});

describe("WalletconnectSigner signing", () => {
  const ADDRESS = "0x0676d507de026d5c1d0a4fb6c0e9df5bba18b4d7";
  const SIGNATURE = `0x${"ab".repeat(65)}`;
  const domain = {
    chainId: 1,
    name: "Limit Order",
    verifyingContract: "0x1099c4a01a1a59c4c2bd1b31f19b74f0f5f1a5a1",
    version: "1",
  };
  const types = {
    Order: [
      { name: "maker", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  };
  const value = { amount: 1000n, maker: ADDRESS };

  const getRequest = (request: ReturnType<typeof mock>) =>
    (request.mock.calls[0] as [{ chainId: string; request: { method: string; params: unknown[] } }])[0];

  test("signTypedData requests eth_signTypedData_v4 with the full EIP-712 payload", async () => {
    const request = mock(() => Promise.resolve(SIGNATURE));
    const signer = await getEVMSigner({ chain: Chain.Ethereum, provider, walletconnect: makeWalletconnect(request) });

    expect(await signer.signTypedData(domain, types, value)).toBe(SIGNATURE);

    const { chainId, request: rpcRequest } = getRequest(request);
    expect(chainId).toBe("eip155:1");
    expect(rpcRequest.method).toBe("eth_signTypedData_v4");
    const [address, payload] = rpcRequest.params as [string, string];
    expect(address).toBe(ADDRESS);
    expect(JSON.parse(payload)).toEqual({
      domain: { ...domain, chainId: "0x1" },
      message: { amount: "1000", maker: ADDRESS },
      primaryType: "Order",
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        ...types,
      },
    });
  });

  test("signTypedData accepts types that already include EIP712Domain", async () => {
    const request = mock(() => Promise.resolve(SIGNATURE));
    const signer = await getEVMSigner({ chain: Chain.Ethereum, provider, walletconnect: makeWalletconnect(request) });

    await signer.signTypedData(domain, { EIP712Domain: [{ name: "name", type: "string" }], ...types }, value);

    const [, payload] = getRequest(request).request.params as [string, string];
    expect(JSON.parse(payload).types.EIP712Domain).toHaveLength(4);
  });

  test("signMessage requests personal_sign with the hex-encoded message and the address", async () => {
    const request = mock(() => Promise.resolve(SIGNATURE.slice(2)));
    const signer = await getEVMSigner({ chain: Chain.Ethereum, provider, walletconnect: makeWalletconnect(request) });

    expect(await signer.signMessage("hello")).toBe(SIGNATURE);

    const { request: rpcRequest } = getRequest(request);
    expect(rpcRequest.method).toBe("personal_sign");
    expect(rpcRequest.params).toEqual(["0x68656c6c6f", ADDRESS]);
  });

  test("throws a SwapKitError when the wallet resolves without a signature", async () => {
    const request = mock(() => Promise.resolve(null));
    const signer = await getEVMSigner({ chain: Chain.Ethereum, provider, walletconnect: makeWalletconnect(request) });

    expect(signer.signTypedData(domain, types, value)).rejects.toThrow("wallet_walletconnect_invalid_method");
  });
});
