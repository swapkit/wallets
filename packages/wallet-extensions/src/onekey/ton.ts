import { AssetValue, Chain, type GenericTransferParams, SKConfig, SwapKitError, WalletOption } from "@swapkit/helpers";
import type { TONTransactionInput } from "@swapkit/toolboxes/ton";
import type { OneKeyTonConnectBridge } from "./types";

const TON_MAINNET = "-239";
const SUPPORTED_SEND_MODE = 3;
const VALID_SECONDS = 300;

export async function getOneKeyTonWallet() {
  const bridge = getBridge();
  const rawAddress = await connect(bridge);
  const { Address, Cell } = await import("@ton/core");
  const address = Address.parse(rawAddress).toString({ bounceable: false, urlSafe: true });

  const { getTONToolbox } = await import("@swapkit/toolboxes/ton");
  const toolbox = getTONToolbox();

  async function signAndBroadcastTransaction(transaction: TONTransactionInput) {
    const messages = Array.isArray(transaction) ? transaction : transaction.messages;
    const sendMode = Array.isArray(transaction) ? transaction[0]?.sendMode : transaction.sendMode;

    if (sendMode !== undefined && sendMode !== SUPPORTED_SEND_MODE) {
      throw new SwapKitError({
        errorKey: "core_swap_invalid_params",
        info: { reason: "OneKey does not support this TON send mode", sendMode },
      });
    }

    // OneKey rejects raw `0:` addresses, so destinations are sent in user-friendly form
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

    if (!response?.result) {
      throw new SwapKitError("core_transaction_failed", { error: response?.error });
    }

    return Cell.fromBase64(response.result).hash().toString("hex");
  }

  async function transfer({ assetValue, recipient, memo, sweep }: GenericTransferParams) {
    if (sweep && assetValue.isGasAsset) {
      throw new SwapKitError({
        errorKey: "core_swap_invalid_params",
        info: { reason: "OneKey does not support sweeping the TON balance" },
      });
    }

    const transaction = await toolbox.createTransaction({ assetValue, memo, recipient, sender: address, sweep });
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

function getBridge(): OneKeyTonConnectBridge {
  const bridge = window.$onekey?.tonconnect;
  if (!bridge) {
    throw new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { chain: Chain.Ton } });
  }

  return bridge;
}

async function connect(bridge: OneKeyTonConnectBridge) {
  const restored = await bridge.restoreConnection().catch(() => undefined);
  const event = restored?.event === "connect" ? restored : await requestConnection(bridge);

  if (event.event !== "connect") {
    throw new SwapKitError("wallet_connection_rejected_by_user", {
      message: event.payload.message,
      wallet: WalletOption.ONEKEY,
    });
  }

  const account = event.payload.items.find((item) => item.name === "ton_addr");
  if (!account?.address) {
    throw new SwapKitError({ errorKey: "wallet_onekey_not_found", info: { chain: Chain.Ton } });
  }

  if (account.network !== TON_MAINNET) {
    throw new SwapKitError({
      errorKey: "wallet_chain_not_supported",
      info: { chain: Chain.Ton, message: "Mainnet only", wallet: WalletOption.ONEKEY },
    });
  }

  return account.address;
}

function requestConnection(bridge: OneKeyTonConnectBridge) {
  const manifestUrl = SKConfig.get("integrations").tonConnect?.manifestUrl;
  if (!manifestUrl) {
    throw new SwapKitError("wallet_missing_params", { param: "manifestUrl", wallet: WalletOption.ONEKEY });
  }

  return bridge.connect(2, { items: [{ name: "ton_addr" }], manifestUrl });
}
