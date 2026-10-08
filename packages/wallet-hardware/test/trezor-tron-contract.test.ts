import { describe, expect, it } from "bun:test";
import type { TronTransaction } from "@swapkit/toolboxes/tron";

import { toTrezorTronContract } from "../src/trezor/tronSigner";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";

function buildTx(contract: { type: string; value: Record<string, unknown> }, visible = true): TronTransaction {
  return {
    raw_data: {
      contract: [{ parameter: { type_url: "", value: contract.value }, type: contract.type }],
      expiration: 1,
      ref_block_bytes: "00",
      ref_block_hash: "00",
      timestamp: 0,
    },
    raw_data_hex: "",
    txID: "",
    visible,
  };
}

describe("trezor tron contract", () => {
  it("maps TRC20 calls to hex addresses", () => {
    const tx = buildTx({
      type: "TriggerSmartContract",
      value: { contract_address: USDT, data: "a9059cbb", owner_address: USDT },
    });

    expect(toTrezorTronContract(tx).parameter.value).toEqual({
      contract_address: USDT_HEX,
      data: "a9059cbb",
      owner_address: USDT_HEX,
    });
  });

  it("keeps hex addresses from visible: false transactions such as PactSwap", () => {
    const owner = "4155b801b5a8b94c85376c3deb6231dd40776226b0";
    const router = "410dd36358425fd3536728c60bfcbe7d7b563c1865";
    const tx = buildTx(
      { type: "TriggerSmartContract", value: { contract_address: router, data: "08af27de", owner_address: owner } },
      false,
    );

    expect(toTrezorTronContract(tx).parameter.value).toEqual({
      contract_address: router,
      data: "08af27de",
      owner_address: owner,
    });

    const base58InHexTx = buildTx(
      { type: "TriggerSmartContract", value: { contract_address: USDT, data: "08af27de", owner_address: owner } },
      false,
    );
    expect(() => toTrezorTronContract(base58InHexTx)).toThrow();
  });

  it("rejects contract calls that attach TRX", () => {
    const tx = buildTx({
      type: "TriggerSmartContract",
      value: { call_value: 10, contract_address: USDT, data: "a9059cbb", owner_address: USDT },
    });

    expect(() => toTrezorTronContract(tx)).toThrow();
  });
});
