// tools/enrich-internal-changelogs.ts
//
// Runs AFTER `changeset version` and AFTER `tools/enrich-dep-changelogs.ts`.
// Rewrites the newest CHANGELOG section of each package that bumped in this
// release, replacing Changesets' "Updated dependencies" blocks for local
// workspace packages with the real leaf summaries from those bumped packages.
//
// This mirrors the SDK repo's packages/builder/src/enrich-changelogs.ts. Only
// deps that also changed in this version-bump run are followed; unchanged deps
// describe already-published changes and should not be inlined again.

import { $, Glob } from "bun";

type DepRef = { name: string; version: string };
type Section = { depRefs: DepRef[]; end: number; realBullets: string[]; start: number; version: string };

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_BULLETS = 10;

const changelogs = new Map<string, string>();
const bumpedThisRun = new Set<string>();
const newest = new Map<string, Section | null>();
const leafCache = new Map<string, string[]>();

function parseNewestSection(content: string): Section | null {
  const lines = content.split("\n");
  let current: Section | null = null;
  let inDepBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const version = line.match(/^## (.+)$/)?.[1];

    if (version) {
      if (current) break;
      current = { depRefs: [], end: i + 1, realBullets: [], start: i, version: version.trim() };
      inDepBlock = false;
      continue;
    }
    if (!current) continue;

    current.end = i + 1;

    if (/^- Updated dependencies/.test(line)) {
      inDepBlock = true;
      continue;
    }

    const dep = line.match(/^\s+- (@swapkit\/[^@]+)@([\d.]+(?:-[\w.]+)?)/);
    if (inDepBlock && dep?.[1] && dep[2]) {
      current.depRefs.push({ name: dep[1], version: dep[2] });
      continue;
    }

    if (/^- /.test(line)) {
      inDepBlock = false;
      current.realBullets.push(line.trim());
    }
  }

  return current;
}

async function versionAtHead(pkgJsonPath: string): Promise<string | null> {
  try {
    const out = await $`git show HEAD:${pkgJsonPath}`.quiet().text();
    return (JSON.parse(out) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

function resolveLeaf(name: string, version: string, seen = new Set<string>()): string[] {
  const key = `${name}@${version}`;
  const cached = leafCache.get(key);
  if (cached) return cached;
  if (seen.has(key)) return [];
  seen.add(key);

  const section = newest.get(name);
  if (!section || section.version !== version) return [];

  const bullets = [...section.realBullets];
  for (const ref of section.depRefs) {
    if (!bumpedThisRun.has(ref.name)) continue;
    bullets.push(...resolveLeaf(ref.name, ref.version, seen));
  }
  leafCache.set(key, bullets);
  return bullets;
}

function normalizeBullet(bullet: string) {
  return bullet.toLowerCase().replace(/^- /, "").replace(/\s+/g, " ").trim();
}

for await (const file of new Glob("*/CHANGELOG.md").scan("./packages")) {
  const changelogPath = `./packages/${file}`;
  const pkgJson = (await Bun.file(changelogPath.replace(/CHANGELOG\.md$/, "package.json")).json()) as { name?: string };
  if (pkgJson.name?.startsWith("@swapkit/")) changelogs.set(pkgJson.name, changelogPath);
}

for (const [name, changelogPath] of changelogs) {
  const pkgJsonPath = changelogPath.replace(/CHANGELOG\.md$/, "package.json");
  const current = ((await Bun.file(pkgJsonPath).json()) as { version?: string }).version;
  const head = await versionAtHead(pkgJsonPath.replace(/^\.\//, ""));
  if (!current || current === head) continue;

  bumpedThisRun.add(name);
  newest.set(name, parseNewestSection(await Bun.file(changelogPath).text()));
}

for (const [name, changelogPath] of changelogs) {
  if (!bumpedThisRun.has(name)) continue;

  const section = newest.get(name);
  if (!section) continue;

  const changedRefs = section.depRefs.filter((ref) => bumpedThisRun.has(ref.name));
  if (changedRefs.length === 0) continue;

  const enriched: { text: string; via: string }[] = [];
  const seenText = new Set(section.realBullets.map(normalizeBullet));
  for (const ref of changedRefs) {
    for (const text of resolveLeaf(ref.name, ref.version)) {
      const key = normalizeBullet(text);
      if (seenText.has(key)) continue;
      seenText.add(key);
      enriched.push({ text: text.replace(/^- /, ""), via: `${ref.name}@${ref.version}` });
    }
  }
  if (enriched.length === 0) continue;

  const kept = enriched.slice(0, MAX_BULLETS);
  const overflow = enriched.length - kept.length;
  const block = [
    ...section.realBullets,
    ...kept.map((item) => `- ${item.text} (via ${item.via})`),
    ...(overflow > 0 ? [`- ...and ${overflow} more dependency change${overflow > 1 ? "s" : ""}`] : []),
  ];

  const lines = (await Bun.file(changelogPath).text()).split("\n");
  const headerIdx = lines.findIndex(
    (line, index) => index > section.start && index < section.end && /^### /.test(line),
  );
  if (headerIdx < 0) {
    console.warn(`no changelog change-type heading found for ${name}@${section.version}`);
    continue;
  }

  const rebuilt = [...lines.slice(0, headerIdx + 1), "", ...block, "", ...lines.slice(section.end)].join("\n");

  if (DRY_RUN) {
    console.info(`\n=== ${name} @ ${section.version} ===\n${block.join("\n")}`);
  } else {
    await Bun.write(changelogPath, rebuilt);
    console.info(`enriched ${name}@${section.version} (+${kept.length} bullets)`);
  }
}
