// tools/build-widget-artifact.ts
//
// Packages the built widget (packages/ui/dist/widget/) into a versioned,
// checksummed artifact plus a manifest.json — the contract the private devops
// deploy pipeline consumes. Run AFTER `bun --cwd packages/ui run build:widget`.
//
// Produces, under packages/ui/dist/:
//   widget-<version>.tgz      the widget bundle + host page (index.html)
//   widget-manifest.json      metadata + sha256, fail-closed schema_version
//
// The manifest is deliberately verbose: the consumer verifies schema_version +
// sha256 before deploying, and can prove exactly which commit/version is live.
//
// Env (all optional; sensible local fallbacks so it runs outside CI):
//   CHANNEL             nightly | latest        (default: derived, else "nightly")
//   GIT_SHA             commit sha              (default: GITHUB_SHA)
//   GIT_REF             ref/tag                 (default: GITHUB_REF)
//   GITHUB_RELEASE_ID   release id once cut     (default: "")
//   ARTIFACT_URL        asset URL once uploaded (default: "")
//   CREATED_AT          ISO timestamp           (default: now)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { $, CryptoHasher } from "bun";

const ROOT = resolve(import.meta.dirname, "..");
const UI = resolve(ROOT, "packages/ui");
const DIST = resolve(UI, "dist");
const WIDGET_DIR = resolve(DIST, "widget");

const uiPkg = JSON.parse(readFileSync(resolve(UI, "package.json"), "utf-8"));
const version: string = uiPkg.version;

const CHANNEL = (process.env.CHANNEL || "nightly").trim();
if (CHANNEL !== "nightly" && CHANNEL !== "latest") {
  throw new Error(`CHANNEL must be "nightly" or "latest", got "${CHANNEL}"`);
}
const environment = CHANNEL === "latest" ? "prod" : "dev";

// Fail closed if the build output isn't there.
const entry = Bun.file(resolve(WIDGET_DIR, "swapkit-widget.js"));
const host = Bun.file(resolve(WIDGET_DIR, "index.html"));
if (!(await entry.exists())) throw new Error("missing dist/widget/swapkit-widget.js — run build:widget first");
if (!(await host.exists())) throw new Error("missing dist/widget/index.html — host page not emitted");

// Package the widget dir into a deterministic-ish tarball.
const tgzName = `widget-${version}.tgz`;
const tgzPath = resolve(DIST, tgzName);
await $`tar -czf ${tgzPath} -C ${DIST} widget`.quiet();

// sha256 over the tarball bytes.
const bytes = await Bun.file(tgzPath).arrayBuffer();
const sha256 = new CryptoHasher("sha256").update(bytes).digest("hex");

const manifest = {
  artifact: { bytes: bytes.byteLength, file: tgzName, sha256, url: process.env.ARTIFACT_URL || "" },
  build_command: "bun --cwd packages/ui run build:widget",
  channel: CHANNEL,
  created_at: process.env.CREATED_AT || new Date().toISOString(),
  environment, // dev | prod
  git_ref: process.env.GIT_REF || process.env.GITHUB_REF || "",
  git_sha: process.env.GIT_SHA || process.env.GITHUB_SHA || "",
  github_release_id: process.env.GITHUB_RELEASE_ID || "",
  host_entrypoint: "index.html",
  npm_dist_tag: CHANNEL, // nightly | latest map 1:1 to dist-tags
  package: "@swapkit/ui",
  schema_version: 1,
  studio_context_path: "playgrounds/vite-lite",
  toolchain: { bun: Bun.version, packageManager: uiPkg.packageManager || `bun@${Bun.version}` },
  version,
  widget_entrypoints: ["swapkit-widget.js"],
};

const manifestPath = resolve(DIST, "widget-manifest.json");
await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`✅ widget artifact: ${tgzName} (${(bytes.byteLength / 1e6).toFixed(1)} MB)`);
console.log(`   sha256: ${sha256}`);
console.log(`   channel: ${CHANNEL} → ${environment}`);
console.log(`   manifest: ${manifestPath}`);
