import { beforeEach, describe, expect, it, mock } from "bun:test";
import type Transport from "@ledgerhq/hw-transport";

const signTransactionInvocations: Array<{ path: string; rawTxHex: string; tokenSignatures: string[] }> = [];

mock.module("@ledgerhq/hw-app-trx", () => ({
  default: class MockTronApp {
    signTransaction = (path: string, rawTxHex: string, tokenSignatures: string[]) => {
      signTransactionInvocations.push({ path, rawTxHex, tokenSignatures });
      return Promise.resolve("ab".repeat(65));
    };
  },
}));

import { TronLedger } from "../src/ledger/clients/tron";

describe("ledger Tron signer", () => {
  beforeEach(() => {
    signTransactionInvocations.length = 0;
  });

  it("passes raw_data_hex to the Ledger TRX app", async () => {
    const transport = { id: "TRON" } as unknown as Transport;
    const client = TronLedger(undefined, transport);
    const transaction = {
      raw_data: {
        contract: [
          {
            parameter: {
              type_url: "type.googleapis.com/protocol.TransferContract",
              value: {
                amount: 15000000,
                owner_address: "TR9VSvyaqPs5whY6oeYMTVbyAH27hoNFUW",
                to_address: "TXTQaBeadMtGunQ9TcB6zDjm6XJLEwS6R5",
              },
            },
            type: "TransferContract",
          },
        ],
        expiration: 1779786660000,
        ref_block_bytes: "13e2",
        ref_block_hash: "760cc3f7cb31884e",
        timestamp: 1779786361997,
      },
      raw_data_hex:
        "0a0213e22208760cc3f7cb31884e40a0f1b49ce6335a68080112640a2d747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e5472616e73666572436f6e747261637412330a1541a67bc65dbbdedc7cb5dd65436141e886292c55ec121541ebaff28e125a3b850a86595580aa0204114c7b2018c0c39307708dd9a29ce633",
      txID: "1585a81deacfc2f2f5e7a28141df19bae665d4c62271c5078660ed8c99954e0b",
      visible: true,
    };

    const signed = await client.signTransaction(transaction);

    expect(signTransactionInvocations).toEqual([
      { path: "m/44'/195'/0'/0/0", rawTxHex: transaction.raw_data_hex, tokenSignatures: [] },
    ]);
    expect(signed).toEqual({ ...transaction, signature: ["ab".repeat(65)] });
  });
});
