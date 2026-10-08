import { beforeEach, describe, expect, it, mock } from "bun:test";

const ADDRESS = "0xd32aaaec45860b5330b8f7b101ed8d5d01e99f38";
const SIGNATURE = "0x".padEnd(132, "ab");

type SignedTypedData = { domain: unknown; message: unknown; primaryType: string; types: Record<string, unknown> };
const calls = { getAddress: 0, sign: [] as SignedTypedData[] };

mock.module("@trezor/connect-web", () => ({
  default: {
    ethereumGetAddress: () => {
      calls.getAddress++;
      return Promise.resolve({ payload: { address: ADDRESS }, success: true });
    },
    ethereumSignTypedData: ({ data }: { data: SignedTypedData }) => {
      calls.sign.push(data);
      return Promise.resolve({ payload: { address: ADDRESS, signature: SIGNATURE }, success: true });
    },
  },
}));

const { getHyperCoreSigner } = await import("../src/trezor/hypercoreSigner");

const domain = {
  chainId: 42161,
  name: "HyperliquidSignTransaction",
  verifyingContract: "0x0000000000000000000000000000000000000000",
  version: "1",
};
const sendAssetTypes = {
  "HyperliquidTransaction:SendAsset": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "sourceDex", type: "string" },
    { name: "destinationDex", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "fromSubAccount", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};
const sendAsset = {
  amount: "25.5",
  destination: "0x6c5a7c8b7b1c0a4e3c2d1f0e9d8c7b6a5f4e3d2c",
  destinationDex: "",
  fromSubAccount: "",
  hyperliquidChain: "Mainnet",
  nonce: 1_760_000_000_000,
  sourceDex: "spot",
  token: "USDC:0x6d1e7cde53ba9467b783cb7c530ce054",
};

function signWith(
  typedDomain: typeof domain,
  types: Record<string, { name: string; type: string }[]>,
  message: object,
) {
  const signer = getHyperCoreSigner({ address: ADDRESS, derivationPath: [44, 60, 0, 0, 0] });
  return signer.signTypedData(typedDomain, types, message as Record<string, unknown>);
}

describe("trezor hypercore typed data", () => {
  beforeEach(() => {
    calls.getAddress = 0;
    calls.sign.length = 0;
  });

  it("signs a sendAsset action with the domain, struct and message untouched", async () => {
    expect(await signWith(domain, sendAssetTypes, sendAsset)).toBe(SIGNATURE);

    expect(calls.sign).toHaveLength(1);
    expect(calls.sign[0]).toEqual({
      domain,
      message: sendAsset,
      primaryType: "HyperliquidTransaction:SendAsset",
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        ...sendAssetTypes,
      },
    });
    expect(calls.getAddress).toBe(0);
  });

  it("refuses L1 actions, unknown types and extra fields before reaching the device", async () => {
    const l1Domain = { chainId: 1337, name: "Exchange", verifyingContract: domain.verifyingContract, version: "1" };
    const agentTypes = {
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ],
    };
    const unsupported = [
      signWith(l1Domain, agentTypes, { connectionId: `0x${"11".repeat(32)}`, source: "a" }),
      signWith(domain, agentTypes, { connectionId: `0x${"11".repeat(32)}`, source: "a" }),
      signWith(
        domain,
        { "HyperliquidTransaction:Withdraw": sendAssetTypes["HyperliquidTransaction:SendAsset"] },
        sendAsset,
      ),
      signWith(domain, sendAssetTypes, { ...sendAsset, vaultAddress: ADDRESS }),
      signWith(domain, sendAssetTypes, { ...sendAsset, amount: undefined }),
      signWith({ ...domain, salt: `0x${"22".repeat(32)}` } as typeof domain, sendAssetTypes, sendAsset),
    ];

    for (const attempt of unsupported) {
      await expect(attempt).rejects.toMatchObject({ errorKey: "wallet_trezor_method_not_supported" });
    }
    expect(calls.sign).toHaveLength(0);
  });
});
