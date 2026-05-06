import { afterEach, describe, expect, test } from "bun:test";
import { Chain } from "@swapkit/helpers";
import { ctrlWallet } from "../src/ctrl";
import { convertThorchainTransactionToCtrlParams, signCtrlThorchainTransaction } from "../src/ctrl/walletHelpers";

describe("convertThorchainTransactionToCtrlParams", () => {
  afterEach(() => {
    // @ts-expect-error test cleanup
    delete globalThis.window;
  });

  test("converts THORChain deposit transactions for CTRL", () => {
    const params = convertThorchainTransactionToCtrlParams(
      {
        fee: { gas: "500000000" },
        memo: "=:ETH.ETH:0xabc",
        msgs: [
          {
            typeUrl: "/types.MsgDeposit",
            value: {
              coins: [{ amount: "123456789", asset: { chain: "THOR", symbol: "RUNE", synth: false, ticker: "RUNE" } }],
              memo: "=:ETH.ETH:0xabc",
              signer: "thor1sender",
            },
          },
        ],
      },
      Chain.THORChain,
    );

    expect(params).toEqual({
      amount: { amount: 123456789, decimals: 8 },
      asset: { chain: "THOR", symbol: "RUNE", ticker: "RUNE" },
      from: "thor1sender",
      gasLimit: "500000000",
      memo: "=:ETH.ETH:0xabc",
      recipient: "",
    });
  });

  test("converts base64 THORChain deposit signer bytes to bech32", () => {
    const params = convertThorchainTransactionToCtrlParams(
      {
        fee: { gas: "500000000" },
        memo: "=:b:bc1qeemjtfyru0gn9gcu3zu066zjrtun7yjuy2tfe4:10359:-_/nc:15/0",
        msgs: [
          {
            typeUrl: "/types.MsgDeposit",
            value: {
              coins: [{ amount: "1800000000", asset: { chain: "THOR", symbol: "RUNE", synth: false, ticker: "RUNE" } }],
              memo: "=:b:bc1qeemjtfyru0gn9gcu3zu066zjrtun7yjuy2tfe4:10359:-_/nc:15/0",
              signer: "nlf3C5LoXHB9Z3muFI3zB1i6lq8=",
            },
          },
        ],
      },
      Chain.THORChain,
    );

    expect(params.from).toBe("thor1netlwzujapw8qlt80xhpfr0nqavt49407zwr5f");
  });

  test("converts base64 Maya deposit signer bytes to bech32", () => {
    const params = convertThorchainTransactionToCtrlParams(
      {
        fee: { gas: "500000000" },
        memo: "=:b:bc1qeemjtfyru0gn9gcu3zu066zjrtun7yjuy2tfe4:10359:-_/nc:15/0",
        msgs: [
          {
            typeUrl: "/types.MsgDeposit",
            value: {
              coins: [{ amount: "1800000000", asset: { chain: "MAYA", symbol: "CACAO", ticker: "CACAO" } }],
              memo: "=:b:bc1qeemjtfyru0gn9gcu3zu066zjrtun7yjuy2tfe4:10359:-_/nc:15/0",
              signer: "nlf3C5LoXHB9Z3muFI3zB1i6lq8=",
            },
          },
        ],
      },
      Chain.Maya,
    );

    expect(params).toEqual({
      amount: { amount: 1800000000, decimals: 8 },
      asset: { chain: "MAYA", symbol: "CACAO", ticker: "CACAO" },
      from: "maya1netlwzujapw8qlt80xhpfr0nqavt494074s0ze",
      gasLimit: "500000000",
      memo: "=:b:bc1qeemjtfyru0gn9gcu3zu066zjrtun7yjuy2tfe4:10359:-_/nc:15/0",
      recipient: "",
    });
  });

  test("converts THORChain transfer transactions for CTRL", () => {
    const params = convertThorchainTransactionToCtrlParams(
      {
        fee: { gas: "500000000" },
        memo: "memo",
        msgs: [
          {
            typeUrl: "/types.MsgSend",
            value: {
              amount: [{ amount: "200000000", denom: "rune" }],
              fromAddress: "thor1sender",
              toAddress: "thor1recipient",
            },
          },
        ],
      },
      Chain.THORChain,
    );

    expect(params).toEqual({
      amount: { amount: 200000000, decimals: 8 },
      asset: { chain: "THOR", symbol: "RUNE", ticker: "RUNE" },
      from: "thor1sender",
      gasLimit: "500000000",
      memo: "memo",
      recipient: "thor1recipient",
    });
  });

  test("submits deposit transactions through the CTRL THORChain provider", async () => {
    const requests: unknown[] = [];

    // @ts-expect-error test window shim
    globalThis.window = {
      ctrl: {
        thorchain: {
          request: (request: unknown, cb: (err: unknown, result: unknown) => void) => {
            requests.push(request);
            if ((request as { method?: string }).method === "request_accounts") {
              cb(null, ["thor1sender"]);
              return;
            }
            cb(null, "0xhash");
          },
        },
      },
    };

    await expect(
      signCtrlThorchainTransaction(
        {
          fee: { gas: "500000000" },
          memo: "=:ETH.ETH:0xabc",
          msgs: [
            {
              typeUrl: "/types.MsgDeposit",
              value: {
                coins: [
                  { amount: "123456789", asset: { chain: "THOR", symbol: "RUNE", synth: false, ticker: "RUNE" } },
                ],
                memo: "=:ETH.ETH:0xabc",
                signer: "thor1sender",
              },
            },
          ],
        },
        Chain.THORChain,
      ),
    ).resolves.toBe("0xhash");

    expect(requests).toEqual([
      { method: "request_accounts", params: [] },
      {
        method: "deposit",
        params: [
          {
            amount: { amount: 123456789, decimals: 8 },
            asset: { chain: "THOR", symbol: "RUNE", ticker: "RUNE" },
            from: "thor1sender",
            gasLimit: "500000000",
            memo: "=:ETH.ETH:0xabc",
            recipient: "",
          },
        ],
      },
    ]);
  });

  test("submits Maya deposits through the documented xfi mayachain provider", async () => {
    const requests: unknown[] = [];

    // @ts-expect-error test window shim
    globalThis.window = {
      xfi: {
        mayachain: {
          request: (request: unknown) => {
            requests.push(request);
            if ((request as { method?: string }).method === "request_accounts") {
              return Promise.resolve(["maya1sender"]);
            }
            return Promise.resolve("0xmaya");
          },
        },
      },
    };

    await expect(
      signCtrlThorchainTransaction(
        {
          fee: { gas: "500000000" },
          memo: "=:BTC.BTC:bc1qrecipient",
          msgs: [
            {
              typeUrl: "/types.MsgDeposit",
              value: {
                coins: [{ amount: "1234567890", asset: { chain: "MAYA", symbol: "CACAO", ticker: "CACAO" } }],
                memo: "=:BTC.BTC:bc1qrecipient",
                signer: "maya1sender",
              },
            },
          ],
        },
        Chain.Maya,
      ),
    ).resolves.toBe("0xmaya");

    expect(requests).toEqual([
      { method: "request_accounts", params: [] },
      {
        method: "deposit",
        params: [
          {
            amount: { amount: 1234567890, decimals: 8 },
            asset: { chain: "MAYA", symbol: "CACAO", ticker: "CACAO" },
            from: "maya1sender",
            gasLimit: "500000000",
            memo: "=:BTC.BTC:bc1qrecipient",
            recipient: "",
          },
        ],
      },
    ]);
  });

  test("marks CTRL Maya direct signing as supported", () => {
    expect(ctrlWallet.connectCtrl.directSigningSupport[Chain.Maya]).toBe(true);
  });
});
