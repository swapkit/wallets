import { ed25519 } from "@noble/curves/ed25519.js";
import { hex } from "@scure/base";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { Chain, type DerivationPathArray, derivationPathToString, SwapKitError } from "@swapkit/helpers";

type SolanaTransaction = Transaction | VersionedTransaction;

function notSupported(reason: string) {
  return new SwapKitError({ errorKey: "wallet_trezor_method_not_supported", info: { chain: Chain.Solana, reason } });
}

function getSigners(transaction: SolanaTransaction) {
  if ("version" in transaction) {
    const { header, staticAccountKeys } = transaction.message;
    return {
      message: transaction.message.serialize(),
      signerKeys: staticAccountKeys.slice(0, header.numRequiredSignatures),
    };
  }

  return {
    message: transaction.serializeMessage(),
    signerKeys: transaction.signatures.map(({ publicKey }) => publicKey),
  };
}

export function getSolanaSigningPayload(transaction: SolanaTransaction, address: string) {
  const { message, signerKeys } = getSigners(transaction);
  const signerIndex = signerKeys.findIndex((key) => key.toBase58() === address);

  if (signerIndex === -1) throw notSupported("Trezor account is not a required signer of this transaction");

  return { message, signerKey: signerKeys[signerIndex] as PublicKey };
}

export function addSolanaSignature<T extends SolanaTransaction>(
  transaction: T,
  { message, signature, signerKey }: { message: Uint8Array; signature: Uint8Array; signerKey: PublicKey },
) {
  if (signature.length !== 64) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_failed_to_sign_transaction",
      info: { chain: Chain.Solana, error: `Invalid signature length: ${signature.length}` },
    });
  }

  if (!ed25519.verify(signature, message, signerKey.toBytes())) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_failed_to_sign_transaction",
      info: { chain: Chain.Solana, error: "Signature does not match the Trezor account" },
    });
  }

  transaction.addSignature(signerKey, Buffer.from(signature));
  return transaction;
}

export function getSolanaSigner({
  address,
  derivationPath,
}: {
  address?: string;
  derivationPath: DerivationPathArray;
}) {
  // Trezor firmware only accepts m/44'/501' plus up to two more levels.
  const [purpose, coinType] = derivationPath;
  if (purpose !== 44 || coinType !== 501 || derivationPath.length > 4) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_derivation_path_not_supported",
      info: { chain: Chain.Solana, derivationPath },
    });
  }

  const path = derivationPathToString(derivationPath, { allHardened: true });
  const knownKey = address ? new PublicKey(address) : null;
  let publicKey: PublicKey | null = null;

  async function loadAddress(showOnTrezor: boolean) {
    if (publicKey) return publicKey.toBase58();

    const TrezorConnect = (await import("@trezor/connect-web")).default;
    const result = await TrezorConnect.solanaGetAddress({ path, showOnTrezor });

    if (!result.success) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_get_address",
        info: { chain: Chain.Solana, derivationPath, error: result.payload.error },
      });
    }

    publicKey = new PublicKey(result.payload.address);
    return result.payload.address;
  }

  async function signTransaction<T extends SolanaTransaction>(transaction: T) {
    const { message, signerKey } = getSolanaSigningPayload(transaction, await loadAddress(false));
    const TrezorConnect = (await import("@trezor/connect-web")).default;

    const result = await TrezorConnect.solanaSignTransaction({ path, serializedTx: hex.encode(message) });

    if (!result.success) {
      throw new SwapKitError({
        errorKey: "wallet_trezor_failed_to_sign_transaction",
        info: { chain: Chain.Solana, error: result.payload.error },
      });
    }

    const signature = hex.decode(result.payload.signature.replace(/^0x/, ""));
    return addSolanaSignature(transaction, { message, signature, signerKey });
  }

  return {
    connect: async () => ({ publicKey: new PublicKey(await loadAddress(true)) }),
    disconnect: () => Promise.resolve(),
    getAddress: () => loadAddress(true),
    get publicKey() {
      return publicKey ?? knownKey;
    },
    signTransaction,
  };
}
