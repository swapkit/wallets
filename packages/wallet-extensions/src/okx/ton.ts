import { AssetValue, Chain, type GenericTransferParams, SKConfig, SwapKitError } from "@swapkit/helpers";
import type { TONTransactionInput } from "@swapkit/toolboxes/ton";
import type { OkxTonConnectEvent } from "../types";

const TON_MAINNET = "-239";
const CARRY_ALL_REMAINING_BALANCE = 128;
const VALID_SECONDS = 300;

type OkxTonConnectBridge = NonNullable<Window["okxTonWallet"]>["tonconnect"];

export async function getOkxTonWallet() {
  const bridge = getBridge();
  const rawAddress = await connect(bridge);
  const { Address, Cell } = await import("@ton/core");
  const address = Address.parse(rawAddress).toString({ bounceable: false, urlSafe: true });

  const { getTONToolbox } = await import("@swapkit/toolboxes/ton");
  const toolbox = getTONToolbox();

  async function signAndBroadcastTransaction(transaction: TONTransactionInput) {
    const messages = Array.isArray(transaction) ? transaction : transaction.messages;
    const sendMode = Array.isArray(transaction) ? transaction[0]?.sendMode : transaction.sendMode;

    if (sendMode !== undefined && (sendMode & CARRY_ALL_REMAINING_BALANCE) !== 0) {
      throw new SwapKitError({
        errorKey: "core_swap_invalid_params",
        info: { reason: "OKX Wallet does not support TON sweep transactions", sendMode },
      });
    }

    const payload = {
      from: rawAddress,
      messages: messages.map(({ address: destination, amount, payload, stateInit }) => ({
        address: Address.isFriendly(destination)
          ? destination
          : Address.parse(destination).toString({ bounceable: true, urlSafe: true }),
        amount,
        payload,
        stateInit,
      })),
      network: TON_MAINNET,
      valid_until: Math.floor(Date.now() / 1000) + VALID_SECONDS,
    };

    const response = await bridge.send({
      id: Date.now().toString(),
      method: "sendTransaction",
      params: [JSON.stringify(payload)],
    });

    if (!response.result) {
      throw new SwapKitError("core_transaction_failed", { error: response.error });
    }

    return Cell.fromBase64(response.result).hash().toString("hex");
  }

  async function transfer({ assetValue, recipient, memo }: GenericTransferParams) {
    const transaction = await toolbox.createTransaction({ assetValue, memo, recipient, sender: address });
    return signAndBroadcastTransaction(transaction);
  }

  // Same budget as TON Connect: the signerless toolbox underestimates jetton fees
  function estimateTransactionFee({ assetValue }: GenericTransferParams) {
    return Promise.resolve(AssetValue.from({ chain: Chain.Ton, value: assetValue.isGasAsset ? "0.01" : "0.06" }));
  }

  return {
    ...toolbox,
    address,
    estimateTransactionFee,
    getAddress: () => address,
    getBalance: () => toolbox.getBalance(address),
    signAndBroadcastTransaction,
    transfer,
  };
}

function getBridge(): OkxTonConnectBridge {
  const bridge = window.okxTonWallet?.tonconnect;
  if (!bridge) {
    throw new SwapKitError("wallet_okx_not_found", { chain: Chain.Ton });
  }

  return bridge;
}

async function connect(bridge: OkxTonConnectBridge) {
  const restored = await bridge.restoreConnection().catch(() => undefined);
  const event = restored?.event === "connect" ? restored : await requestConnection(bridge);

  if (event.event !== "connect") {
    throw new SwapKitError("wallet_connection_rejected_by_user", { message: event.payload.message, wallet: "OKX" });
  }

  const account = event.payload.items.find((item) => item.name === "ton_addr");
  if (!account?.address) {
    throw new SwapKitError("wallet_okx_no_accounts", { chain: Chain.Ton });
  }

  if (account.network !== TON_MAINNET) {
    throw new SwapKitError("wallet_okx_chain_not_supported", { chain: Chain.Ton, message: "Mainnet only" });
  }

  return account.address;
}

function requestConnection(bridge: OkxTonConnectBridge): Promise<OkxTonConnectEvent> {
  const manifestUrl = SKConfig.get("integrations").tonConnect?.manifestUrl;
  if (!manifestUrl) {
    throw new SwapKitError("wallet_missing_params", { param: "manifestUrl", wallet: "OKX" });
  }

  return bridge.connect(2, { items: [{ name: "ton_addr" }], manifestUrl });
}
