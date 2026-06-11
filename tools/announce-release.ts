// tools/announce-release.ts
//
// Posts a release announcement to a Discord channel after packages are actually
// published to npm. Driven by the changesets action's `publishedPackages` output
// (only set when a real publish happened), so it never fires on a "Version
// Packages" PR or a failed publish.
//
// For each published package it slices that version's section from the package's
// CHANGELOG.md, aggregates + dedupes the notes (shared changelog helpers), and
// sends one embed listing the changes and the package@versions.
//
// Env:
//   DISCORD_RELEASE_WEBHOOK  Discord channel webhook URL (no-op if unset)
//   PUBLISHED_PACKAGES       JSON [{ name, version }] from changesets action
//   RUN_URL                  link back to the GitHub Actions run (optional)
//   RELEASE_LABEL            embed title label   (default: "SwapKit Wallets")
//   EMBED_COLOR              embed color int      (default: blurple)

import { Glob } from "bun";
import { bulletsInRange, dedupeKey, stripViaSuffix } from "./changelog";

const WEBHOOK = process.env.DISCORD_RELEASE_WEBHOOK;
const PUBLISHED = process.env.PUBLISHED_PACKAGES || "[]";
const RUN_URL = process.env.RUN_URL || "";
const RELEASE_LABEL = process.env.RELEASE_LABEL || "SwapKit Wallets";
const EMBED_COLOR = Number(process.env.EMBED_COLOR || 0x5865f2);
const DRY_RUN = process.argv.includes("--dry-run");

const DESC_LIMIT = 4000; // Discord embed description hard limit is 4096; leave headroom
const FIELD_LIMIT = 1000; // Discord embed field value hard limit is 1024

type Pkg = { name: string; version: string };

let published: Pkg[];
try {
  published = JSON.parse(PUBLISHED).filter((p: Pkg) => p?.name && p?.version);
} catch {
  console.error("PUBLISHED_PACKAGES is not valid JSON — skipping announce.");
  process.exit(0);
}

if (published.length === 0) {
  console.info("No published packages — nothing to announce.");
  process.exit(0);
}

// Map workspace package name -> its CHANGELOG.md path.
const changelogByName = new Map<string, string>();
for await (const f of new Glob("packages/*/package.json").scan(".")) {
  const { name } = (await Bun.file(f).json()) as { name?: string };
  if (name) changelogByName.set(name, f.replace(/package\.json$/, "CHANGELOG.md"));
}

// Aggregate + dedupe the released version's notes across all published packages.
const seen = new Set<string>();
const notes: string[] = [];
for (const { name, version } of published) {
  const path = changelogByName.get(name);
  if (!path) continue;
  const file = Bun.file(path);
  if (!(await file.exists())) continue;
  const changelog = await file.text();
  for (const bullet of bulletsInRange(changelog, "", version, { includeNested: true })) {
    const nested = /^\s/.test(bullet);
    const key = dedupeKey(bullet);
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(formatNote(stripViaSuffix(bullet.trim()), nested));
  }
}

// Turn a changeset-github bullet into a compact Discord line: message first,
// PR link trailing, dropping the commit hash and "Thanks @user!". Nested bullets
// (the enriched underlying dep changes) are indented under their parent note —
// non-breaking spaces so Discord doesn't collapse the indent.
function formatNote(bullet: string, nested = false): string {
  const m = bullet.match(/^-\s*(\[#\d+\]\([^)]+\))?\s*(?:\[`[0-9a-f]+`\]\([^)]+\))?\s*(?:Thanks[^!]*!)?\s*-?\s*(.*)$/s);
  const pr = m?.[1];
  const msg = (m?.[2] || bullet.replace(/^-\s*/, "")).trim().replace(/\s+/g, " ");
  return `${nested ? "   ↳ " : "• "}${msg}${pr ? ` (${pr})` : ""}`;
}

// Build the description, truncating to Discord's limit with an overflow link.
function buildDescription(): string {
  if (notes.length === 0) return "_No notable changes recorded._";
  const kept: string[] = [];
  let len = 0;
  for (let i = 0; i < notes.length; i++) {
    const line = notes[i];
    if (len + line.length + 1 > DESC_LIMIT) {
      const more = notes.length - i;
      kept.push(RUN_URL ? `…and ${more} more — [release run](${RUN_URL})` : `…and ${more} more`);
      break;
    }
    kept.push(line);
    len += line.length + 1;
  }
  return kept.join("\n");
}

function buildPackageField(): string {
  const lines = published.map((p) => `\`${p.name}@${p.version}\``);
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    if (out.length + lines[i].length + 1 > FIELD_LIMIT) {
      return `${out}…and ${lines.length - i} more`;
    }
    out += `${lines[i]}\n`;
  }
  return out.trim();
}

const embed = {
  author: { name: RELEASE_LABEL },
  color: EMBED_COLOR,
  description: buildDescription(),
  fields: [{ name: `Packages (${published.length})`, value: buildPackageField() }],
  title: `📦 ${RELEASE_LABEL} — Release`,
  ...(RUN_URL ? { url: RUN_URL } : {}),
};

const payload = { embeds: [embed], username: "SwapKit Releases" };

if (DRY_RUN || !WEBHOOK) {
  if (!WEBHOOK && !DRY_RUN) console.info("DISCORD_RELEASE_WEBHOOK unset — skipping Discord post.");
  console.info(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const res = await fetch(WEBHOOK, {
  body: JSON.stringify(payload),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});

if (!res.ok) {
  console.error(`Discord webhook failed: ${res.status} ${await res.text().catch(() => "")}`);
  process.exit(1);
}
console.info(`📣 announced ${published.length} packages, ${notes.length} change notes to Discord.`);
