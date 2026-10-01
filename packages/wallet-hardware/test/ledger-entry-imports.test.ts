import { describe, expect, it } from "bun:test";
import { dirname, join, relative } from "node:path";

import packageJson from "../package.json";

const packageRoot = join(import.meta.dir, "..");
const transpiler = new Bun.Transpiler({ loader: "ts" });

// The LedgerJS packages stay external and their lib-es builds (hw-transport, errors, most hw-app-*) use extensionless
// relative imports that Node ESM cannot resolve, so a static import breaks `import "@swapkit/wallet-hardware/ledger"`
// in SSR, scripts and test runners. The DMK packages are bundled into lazy chunks that a static import would load with
// the entry. An entry point may therefore reach `@ledgerhq/*` only through `import()`.
async function collectEagerPackageImports(entry: string) {
  const visited = new Set<string>();
  const pending = [entry];
  const packageImports: Array<{ importer: string; specifier: string }> = [];

  for (let file = pending.pop(); file; file = pending.pop()) {
    if (visited.has(file)) continue;
    visited.add(file);

    // `scanImports` drops `import type` and all-type specifier lists, like the bundler, and reports re-exports and
    // `require` calls, so every edge it keeps that is not an `import()` loads with the module.
    for (const { kind, path } of transpiler.scanImports(await Bun.file(file).text())) {
      if (kind === "dynamic-import") continue;
      if (path.startsWith(".")) {
        pending.push(Bun.resolveSync(path, dirname(file)));
        continue;
      }
      packageImports.push({ importer: relative(packageRoot, file), specifier: path });
    }
  }

  return packageImports;
}

describe("wallet-hardware entry points", () => {
  for (const [subpath, { bun: entry }] of Object.entries(packageJson.exports)) {
    it(`${subpath} loads @ledgerhq packages lazily`, async () => {
      const packageImports = await collectEagerPackageImports(join(packageRoot, entry));
      const eagerLedgerImports = packageImports
        .filter(({ specifier }) => specifier.startsWith("@ledgerhq/"))
        .map(({ importer, specifier }) => `${specifier} <- ${importer}`);

      expect(eagerLedgerImports).toEqual([]);
    });
  }
});
