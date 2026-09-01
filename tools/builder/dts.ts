import { existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";

/**
 * Bun stores dependencies in node_modules/.bun/ instead of hoisting them
 * to standard node_modules/<pkg> locations. tsc with declaration emit (TS2742)
 * can't resolve types through .bun/ paths, so we symlink them before building.
 */
function symlinkBunDeps() {
  const rootNodeModules = resolve("node_modules");
  const bunDir = join(rootNodeModules, ".bun");

  if (!existsSync(bunDir)) return;

  for (const entry of readdirSync(bunDir)) {
    // entries look like: @scope+pkg@version+hash or pkg@version+hash
    const match = entry.match(/^(@[^+]+)\+([^@]+)@/) || entry.match(/^([^@][^+]*)@/);
    if (!match) continue;

    const isScoped = entry.startsWith("@");
    const scope = isScoped ? match[1] : null;
    const pkgName = isScoped ? match[2] : match[1];

    const fullPkgName = scope ? `${scope}/${pkgName}` : pkgName;
    const target = join(bunDir, entry, "node_modules", fullPkgName);
    const link = join(rootNodeModules, fullPkgName);

    if (!existsSync(target) || existsSync(link)) continue;

    if (scope) {
      mkdirSync(join(rootNodeModules, scope), { recursive: true });
    }

    try {
      symlinkSync(target, link, "dir");
    } catch {
      // already exists or permission issue — skip
    }
  }
}

const dtsPlugin = {
  name: "@swapkit/bun-dts-plugin",
  setup: async (pkgName: string) => {
    const scope = `./packages/${pkgName}`;

    await $`find ${scope}/dist/types/ -name "*.d.ts*" -type f -delete 2>/dev/null || true`;
    await $`rm -rf ${scope}/tsconfig.tsbuildinfo`;

    const tempConfig = {
      compilerOptions: {
        allowImportingTsExtensions: false,
        declaration: true,
        declarationMap: true,
        emitDeclarationOnly: true,
        isolatedDeclarations: false,
        noEmit: false,
        outDir: "./dist/types",
        paths: {
          "@cosmjs/*": ["../../node_modules/@cosmjs/*"],
          "@near-wallet-selector/*": ["../../node_modules/@near-wallet-selector/*"],
          "@solana/*": ["../../node_modules/@solana/*"],
          "@swapkit/*": ["../../node_modules/@swapkit/*"],
          "@ton/*": ["../../node_modules/@ton/*"],
          "@walletconnect/*": ["../../node_modules/@walletconnect/*"],
          xrpl: ["../../node_modules/xrpl"],
        } as Record<string, string[]>,
        rootDir: "./src",
        skipLibCheck: true,
        tsBuildInfoFile: "./tsconfig.tsbuildinfo",
      },
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
      extends: "./tsconfig.json",
      include: ["src/**/*"],
    };

    await Bun.write(`${scope}/.tsconfig.tmp.json`, JSON.stringify(tempConfig));
    try {
      await $`cd ${scope} && bun --bun tsc -p .tsconfig.tmp.json`;
    } catch (error: any) {
      if (error?.stdout) {
        console.error(Buffer.from(error.stdout).toString());
      }
      throw new Error(
        `Error building @swapkit/${pkgName} d.ts files
         Fix the errors above and run "bun build:dts" again`,
      );
    } finally {
      await $`rm -f ${scope}/.tsconfig.tmp.json`;
    }
  },
};

export const orderedPackages = ["wallet-extensions", "wallet-hardware", "wallet-mobile", "wallets", "sdk", "ui"];

// Symlink .bun/ deps to standard node_modules/ paths so tsc can resolve them
console.info("Symlinking .bun/ dependencies for tsc compatibility...");
await symlinkBunDeps();

for (const pkg of orderedPackages) {
  console.info(`Building @swapkit/${pkg} d.ts files`);
  await dtsPlugin.setup(pkg);
}
