// tools/announce-release.ts
//
// Posts a release announcement to a Discord channel after packages are actually
// published to npm. Driven by the changesets action's `publishedPackages` output
// (only set when a real publish happened), so it never fires on a "Version
// Packages" PR or a failed publish.
//
// For each published package it slices that version's section from the package's
// CHANGELOG.md (its changes since the last released version) and sends one embed
// listing every bumped package with its notes. Packages whose sections carry the
// same changes (the usual case for a dep-bump release) are grouped under one
// heading instead of repeating the notes per package.
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

// Per-package notes from the released version's changelog section, then group
// packages whose sections carry the exact same changes (keyed by the notes'
// dedupe identities) so shared dep-bump notes appear once.
const groups = new Map<string, { pkgs: Pkg[]; notes: string[] }>();
for (const pkg of published) {
  const path = changelogByName.get(pkg.name);
  const file = path ? Bun.file(path) : null;
  const changelog = file && (await file.exists()) ? await file.text() : "";

  const seen = new Set<string>();
  const notes: string[] = [];
  for (const bullet of bulletsInRange(changelog, "", pkg.version, { includeNested: true })) {
    const nested = /^\s/.test(bullet);
    const key = `${nested ? ">" : ""}${dedupeKey(bullet)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    notes.push(formatNote(stripViaSuffix(bullet.trim()), nested));
  }

  const signature = [...seen].join("|");
  const group = groups.get(signature);
  if (group) group.pkgs.push(pkg);
  else groups.set(signature, { notes, pkgs: [pkg] });
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

// Build the description: one section per group — the bumped package@versions as
// a heading, their changes underneath — truncated to Discord's limit with an
// overflow link.
function buildDescription(): string {
  const lines: string[] = [];
  for (const { pkgs, notes } of groups.values()) {
    if (lines.length > 0) lines.push("");
    lines.push(pkgs.map((p) => `**\`${p.name}@${p.version}\`**`).join(" · "));
    lines.push(...(notes.length > 0 ? notes : ["_Dependency updates only._"]));
  }
  const kept: string[] = [];
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (len + line.length + 1 > DESC_LIMIT) {
      const more = lines.length - i;
      kept.push(RUN_URL ? `…and ${more} more lines — [release run](${RUN_URL})` : `…and ${more} more lines`);
      break;
    }
    kept.push(line);
    len += line.length + 1;
  }
  return kept.join("\n") || "_No notable changes recorded._";
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

// wait=true makes Discord validate and create the message synchronously and
// return it. Without it the API acks with 204 immediately and a message that
// fails afterwards is dropped with no error at all.
const url = new URL(WEBHOOK);
url.searchParams.set("wait", "true");

const res = await fetch(url, {
  body: JSON.stringify(payload),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});

if (!res.ok) {
  console.error(`Discord webhook failed: ${res.status} ${await res.text().catch(() => "")}`);
  process.exit(1);
}
const message = (await res.json().catch(() => null)) as { id?: string } | null;
console.info(
  `📣 announced ${published.length} packages in ${groups.size} groups to Discord (message ${message?.id ?? "unknown"}).`,
);
