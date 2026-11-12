import { describe, expect, test } from "bun:test";

import { classifyLimitBuild } from "../build-shape";

const TYPED_DATA = {
  domain: { chainId: 1, name: "1inch Aggregation Router", verifyingContract: "0x1111", version: "6" },
  message: { maker: "0xabc" },
  primaryType: "Order",
  types: { Order: [{ name: "maker", type: "address" }] },
};

const EVM_TX = { data: "0x", from: "0xabc", to: "0xdef", value: "0x0de0b6b3a7640000" };

const APPROVAL_TX = { data: "0x095ea7b3", from: "0xabc", to: "0xa0b8", value: "0" };

const EMPTY_BUILD = { tx: null, txMeta: null, typedData: null };

describe("classifyLimitBuild", () => {
  test("typed data is a signature flow on the domain chain", () => {
    expect(classifyLimitBuild({ ...EMPTY_BUILD, typedData: TYPED_DATA })).toEqual({
      chainId: 1,
      custody: "wallet",
      flow: "signature",
      needsApproval: false,
    });
    expect(
      classifyLimitBuild({ ...EMPTY_BUILD, txMeta: { chainId: 1, txType: "evm" }, typedData: TYPED_DATA }),
    ).toMatchObject({ chainId: 1, flow: "signature" });
  });

  test("an EVM tx without a deposit address is a native sell held in the wallet's own order contract", () => {
    expect(classifyLimitBuild({ ...EMPTY_BUILD, tx: EVM_TX, txMeta: { chainId: 1, txType: "evm" } })).toEqual({
      chainId: 1,
      custody: "contract",
      flow: "deposit",
      needsApproval: false,
      txType: "evm",
    });
  });

  test("an EVM tx may carry its gas and fee fields", () => {
    const tx = { ...EVM_TX, gas: "0x5208", maxFeePerGas: "0x3b9aca00", maxPriorityFeePerGas: "0x1", type: "0x2" };
    expect(classifyLimitBuild({ ...EMPTY_BUILD, tx, txMeta: { chainId: 1, txType: "evm" } }).flow).toBe("deposit");
  });

  test("an EVM tx with a deposit address is a protocol-held deposit", () => {
    expect(
      classifyLimitBuild({
        ...EMPTY_BUILD,
        depositAddress: "0xvault",
        tx: { ...EVM_TX, value: "1000" },
        txMeta: { chainId: 8453, txType: "evm" },
      }),
    ).toEqual({ chainId: 8453, custody: "protocol", flow: "deposit", needsApproval: false, txType: "evm" });
  });

  test("a PSBT or any other non-EVM tx with a deposit address is a protocol-held deposit", () => {
    const psbt = { ...EMPTY_BUILD, tx: "cHNidP8BAH0CAAAAAQ==", txMeta: { txType: "psbt" as const } };
    expect(classifyLimitBuild({ ...psbt, depositAddress: "bc1qvault" })).toEqual({
      custody: "protocol",
      flow: "deposit",
      needsApproval: false,
      txType: "psbt",
    });
    expect(classifyLimitBuild(psbt).flow).toBe("invalid");
  });

  test("a build the wallet would not sign as received is invalid", () => {
    expect(classifyLimitBuild(EMPTY_BUILD).flow).toBe("invalid");
    expect(
      classifyLimitBuild({ ...EMPTY_BUILD, tx: EVM_TX, txMeta: { chainId: 1, txType: "evm" }, typedData: TYPED_DATA })
        .flow,
    ).toBe("invalid");
    expect(
      classifyLimitBuild({ ...EMPTY_BUILD, txMeta: { chainId: 42161, txType: "evm" }, typedData: TYPED_DATA }).flow,
    ).toBe("invalid");
    const evmBuild = { ...EMPTY_BUILD, txMeta: { chainId: 1, txType: "evm" as const } };
    expect(classifyLimitBuild({ ...evmBuild, tx: { ...EVM_TX, gasPrice: "1", maxFeePerGas: "2" } }).flow).toBe(
      "invalid",
    );
    expect(classifyLimitBuild({ ...evmBuild, tx: { ...EVM_TX, gasPrice: "1", type: "0x2" } }).flow).toBe("invalid");
    expect(classifyLimitBuild({ ...EMPTY_BUILD, tx: EVM_TX, txMeta: { txType: "evm" } }).flow).toBe("invalid");
    expect(classifyLimitBuild({ ...EMPTY_BUILD, tx: { foo: "bar" }, txMeta: { chainId: 1, txType: "evm" } }).flow).toBe(
      "invalid",
    );
  });

  test("approval is needed only when the build says it is missing and carries the approval tx", () => {
    const build = { ...EMPTY_BUILD, typedData: TYPED_DATA };
    expect(classifyLimitBuild({ ...build, approvalTx: APPROVAL_TX, isApproved: false })).toMatchObject({
      needsApproval: true,
    });
    expect(classifyLimitBuild({ ...build, approvalTx: APPROVAL_TX })).toMatchObject({ needsApproval: false });
    expect(classifyLimitBuild({ ...build, approvalTx: APPROVAL_TX, isApproved: true })).toMatchObject({
      needsApproval: false,
    });
    expect(classifyLimitBuild({ ...build, isApproved: false })).toMatchObject({ needsApproval: false });
  });
});
