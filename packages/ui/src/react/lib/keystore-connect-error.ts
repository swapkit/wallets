const DERIVATION_ERROR_KEYS = new Set([
  "toolbox_derivation_slot_unsupported",
  "toolbox_utxo_invalid_params",
  "toolbox_utxo_unsupported_script_type",
]);

export function connectErrorMessage(error: unknown) {
  const errorKey = (error as { errorKey?: string })?.errorKey;
  if (!(errorKey && DERIVATION_ERROR_KEYS.has(errorKey))) {
    return "You used an incorrect password or something went wrong.";
  }

  const chain = (error as { info?: { chain?: string } })?.info?.chain;

  return chain
    ? `${chain} does not accept the derivation path you chose. Pick another path for ${chain} and try again.`
    : "One of the chains does not accept the derivation path you chose. Pick another path and try again.";
}
