// tools/enrich-dep-changelogs.ts
//
// Runs AFTER `changeset version` (wired into `version-bump`), while the Version
// Packages release PR is being built. For every workspace package that bumped in
// THIS release, it finds the `@swapkit/<name>: <old> → <new>` markers that
// generate-dep-changeset wrote, reads each bumped dependency's CHANGELOG from the
// installed packages, slices the (old, new] range, and replaces the markers with
// the REAL underlying changes — so the release PR's changelog shows what actually
// changed, not just which versions moved.
//
// External-dep counterpart of the SDK's packages/builder/src/enrich-changelogs.ts
// (that one resolves internal siblings; this reads @swapkit/* from node_modules).
//
// Wire-up: "version-bump": "bunx changeset version && bun run ./tools/enrich-dep-changelogs.ts && bun install"

import { $, Glob } from "bun";
import { bulletsInRange, changelogCovers, dedupeKey } from "./changelog";

const DRY_RUN = process.argv.includes("--dry-run");
const MAX_BULLETS = 20; // cap a very wide release

// "@swapkit/<name>: <old> → <new>"  or  "@swapkit/<name>: <new>"
const MARKER = /@swapkit\/([a-z0-9-]+):\s*(?:([\d][\d.]*)\s*→\s*)?([\d][\d.]*)/;

// Version of a package.json at git HEAD (before this `changeset version` run).
async function versionAtHead(pkgJsonPath: string): Promise<string | null> {
  try {
    const out = await $`git show HEAD:${pkgJsonPath}`.quiet().text();
    return (JSON.parse(out) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}

// An installed copy of the external dep's changelog that covers newVersion. bun's
// isolated layout can hoist a different version to the top level than the one this
// repo uses, so check the hoisted copy first then scan the .bun store.
async function externalChangelog(name: string, newVersion: string): Promise<string | null> {
  const hoisted = Bun.file(`node_modules/${name}/CHANGELOG.md`);
  if (await hoisted.exists()) {
    const text = await hoisted.text();
    if (changelogCovers(text, newVersion)) return text;
  }
  for await (const rel of new Glob(`.bun/*/node_modules/${name}/CHANGELOG.md`).scan({
    cwd: "node_modules",
    dot: true,
  })) {
    const text = await Bun.file(`node_modules/${rel}`).text();
    if (changelogCovers(text, newVersion)) return text;
  }
  return null;
}

// --- Main ---------------------------------------------------------------------
for await (const file of new Glob("*/CHANGELOG.md").scan("./packages")) {
  const path = `./packages/${file}`;
  const pkgJsonPath = path.replace(/CHANGELOG\.md$/, "package.json");

  // Only packages that actually bumped in this `changeset version` run.
  const current = ((await Bun.file(pkgJsonPath).json()) as { version?: string }).version;
  const head = await versionAtHead(pkgJsonPath.replace(/^\.\//, ""));
  if (!current || current === head) continue;

  const lines = (await Bun.file(path).text()).split("\n");

  // Newest (top) section bounds.
  const start = lines.findIndex((l) => /^## /.test(l));
  if (start < 0) continue;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;

  // Marker lines within the newest section.
  const markerIdx: number[] = [];
  const refs: { name: string; old: string; new: string }[] = [];
  for (let i = start; i < end; i++) {
    const m = lines[i]?.match(MARKER);
    if (m?.[1] && m[3]) {
      markerIdx.push(i);
      refs.push({ name: `@swapkit/${m[1]}`, new: m[3], old: m[2] ?? "" });
    }
  }
  if (refs.length === 0) continue;

  // Resolve the underlying changes for each bumped dep, deduped across deps.
  const seen = new Set<string>();
  const enriched: string[] = [];
  for (const ref of refs) {
    const changelog = await externalChangelog(ref.name, ref.new);
    if (!changelog) {
      console.warn(`⚠ no installed CHANGELOG covering ${ref.name}@${ref.new} — leaving its marker as-is`);
      enriched.push(`  - ${ref.name}: ${ref.old ? `${ref.old} → ${ref.new}` : ref.new}`);
      continue;
    }
    // Keep each bullet verbatim — the SDK changelogs are already enriched and
    // carry their own accurate "(via @swapkit/x@y)" attribution. Dedupe across
    // deps by commit hash (the same change appears in several cumulative changelogs).
    for (const bullet of bulletsInRange(changelog, ref.old, ref.new)) {
      const key = dedupeKey(bullet);
      if (seen.has(key)) continue;
      seen.add(key);
      enriched.push(`  - ${bullet.replace(/^- /, "")}`);
    }
  }
  if (enriched.length === 0) continue;

  const kept = enriched.slice(0, MAX_BULLETS);
  const overflow = enriched.length - kept.length;
  if (overflow > 0) kept.push(`  - …and ${overflow} more dependency change${overflow > 1 ? "s" : ""}`);

  // Replace the contiguous marker block with the enriched bullets, keeping the
  // intro line (the bullet above the first marker) intact.
  const first = markerIdx[0] as number;
  const last = markerIdx[markerIdx.length - 1] as number;
  const rebuilt = [...lines.slice(0, first), ...kept, ...lines.slice(last + 1)].join("\n");

  if (DRY_RUN) {
    console.info(`\n=== ${file.split("/")[0]} @ ${current} ===\n${kept.join("\n")}`);
  } else {
    await Bun.write(path, rebuilt);
    console.info(`✅ enriched ${file.split("/")[0]}@${current} (${kept.length} change notes)`);
  }
}
