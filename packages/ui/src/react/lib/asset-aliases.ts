const ALIAS_TO_CANONICAL: ReadonlyArray<[alias: string, canonical: string]> = [
  ["ARC.USDC-0x3600000000000000000000000000000000000000", "ARC.USDC"],
];

const ASSET_IDENTIFIER_ALIASES: ReadonlyMap<string, string> = new Map(
  ALIAS_TO_CANONICAL.map(([alias, canonical]) => [alias.toLowerCase(), canonical]),
);

export function isAssetIdentifierAlias(identifier: string): boolean {
  return ASSET_IDENTIFIER_ALIASES.has(identifier.toLowerCase());
}

export function canonicalAssetIdentifier(identifier: string): string {
  return ASSET_IDENTIFIER_ALIASES.get(identifier.toLowerCase()) ?? identifier;
}
