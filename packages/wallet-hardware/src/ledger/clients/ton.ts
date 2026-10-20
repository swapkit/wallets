import type { UserInteractionRequired } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import {
  Chain,
  type DerivationPathArray,
  getRPCUrl,
  NetworkDerivationPath,
  SwapKitError,
  WalletOption,
} from "@swapkit/helpers";
import type { TONTransactionInput, TONTransactionMessage } from "@swapkit/toolboxes/ton";
import type { Address, Cell, StateInit } from "@ton/core";
import type { TonClient } from "@ton/ton";
import type { TonPayloadFormat, TonTransport } from "@ton-community/ton-ledger";

import {
  LEDGER_USER_INTERACTION_REQUIRED,
  type LedgerJsClientParams,
  normalizeLedgerJsClientParams,
  runLedgerJsOperation,
} from "../helpers/ledgerJsDmkBridge";

// SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS, the TON toolbox default.
const DEFAULT_SEND_MODE = 3;
const TRANSACTION_VALID_SECONDS = 300;
const TON_WORKCHAIN = 0;

type TONLedgerParams = LedgerJsClientParams<DerivationPathArray>;

interface TONLedgerOrder {
  amount: bigint;
  bounce: boolean;
  payload?: Cell;
  payloadFormat?: TonPayloadFormat;
  stateInit?: StateInit;
  to: Address;
}

interface SignedTransferExpectation extends TONLedgerOrder {
  sendMode: number;
  seqno: number;
  timeout: number;
  walletId: number;
}

function toLedgerPath(derivationPath: DerivationPathArray) {
  const [purpose, coinType, network, workchain, account, ...rest] = derivationPath;
  const isTonPath =
    purpose === 44 &&
    coinType === 607 &&
    network === 0 &&
    workchain === 0 &&
    typeof account === "number" &&
    Number.isInteger(account) &&
    account >= 0 &&
    rest.length === 0;

  if (!isTonPath) {
    throw new SwapKitError({
      errorKey: "wallet_ledger_derivation_path_error",
      info: { derivationPath, reason: "Ledger TON accounts derive from m/44'/607'/0'/0'/{account}'" },
    });
  }

  return [44, 607, 0, 0, account, 0];
}

function invalidParams(reason: string, info: Record<string, unknown> = {}) {
  return new SwapKitError({
    errorKey: "wallet_ledger_invalid_params",
    info: { ...info, reason, wallet: WalletOption.LEDGER },
  });
}

function resolveSingleMessage(input: TONTransactionInput) {
  const messages = Array.isArray(input) ? input : input.messages;
  const [message] = messages;

  if (!message) throw invalidParams("A TON transaction needs one message");
  if (messages.length > 1) {
    throw new SwapKitError({
      errorKey: "wallet_ledger_method_not_supported",
      info: {
        messageCount: messages.length,
        method: "signTransaction",
        reason: "Ledger signs one TON message per transaction",
        wallet: WalletOption.LEDGER,
      },
    });
  }

  const transactionSendMode = Array.isArray(input) ? message.sendMode : input.sendMode;
  if (
    !Array.isArray(input) &&
    message.sendMode !== undefined &&
    transactionSendMode !== undefined &&
    message.sendMode !== transactionSendMode
  ) {
    throw invalidParams("The message send mode differs from the transaction send mode", {
      messageSendMode: message.sendMode,
      sendMode: transactionSendMode,
    });
  }

  const sendMode = transactionSendMode ?? DEFAULT_SEND_MODE;
  if (!Number.isInteger(sendMode) || sendMode < 0 || sendMode > 255) {
    throw invalidParams("The TON send mode must be an integer between 0 and 255", { sendMode });
  }

  return { message, sendMode };
}

async function toLedgerOrder(message: TONTransactionMessage): Promise<TONLedgerOrder> {
  const [{ Address, Cell, loadStateInit }, { parseMessage }] = await Promise.all([
    import("@ton/core"),
    import("@ton-community/ton-ledger"),
  ]);

  if (!/^\d+$/.test(message.amount)) {
    throw invalidParams("The TON amount must be an integer number of nanotons", { amount: message.amount });
  }
  const amount = BigInt(message.amount);

  let to: Address;
  try {
    to = Address.parse(message.address);
  } catch {
    throw invalidParams("Invalid TON destination address", { address: message.address });
  }
  // Raw `0:<hex>` destinations default to bounceable, the toolbox convention; friendly ones carry their own flag.
  const bounce = Address.isFriendly(message.address) ? Address.parseFriendly(message.address).isBounceable : true;

  let stateInit: StateInit | undefined;
  if (message.stateInit !== undefined) {
    try {
      stateInit = loadStateInit(Cell.fromBase64(message.stateInit).beginParse());
    } catch {
      throw invalidParams("The TON state init is not a valid BOC", { stateInit: message.stateInit });
    }
  }

  let payload: Cell | undefined;
  if (message.payload !== undefined) {
    try {
      payload = Cell.fromBase64(message.payload);
    } catch {
      throw invalidParams("The TON payload is not a valid BOC", { payload: message.payload });
    }
  }

  // A payload the app cannot display is kept as the untouched `unsafe` cell, which the device signs blind or refuses.
  const payloadFormat = payload ? parseMessage(payload, { disallowModification: true }) : undefined;

  return { amount, bounce, payload, payloadFormat, stateInit, to };
}

