import { $, Glob } from "bun";

const cwd = process.cwd();
const versions: Record<string, { filePath: string; version: string }> = {};
const dependencyFields = ["dependencies", "peerDependencies", "devDependencies"] as const;

async function setVersions() {
  const glob = new Glob("**/package.json");

  for await (const file of glob.scan("./packages")) {
    const filePath = `./packages/${file}`;
    const { name, version } = await Bun.file(filePath).json();

    if (name?.startsWith("@swapkit/") && version) {
      versions[name] = { filePath, version };
    }
  }

  for (const { filePath } of Object.values(versions)) {
    const pkgContent = await Bun.file(`${cwd}/${filePath}`).json();
    let changed = false;

    for (const [packageName, { version: dependencyVersion }] of Object.entries(versions)) {
      for (const field of dependencyFields) {
        if (pkgContent?.[field]?.[packageName]) {
          pkgContent[field][packageName] = dependencyVersion;
          changed = true;
        }
      }
    }

    if (changed) {
      await Bun.write(`${cwd}/${filePath}`, `${JSON.stringify(pkgContent, null, 2)}\n`);
    }
  }
}

await setVersions();
await $`bun lint`;
