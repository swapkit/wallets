import { describe, expect, it } from "bun:test";
import type { TronTransaction } from "@swapkit/toolboxes/tron";

import { toTrezorTronContract } from "../src/trezor/tronSigner";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const RECIPIENT = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const RECIPIENT_HEX = "4174472e7d35395a6b5add427eecb7f4b62ad2b071";

function buildTx(
  contract: { type: string; value: Record<string, unknown>; extra?: Record<string, unknown> },
  visible = true,
): TronTransaction {
  return {
    raw_data: {
      contract: [{ parameter: { type_url: "", value: contract.value }, type: contract.type, ...contract.extra }],
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

  it("keeps TRX transfer amounts and addresses in both address formats", () => {
    const base58Tx = buildTx({
      type: "TransferContract",
      value: { amount: 15_000_000, owner_address: USDT, to_address: RECIPIENT },
    });
    const hexTx = buildTx(
      { type: "TransferContract", value: { amount: "15000000", owner_address: USDT_HEX, to_address: RECIPIENT_HEX } },
      false,
    );
    const expected = { amount: "15000000", owner_address: USDT_HEX, to_address: RECIPIENT_HEX };

    expect(toTrezorTronContract(base58Tx).parameter.value).toEqual(expected);
    expect(toTrezorTronContract(hexTx).parameter.value).toEqual(expected);
  });

  it("rejects fields Trezor would drop instead of signing without them", () => {
    const trigger = { contract_address: USDT, data: "a9059cbb", owner_address: USDT };
    const transfer = { amount: 1, owner_address: USDT, to_address: RECIPIENT };

    const unsupported = [
      buildTx({ extra: { Permission_id: 2 }, type: "TransferContract", value: transfer }),
      buildTx({ extra: { Permission_id: 2 }, type: "TriggerSmartContract", value: trigger }),
      buildTx({ type: "TriggerSmartContract", value: { ...trigger, call_token_value: 0, token_id: 1000001 } }),
      buildTx({ type: "TriggerSmartContract", value: { ...trigger, call_value: 10 } }),
      buildTx({ type: "TransferContract", value: { owner_address: USDT, to_address: RECIPIENT } }),
    ];

    for (const tx of unsupported) {
      expect(() => toTrezorTronContract(tx)).toThrow();
    }
    expect(() =>
      toTrezorTronContract(buildTx({ extra: { Permission_id: 0 }, type: "TransferContract", value: transfer })),
    ).not.toThrow();
  });
});