function sameCell(a: Cell | null | undefined, b: Cell | null | undefined) {
  return a && b ? a.hash().equals(b.hash()) : a == null && b == null;
}

function sameStateInit(signed: StateInit | null | undefined, requested: StateInit | undefined) {
  if (!(signed && requested)) return signed == null && requested == null;
  return sameCell(signed.code, requested.code) && sameCell(signed.data, requested.data);
}

// The library re-encodes structured payloads before the device signs them, so the body it returns is only
// broadcast when the signed order is the requested one.
async function assertSignedTransfer(body: Cell, expected: SignedTransferExpectation) {
  const { Cell, loadMessageRelaxed } = await import("@ton/core");

  try {
    const transfer = body.beginParse().skip(512);
    const walletId = transfer.loadUint(32);
    const timeout = transfer.loadUint(32);
    const seqno = transfer.loadUint(32);
    transfer.skip(8);
    const sendMode = transfer.loadUint(8);
    const order = loadMessageRelaxed(transfer.loadRef().beginParse());
    transfer.endParse();

    const matches =
      walletId === expected.walletId &&
      timeout === expected.timeout &&
      seqno === expected.seqno &&
      sendMode === expected.sendMode &&
      order.info.type === "internal" &&
      order.info.dest.equals(expected.to) &&
      order.info.value.coins === expected.amount &&
      order.info.bounce === expected.bounce &&
      order.body.hash().equals((expected.payload ?? Cell.EMPTY).hash()) &&
      sameStateInit(order.init, expected.stateInit);
    if (matches) return;
  } catch (error) {
    throw new SwapKitError(
      { errorKey: "wallet_ledger_signing_error", info: { reason: "Unreadable signed TON transfer" } },
      error,
    );
  }

  throw new SwapKitError({
    errorKey: "wallet_ledger_signing_error",
    info: { reason: "The signed TON transfer does not match the requested message" },
  });
}

export async function TONLedger(paramsOrPath?: TONLedgerParams | DerivationPathArray, transport?: Transport) {
  const { derivationPath, ...connection } = normalizeLedgerJsClientParams({ paramsOrPath, transport });
  const path = toLedgerPath(derivationPath || NetworkDerivationPath[Chain.Ton]);

  async function runTonOperation<Output>({
    operation,
    requiredUserInteraction,
  }: {
    operation: (app: TonTransport) => Promise<Output>;
    requiredUserInteraction?: UserInteractionRequired;
  }) {
    const { TonTransport } = await import("@ton-community/ton-ledger");
    return runLedgerJsOperation({
      appName: "TON",
      connection,
      createApp: (ledgerTransport) => new TonTransport(ledgerTransport),
      operation,
      requiredUserInteraction,
    });
  }

  const [{ Address }, { WalletContractV4 }] = await Promise.all([import("@ton/core"), import("@ton/ton")]);
  const { address: deviceAddress, publicKey } = await runTonOperation({
    operation: (app) =>
      app.getAddress(path, { bounceable: false, chain: TON_WORKCHAIN, testOnly: false, walletVersion: "v4" }),
  });

  const wallet = WalletContractV4.create({ publicKey, workchain: TON_WORKCHAIN });
  if (!wallet.address.equals(Address.parse(deviceAddress))) {
    throw new SwapKitError({
      errorKey: "wallet_ledger_failed_to_get_address",
      info: { deviceAddress, reason: "The Ledger TON address is not the wallet v4 address of its public key" },
    });
  }
  const address = wallet.address.toString({ bounceable: false, urlSafe: true });

  let client: TonClient | undefined;
  async function getWalletState() {
    if (!client) {
      const { TonClient } = await import("@ton/ton");
      client = new TonClient({ endpoint: await getRPCUrl(Chain.Ton) });
    }
    const { state } = await client.getContractState(wallet.address);
    const deployed = state === "active";
    const seqno = deployed ? await client.open(wallet).getSeqno() : 0;

    return { deployed, seqno };
  }

  async function signTransaction(input: TONTransactionInput): Promise<Cell> {
    const { message, sendMode } = resolveSingleMessage(input);
    const order = await toLedgerOrder(message);
    const { deployed, seqno } = await getWalletState();
    const timeout = Math.floor(Date.now() / 1000) + TRANSACTION_VALID_SECONDS;

    const body = await runTonOperation({
      operation: (app) =>
        app.signTransaction(path, {
          amount: order.amount,
          bounce: order.bounce,
          payload: order.payloadFormat,
          sendMode,
          seqno,
          stateInit: order.stateInit,
          timeout,
          to: order.to,
        }),
      requiredUserInteraction: LEDGER_USER_INTERACTION_REQUIRED.SignTransaction,
    });
    await assertSignedTransfer(body, { ...order, sendMode, seqno, timeout, walletId: wallet.walletId });

    const { beginCell, external, storeMessage } = await import("@ton/core");
    return beginCell()
      .store(storeMessage(external({ body, init: deployed ? undefined : wallet.init, to: wallet.address })))
      .endCell();
  }

  return { getAddress: () => address, publicKey, signTransaction };
}
