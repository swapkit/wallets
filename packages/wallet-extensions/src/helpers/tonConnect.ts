import { AssetValue, Chain, type GenericTransferParams, SKConfig, SwapKitError } from "@swapkit/helpers";
import type { TONTransactionInput } from "@swapkit/toolboxes/ton";
import type { TonConnectBridge } from "../types";

const TON_MAINNET = "-239";
const SUPPORTED_SEND_MODE = 3;
const VALID_SECONDS = 300;

type TonConnectWalletParams = {
  bridge: TonConnectBridge;
  wallet: string;
  noAccountError: () => SwapKitError;
  mainnetOnlyError: () => SwapKitError;
};

export async function getTonConnectWallet({
  bridge,
  wallet,
  noAccountError,
  mainnetOnlyError,
}: TonConnectWalletParams) {
  const rawAddress = await connect({ bridge, mainnetOnlyError, noAccountError, wallet });
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
        info: { reason: `${wallet} does not support this TON send mode`, sendMode },
      });
    }

    // TON Connect wallets reject raw `0:` addresses, so destinations are sent in user-friendly form
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

  async function transfer({ assetValue, recipient, memo, sweep }: GenericTransferParams) {
    if (sweep && assetValue.isGasAsset) {
      throw new SwapKitError({
        errorKey: "core_swap_invalid_params",
        info: { reason: `${wallet} does not support sweeping the TON balance` },
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

async function connect({ bridge, wallet, noAccountError, mainnetOnlyError }: TonConnectWalletParams) {
  const restored = await bridge.restoreConnection().catch(() => undefined);
  const event = restored?.event === "connect" ? restored : await requestConnection(bridge, wallet);

  if (event.event !== "connect") {
    throw new SwapKitError("wallet_connection_rejected_by_user", { message: event.payload.message, wallet });
  }

  const account = event.payload.items.find((item) => item.name === "ton_addr");
  if (!account?.address) throw noAccountError();
  if (account.network !== TON_MAINNET) throw mainnetOnlyError();

  return account.address;
}

function requestConnection(bridge: TonConnectBridge, wallet: string) {
  const manifestUrl = SKConfig.get("integrations").tonConnect?.manifestUrl;
  if (!manifestUrl) {
    throw new SwapKitError("wallet_missing_params", { param: "manifestUrl", wallet });
  }

  return bridge.connect(2, { items: [{ name: "ton_addr" }], manifestUrl });
}
