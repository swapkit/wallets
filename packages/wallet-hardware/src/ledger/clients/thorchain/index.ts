import type { AccountData, AminoSignResponse, StdSignDoc } from "@cosmjs/amino";
import { Secp256k1Signature } from "@cosmjs/crypto";
import {
  CallTaskInAppDeviceAction,
  type DmkError,
  DmkResultFactory,
  isSuccessCommandResult,
  UnknownDeviceExchangeError,
  UserInteractionRequired,
} from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { base64 } from "@scure/base";
import { type DerivationPathArray, NetworkDerivationPath, SKConfig, SwapKitError } from "@swapkit/helpers";

import type { LedgerDMKSession } from "../../helpers/dmk";
import { executeLedgerDeviceAction, type LedgerDeviceActionStateHandler } from "../../helpers/executeDeviceAction";
import {
  getThorAddressCommand,
  getThorLegacyVersion,
  getThorSignCommands,
  invalidThorAppVersion,
  parseThorAddressResponse,
  sendThorLegacyCommand,
  type ThorCommand,
} from "./protocol";

const THOR_APP_NAME = "THORChain";

interface THORChainLedgerParams {
  derivationPath?: DerivationPathArray;
  dmkSession?: LedgerDMKSession;
  onDeviceActionState?: LedgerDeviceActionStateHandler;
  transport?: Transport;
}

type ThorchainAssetObject = { chain?: string; symbol?: string; synth?: boolean; ticker?: string };

type ThorchainDepositCoin = { amount: string; asset: string | ThorchainAssetObject };

function getAminoAssetDenom(asset: string | ThorchainAssetObject) {
  if (typeof asset === "string") return asset;

  const chain = asset.chain?.toUpperCase();
  const symbol = (asset.symbol || asset.ticker || "").toUpperCase();

  if (!(chain && symbol)) return symbol || chain || "";
  return `${chain}${asset.synth ? "/" : "."}${symbol}`;
}

export function normalizeThorchainLedgerSignDoc(signDoc: StdSignDoc): StdSignDoc {
  return {
    ...signDoc,
    msgs: signDoc.msgs.map((msg) => {
      if (!msg.type.includes("MsgDeposit")) return msg;

      const coins = msg.value.coins;
      if (!Array.isArray(coins)) return msg;

      return {
        ...msg,
        value: {
          ...msg.value,
          coins: coins.map((coin: ThorchainDepositCoin) => ({ ...coin, asset: getAminoAssetDenom(coin.asset) })),
        },
      };
    }),
  };
}

function getFixedSignature({ signature }: { signature: Uint8Array }) {
  try {
    return Secp256k1Signature.fromDer(signature).toFixedLength();
  } catch (error) {
    throw new SwapKitError("wallet_ledger_invalid_signature", error);
  }
}

export class THORChainLedger {
  readonly derivationPath: DerivationPathArray;
  private readonly dmkSession?: LedgerDMKSession;
  private readonly onDeviceActionState?: LedgerDeviceActionStateHandler;
  private pubKey: Uint8Array | undefined;
  private readonly transport?: Transport;

  constructor({
    derivationPath = NetworkDerivationPath.THOR,
    dmkSession,
    onDeviceActionState,
    transport,
  }: THORChainLedgerParams = {}) {
    if (dmkSession && transport) {
      throw new SwapKitError("wallet_ledger_invalid_params", {
        message: "Provide either a Ledger DMK session or a LedgerJS transport, not both",
      });
    }

    if (!(dmkSession || transport)) throw new SwapKitError("wallet_ledger_connection_error");

    this.derivationPath = derivationPath;
    this.dmkSession = dmkSession;
    this.onDeviceActionState = onDeviceActionState;
    this.transport = transport;
  }

  get pubkey() {
    return this.pubKey ? base64.encode(this.pubKey) : null;
  }

