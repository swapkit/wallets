import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { BuildMetafile } from "bun";

const licenceFilePattern = /^(licen[cs]e|notice|copying)/i;
// Innermost `node_modules/<name>` or `node_modules/@scope/<name>` directory of a bundled input.
const packageRootPattern = /^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//;

// Bundled dependencies ship inside dist next to the package's own LICENSE, so their licence texts ship with them.
export async function writeThirdPartyNotices(metafiles: (BuildMetafile | undefined)[]): Promise<void> {
  const packageRoots = new Set(
    metafiles
      .flatMap((metafile) => Object.keys(metafile?.inputs ?? {}))
      .map((input) => resolve(input).match(packageRootPattern)?.[1])
      .filter((packageRoot) => packageRoot !== undefined),
  );

  // Keyed by name@version so one release installed under several peer-dependency hashes is listed once.
  const notices = new Map(await Promise.all([...packageRoots].map(readNotice)));
  // Only bundled builds call this, so an empty list means the metafile shape changed, not that nothing was bundled.
  if (!notices.size) {
    throw new Error("writeThirdPartyNotices: no bundled packages found in the build metafile");
  }

  const sections = [...notices].sort(([a], [b]) => a.localeCompare(b)).map(([, notice]) => notice);
  await Bun.write("./dist/THIRD_PARTY_LICENSES.md", `# Third-party licences\n\n${sections.join("\n")}`);
}

async function readNotice(packageRoot: string): Promise<[string, string]> {
  const { license, name, version } = (await Bun.file(join(packageRoot, "package.json")).json()) as {
    license?: unknown;
    name: string;
    version: string;
  };
  const licenceFiles = (await readdir(packageRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && licenceFilePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  const texts = await Promise.all(licenceFiles.map((file) => Bun.file(join(packageRoot, file)).text()));
  const packageId = `${name}@${version}`;
  const licence = typeof license === "string" ? license : "UNKNOWN";

  return [packageId, `## ${packageId} (${licence})\n\n${texts.join("\n\n").trim() || "No licence file shipped."}\n`];
}
