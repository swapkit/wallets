// tools/generate-dep-changeset.ts
//
// Generates a RICH changeset describing the real SwapKit SDK changes pulled in by
// an @swapkit/* dependency bump. It diffs the external @swapkit/* dep versions in
// this branch against a base ref, reads the (already-enriched) SDK CHANGELOGs for
// each bumped range, and writes one changeset listing the actual changes —
// instead of a generic "deps got bumped".
//
// Changelog source: the SDK ships CHANGELOG.md inside the published npm tarball
// (swapkit/sdk #274), so after `bun install` the installed (new) version's
// cumulative changelog is on disk and already covers the whole (old, new] range.
// We read it straight from node_modules — no token, no network. If a bumped
// version predates the in-package changelog (so it isn't on disk), that bump
// falls back to a generic "Update SwapKit SDK dependencies" line.
//
// Bump-path-agnostic: works for the dispatch auto-update, the scheduled update,
// and a human manually editing package.json. Deterministic output (no timestamps)
// so a CI check can regenerate-and-compare to enforce it. Run `bun install`
// before this script so the installed changelogs are present.
//
// Env:
//   BASE_REF       git ref to diff dep versions against     (default: origin/develop)
//   SDK_REPO_PATH  local SDK checkout — read files from disk (testing only)

import { $, Glob } from "bun";

const DRY_RUN = process.argv.includes("--dry-run");
const BASE_REF = process.env.BASE_REF || "origin/develop";
const SDK_REPO_PATH = process.env.SDK_REPO_PATH;

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"] as const;
type Json = { name?: string } & Partial<Record<(typeof DEP_FIELDS)[number], Record<string, string>>>;

const stripRange = (v: string) => v.replace(/^[^\d]*/, ""); // ^4.4.35 -> 4.4.35

function semverCmp(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10));
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (!Number.isNaN(d) && d !== 0) return Math.sign(d);
  }
  return 0;
}

// External @swapkit/* deps in a package.json (excludes this repo's own workspace packages).
function externalSwapkitDeps(json: Json, workspace: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of DEP_FIELDS) {
    for (const [k, v] of Object.entries(json[field] ?? {})) {
      if (k.startsWith("@swapkit/") && !workspace.has(k) && /\d/.test(v)) out[k] = stripRange(v);
    }
  }
  return out;
}

async function gitShow(ref: string, path: string): Promise<string | null> {
  try {
    return await $`git show ${ref}:${path}`.quiet().text();
  } catch {
    return null;
  }
}

// True if the changelog has a section for exactly this version (`## x.y.z`).
function changelogCovers(changelog: string, version: string): boolean {
  return new RegExp(`^## ${version.replace(/\./g, "\\.")}(?:\\s|$)`, "m").test(changelog);
}