  private executeCommands = async ({
    commands,
    requiredUserInteraction,
  }: {
    commands: ThorCommand[];
    requiredUserInteraction: UserInteractionRequired;
  }) => {
    if (this.transport) {
      const version = await getThorLegacyVersion({ transport: this.transport });
      if (!version.startsWith("2.")) throw invalidThorAppVersion({ version });

      let response = new Uint8Array();
      for (const command of commands) {
        response = await sendThorLegacyCommand({ command, transport: this.transport });
      }
      return response;
    }

    const dmkSession = this.dmkSession;
    if (!dmkSession) throw new SwapKitError("wallet_ledger_connection_error");

    const deviceAction = new CallTaskInAppDeviceAction<{ response: Uint8Array }, DmkError, UserInteractionRequired>({
      input: {
        appName: THOR_APP_NAME,
        requiredUserInteraction,
        skipOpenApp: false,
        task: async (internalApi) => {
          try {
            const sessionState = internalApi.getDeviceSessionState();
            const version = "currentApp" in sessionState ? sessionState.currentApp.version : undefined;
            if (!version?.startsWith("2.")) {
              return DmkResultFactory<{ response: Uint8Array }, DmkError>({
                error: invalidThorAppVersion({ version }),
              });
            }

            let response: Uint8Array<ArrayBufferLike> = new Uint8Array();
            for (const command of commands) {
              const result = await internalApi.sendCommand(command);
              if (!isSuccessCommandResult(result)) {
                return DmkResultFactory<{ response: Uint8Array }, DmkError>({ error: result.error });
              }
              response = result.data;
            }

            return DmkResultFactory<{ response: Uint8Array }, DmkError>({ data: { response } });
          } catch (error) {
            return DmkResultFactory<{ response: Uint8Array }, DmkError>({
              error: new UnknownDeviceExchangeError(error),
            });
          }
        },
      },
    });

    const result = await executeLedgerDeviceAction({
      action: dmkSession.dmk.executeDeviceAction({ deviceAction, sessionId: dmkSession.sessionId }),
      onDeviceActionState: this.onDeviceActionState,
    });

    return result.response;
  };

  private getAddressData = async ({ checkOnDevice }: { checkOnDevice: boolean }) => {
    const { isStagenet } = SKConfig.get("envs");
    const response = await this.executeCommands({
      commands: [
        getThorAddressCommand({ checkOnDevice, hrp: isStagenet ? "sthor" : "thor", path: this.derivationPath }),
      ],
      requiredUserInteraction: checkOnDevice ? UserInteractionRequired.VerifyAddress : UserInteractionRequired.None,
    });

    return parseThorAddressResponse({ response });
  };

  private signBytes = async ({ message }: { message: Uint8Array }) => {
    const response = await this.executeCommands({
      commands: getThorSignCommands({ message, path: this.derivationPath }),
      requiredUserInteraction: UserInteractionRequired.SignTransaction,
    });

    return getFixedSignature({ signature: response });
  };

  connect = async () => {
    const { address, publicKey } = await this.getAddressData({ checkOnDevice: false });
    this.pubKey = publicKey;
    return address;
  };

  getAddressAndPubKey = async () => {
    const { address, publicKey } = await this.getAddressData({ checkOnDevice: false });
    this.pubKey = publicKey;

    return { bech32_address: address, compressed_pk: publicKey, error_message: "No errors", return_code: 0x9000 };
  };

  showAddressAndPubKey = async () => {
    const { address, publicKey } = await this.getAddressData({ checkOnDevice: true });
    this.pubKey = publicKey;

    return { bech32_address: address, compressed_pk: publicKey, error_message: "No errors", return_code: 0x9000 };
  };

  signTransaction = async ({ rawTx, sequence = "0" }: { rawTx: string; sequence?: string }) => {
    if (!this.pubKey) await this.connect();
    const pubKey = this.pubKey;
    if (!pubKey) throw new SwapKitError("wallet_ledger_pubkey_not_found");

    const signature = await this.signBytes({ message: new TextEncoder().encode(rawTx) });

    return [
      {
        pub_key: { type: "tendermint/PubKeySecp256k1", value: base64.encode(pubKey) },
        sequence,
        signature: base64.encode(signature),
      },
    ];
  };

  signAmino = async (signerAddress: string, signDoc: StdSignDoc): Promise<AminoSignResponse> => {
    const account = (await this.getAccounts()).find(({ address }) => address === signerAddress);
    if (!account) throw new SwapKitError("wallet_ledger_address_not_found", { address: signerAddress });

    const { encodeSecp256k1Signature, serializeSignDoc } = await import("@cosmjs/amino");

    const signature = await this.signBytes({ message: serializeSignDoc(normalizeThorchainLedgerSignDoc(signDoc)) });

    return { signature: encodeSecp256k1Signature(account.pubkey, signature), signed: signDoc };
  };

  getAccounts = async (): Promise<readonly AccountData[]> => {
    const { address, publicKey } = await this.getAddressData({ checkOnDevice: false });
    this.pubKey = publicKey;
    return [{ address, algo: "secp256k1", pubkey: publicKey }];
  };

  sign = async (message: string) => base64.encode(await this.signBytes({ message: new TextEncoder().encode(message) }));
}
