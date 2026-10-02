import { buildPackage } from "../../tools/builder";

// DMK, its WebHID transport, the context module and the signer kits publish ESM with extensionless and directory
// imports that Node cannot load, so they and their undeclared dependencies are bundled at the lockfile versions: a fix
// in any of them reaches consumers only through a release of this package. Their ~ ranges still govern the public
// types, other declared dependencies stay external, and the bundled licences go to dist/THIRD_PARTY_LICENSES.md.
const nodeIncompatibleLedgerPackages = [
  "@ledgerhq/context-module",
  "@ledgerhq/device-management-kit",
  "@ledgerhq/device-signer-kit-bitcoin",
  "@ledgerhq/device-signer-kit-cosmos",
  "@ledgerhq/device-signer-kit-ethereum",
  "@ledgerhq/device-signer-kit-zcash",
  "@ledgerhq/device-transport-kit-web-hid",
];

void buildPackage({ bundlePackages: nodeIncompatibleLedgerPackages });