// Stable identity for a changelog bullet so the same change isn't listed twice
// when it appears in both its origin package and a dependent's enriched note.
// The changeset-github format leads with a PR link and a `commit` backtick.
function dedupeKey(bullet: string): string {
  const commit = bullet.match(/\[`([0-9a-f]{7,40})`\]/)?.[1];
  if (commit) return `c:${commit}`;
  const pr = bullet.match(/\[#(\d+)\]/)?.[1];
  if (pr) return `pr:${pr}`;
  return bullet.toLowerCase().replace(/\s+/g, " ").trim();
}

async function sdkChangelog(name: string, newVersion: string): Promise<string | null> {
  const dir = name.replace("@swapkit/", "");

  // Local SDK checkout — testing only.
  if (SDK_REPO_PATH) {
    const file = Bun.file(`${SDK_REPO_PATH}/packages/${dir}/CHANGELOG.md`);
    return (await file.exists()) ? file.text() : null;
  }

  // The installed package's own changelog (no token, no network). The new
  // version's changelog is cumulative, so it covers the full (old, new] range.
  // Only trust it if it actually has the version we bumped to — otherwise
  // node_modules is stale, install didn't run, or the version predates the
  // in-package changelog; in all those cases we degrade to a generic line.
  const installed = Bun.file(`node_modules/${name}/CHANGELOG.md`);
  if (await installed.exists()) {
    const text = await installed.text();
    if (changelogCovers(text, newVersion)) return text;
  }
  return null;
}

// Real (non-"Updated dependencies") bullets of every changelog section whose
// version is in (oldVersion, newVersion]. If oldVersion is empty, take only newVersion.
function bulletsInRange(changelog: string, oldVersion: string, newVersion: string): string[] {
  const bullets: string[] = [];
  let take = false;
  let inDepBlock = false;
  for (const line of changelog.split("\n")) {
    const heading = line.match(/^## (.+)$/)?.[1]?.trim();
    if (heading) {
      if (!/^\d+\.\d+\.\d+/.test(heading)) continue; // ignore non-version ## headings
      if (semverCmp(heading, newVersion) > 0) {
        take = false; // newer than what we bumped to
      } else if (oldVersion ? semverCmp(heading, oldVersion) <= 0 : semverCmp(heading, newVersion) < 0) {
        break; // reached the old boundary (exclusive)
      } else {
        take = true;
      }
      inDepBlock = false;
      continue;
    }
    if (!take) continue;
    if (/^- Updated dependencies/.test(line)) {
      inDepBlock = true;
      continue;
    }
    if (inDepBlock && /^\s+- /.test(line)) continue; // nested dep ref
    if (/^- /.test(line)) {
      inDepBlock = false;
      bullets.push(line.trim());
    }
  }
  return bullets;
}

// --- Main ---------------------------------------------------------------------
const pkgFiles: string[] = [];
const workspace = new Set<string>();
for await (const f of new Glob("packages/*/package.json").scan(".")) {
  pkgFiles.push(f);
  const { name } = (await Bun.file(f).json()) as Json;
  if (name) workspace.add(name);
}

// 1. Which external @swapkit/* deps changed vs BASE_REF?  name -> { old, new }
const changed = new Map<string, { old: string; new: string }>();
for (const f of pkgFiles) {
  const current = externalSwapkitDeps((await Bun.file(f).json()) as Json, workspace);
  const baseText = await gitShow(BASE_REF, f);
  const base = baseText ? externalSwapkitDeps(JSON.parse(baseText) as Json, workspace) : {};
  for (const [name, newV] of Object.entries(current)) {
    const oldV = base[name] ?? "";
    if (oldV !== newV) changed.set(name, { new: newV, old: oldV });
  }
}

if (changed.size === 0) {
  console.info(`No @swapkit/* dependency version changes vs ${BASE_REF} — nothing to generate.`);
  process.exit(0);
}

// 2. Slice the SDK changelogs for each bumped range, aggregate + dedupe bullets.
const seen = new Set<string>();
const bullets: string[] = [];
for (const [name, { old, new: newV }] of [...changed].sort(([a], [b]) => a.localeCompare(b))) {
  const changelog = await sdkChangelog(name, newV);
  if (!changelog) {
    console.warn(`⚠ no in-package CHANGELOG for ${name}@${newV} — it will fall back to a generic line`);
    continue;
  }
  for (const bullet of bulletsInRange(changelog, old, newV)) {
    // The same change shows up both in its origin package's changelog and in a
    // dependent's enriched changelog (suffixed `(via @swapkit/x@y)`). Dedupe on
    // the commit hash (stable across both), then PR number, then text; and drop
    // the `(via …)` annotation so the kept line reads cleanly.
    const key = dedupeKey(bullet);
    if (seen.has(key)) continue;
    seen.add(key);
    bullets.push(bullet.replace(/\s*\(via @swapkit\/[^)]+\)\s*$/, ""));
  }
}

// 3. Which of THIS repo's packages depend on a changed dep → patch bump.
const bumps = new Set<string>();
for (const f of pkgFiles) {
  const json = (await Bun.file(f).json()) as Json;
  if (!json.name) continue;
  const deps = DEP_FIELDS.flatMap((field) => Object.keys(json[field] ?? {}));
  if (deps.some((d) => changed.has(d))) bumps.add(json.name);
}

if (bumps.size === 0) {
  console.info("No workspace packages depend on the changed deps — nothing to generate.");
  process.exit(0);
}

// 4. Build the changeset (deterministic filename from the bumped versions).
const summary = [...changed].sort(([a], [b]) => a.localeCompare(b)).map(([n, v]) => `${n}@${v.new}`);
const id = `swapkit-sdk-${Bun.hash(summary.join(",")).toString(36)}`;
const frontmatter = [...bumps]
  .sort()
  .map((n) => `"${n}": patch`)
  .join("\n");
const body =
  bullets.length > 0
    ? ["Update SwapKit SDK dependencies. Underlying changes:", "", ...bullets].join("\n")
    : `Update SwapKit SDK dependencies: ${summary.join(", ")}.`;
const content = `---\n${frontmatter}\n---\n\n${body}\n`;

if (DRY_RUN) {
  console.info(`# .changeset/${id}.md\n\n${content}`);
} else {
  await Bun.write(`.changeset/${id}.md`, content);
  console.info(`📝 wrote .changeset/${id}.md (${bumps.size} packages, ${bullets.length} change notes)`);
}
