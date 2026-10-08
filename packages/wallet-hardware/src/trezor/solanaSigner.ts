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
      signatures: transaction.signatures as (Uint8Array | null)[],
      signerKeys: staticAccountKeys.slice(0, header.numRequiredSignatures),
    };
  }

  const message = transaction.serializeMessage();
  return {
    message,
    signatures: transaction.signatures.map(({ signature }) => signature),
    signerKeys: transaction.signatures.map(({ publicKey }) => publicKey),
  };
}

export function getSolanaSigningPayload(transaction: SolanaTransaction, address: string) {
  const { message, signatures, signerKeys } = getSigners(transaction);
  const signerIndex = signerKeys.findIndex((key) => key.toBase58() === address);

  if (signerIndex === -1) throw notSupported("Trezor account is not a required signer of this transaction");

  const missingSigners = signerKeys.filter(
    (_, index) => index !== signerIndex && !signatures[index]?.some((byte) => byte !== 0),
  );
  if (missingSigners.length > 0) {
    const missing = missingSigners.map((key) => key.toBase58()).join(", ");
    throw notSupported(`Transaction also needs signatures from ${missing}`);
  }

  return { message, signerKey: signerKeys[signerIndex] as PublicKey };
}

export function addSolanaSignature<T extends SolanaTransaction>(
  transaction: T,
  { signature, signerKey }: { signature: Uint8Array; signerKey: PublicKey },
) {
  if (signature.length !== 64) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_failed_to_sign_transaction",
      info: { chain: Chain.Solana, error: `Invalid signature length: ${signature.length}` },
    });
  }

  transaction.addSignature(signerKey, Buffer.from(signature));
  return transaction;
}

export function getSolanaSigner({ derivationPath }: { derivationPath: DerivationPathArray }) {
  // Trezor firmware only accepts m/44'/501' plus up to two more levels.
  const [purpose, coinType] = derivationPath;
  if (purpose !== 44 || coinType !== 501 || derivationPath.length > 4) {
    throw new SwapKitError({
      errorKey: "wallet_trezor_derivation_path_not_supported",
      info: { chain: Chain.Solana, derivationPath },
    });
  }

  const path = derivationPathToString(derivationPath, { allHardened: true });
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
    return addSolanaSignature(transaction, { signature, signerKey });
  }

  return {
    connect: async () => ({ publicKey: new PublicKey(await loadAddress(true)) }),
    disconnect: () => Promise.resolve(),
    getAddress: () => loadAddress(true),
    get publicKey() {
      return publicKey;
    },
    signTransaction,
  };
}
