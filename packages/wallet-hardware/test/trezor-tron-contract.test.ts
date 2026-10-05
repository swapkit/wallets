import { describe, expect, it } from "bun:test";
import type { TronTransaction } from "@swapkit/toolboxes/tron";

import { toTrezorTronContract } from "../src/trezor/tronSigner";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";

function buildTx(contract: { type: string; value: Record<string, unknown> }): TronTransaction {
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

  it("rejects contract calls that attach TRX", () => {
    const tx = buildTx({
      type: "TriggerSmartContract",
      value: { call_value: 10, contract_address: USDT, data: "a9059cbb", owner_address: USDT },
    });

    expect(() => toTrezorTronContract(tx)).toThrow();
  });
});
