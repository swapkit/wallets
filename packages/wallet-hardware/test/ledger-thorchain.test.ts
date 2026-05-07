import { describe, expect, it } from "bun:test";
import type { StdSignDoc } from "@cosmjs/amino";

import { normalizeThorchainLedgerSignDoc } from "../src/ledger/clients/thorchain";

describe("ledger THORChain signer", () => {
  it("normalizes MsgDeposit asset objects back to Amino denoms before Ledger signing", () => {
    const signDoc: StdSignDoc = {
      account_number: "75542",
      chain_id: "thorchain-1",
      fee: { amount: [], gas: "500000000" },
      memo: "=:f:0xfb30fEbB4A9Fa5801aDA640e6b14bd56d0a5457E:150363:-_/nc:15/0",
      msgs: [
        {
          type: "thorchain/MsgDeposit",
          value: {
            coins: [{ amount: "680000000", asset: { chain: "THOR", symbol: "RUNE", synth: false, ticker: "RUNE" } }],
            memo: "=:f:0xfb30fEbB4A9Fa5801aDA640e6b14bd56d0a5457E:150363:-_/nc:15/0",
            signer: "thor1mznwgn90zfzpj9zug3xk2llyk8yxq2sg6hgsnn",
          },
        },
      ],
      sequence: "147",
    };

    expect(normalizeThorchainLedgerSignDoc(signDoc).msgs[0]?.value.coins).toEqual([
      { amount: "680000000", asset: "THOR.RUNE" },
    ]);
  });

  it("leaves MsgSend denoms untouched", () => {
    const signDoc: StdSignDoc = {
      account_number: "1",
      chain_id: "thorchain-1",
      fee: { amount: [], gas: "500000000" },
      memo: "",
      msgs: [
        {
          type: "thorchain/MsgSend",
          value: { amount: [{ amount: "1", denom: "rune" }], from_address: "thor1from", to_address: "thor1to" },
        },
      ],
      sequence: "2",
    };

    expect(normalizeThorchainLedgerSignDoc(signDoc)).toEqual(signDoc);
  });
});
