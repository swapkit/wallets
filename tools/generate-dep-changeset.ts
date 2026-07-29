// tools/generate-dep-changeset.ts
//
// Emits a SIMPLE, deterministic changeset when external @swapkit/* dependency
// versions change vs a base ref. It diffs the versions and records each bumped
// dep as an `old → new` marker — it does NOT read any changelog here.
//
// The real underlying changes are inlined later, at release time, by
// tools/enrich-dep-changelogs.ts (run from `version-bump`, after
// `changeset version`), which reads the bumped deps' changelogs from the
// installed packages. Keeping this step changelog-free makes it deterministic
// (no node_modules dependency, no network) so the enforce-dep-changeset CI check
// can regenerate-and-compare reliably.
//
// Bump-path-agnostic: works for the dispatch auto-update, the scheduled update,
// and a human manually editing package.json.
//
// Env:
//   BASE_REF  git ref to diff dep versions against (default: origin/develop)

import { $, Glob } from "bun";

const DRY_RUN = process.argv.includes("--dry-run");
const BASE_REF = process.env.BASE_REF || "origin/develop";

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"] as const;
type Json = { name?: string } & Partial<Record<(typeof DEP_FIELDS)[number], Record<string, string>>>;

const stripRange = (v: string) => v.replace(/^[^\d]*/, ""); // ^4.4.35 -> 4.4.35

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

// 2. Which of THIS repo's packages depend on a changed dep → patch bump.
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

// 3. Build the changeset: one `old → new` marker per bumped dep. The release-time
//    enricher (tools/enrich-dep-changelogs.ts) parses these markers and replaces
//    them with the real underlying changes. Deterministic filename from the bumps.
const sorted = [...changed].sort(([a], [b]) => a.localeCompare(b));
const id = `swapkit-sdk-${Bun.hash(sorted.map(([n, v]) => `${n}@${v.new}`).join(",")).toString(36)}`;
const frontmatter = [...bumps]
  .sort()
  .map((n) => `"${n}": patch`)
  .join("\n");
const markers = sorted.map(([n, v]) => `- ${n}: ${v.old ? `${v.old} → ${v.new}` : v.new}`);
const body = ["Update SwapKit SDK dependencies:", "", ...markers].join("\n");
const content = `---\n${frontmatter}\n---\n\n${body}\n`;

if (DRY_RUN) {
  console.info(`# .changeset/${id}.md\n\n${content}`);
} else {
  await Bun.write(`.changeset/${id}.md`, content);
  console.info(`📝 wrote .changeset/${id}.md (${bumps.size} packages, ${changed.size} deps)`);
}
