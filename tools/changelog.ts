// tools/changelog.ts
//
// Shared helpers for reading changeset-generated CHANGELOG.md files: comparing
// versions, slicing a version range, and identifying/cleaning individual notes.
// Used by both the dep-changeset generator and the Discord release announcer.

export function semverCmp(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10));
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (!Number.isNaN(d) && d !== 0) return Math.sign(d);
  }
  return 0;
}

// True if the changelog has a section for exactly this version (`## x.y.z`).
export function changelogCovers(changelog: string, version: string): boolean {
  return new RegExp(`^## ${version.replace(/\./g, "\\.")}(?:\\s|$)`, "m").test(changelog);
}

// Stable identity for a changelog bullet so the same change isn't listed twice
// when it appears in both its origin package and a dependent's enriched note.
// The changeset-github format leads with a PR link and a `commit` backtick.
export function dedupeKey(bullet: string): string {
  const commit = bullet.match(/\[`([0-9a-f]{7,40})`\]/)?.[1];
  if (commit) return `c:${commit}`;
  const pr = bullet.match(/\[#(\d+)\]/)?.[1];
  if (pr) return `pr:${pr}`;
  return bullet.toLowerCase().replace(/\s+/g, " ").trim();
}

// Drop the `(via @swapkit/x@y)` annotation enrichment appends to a bullet.
export function stripViaSuffix(bullet: string): string {
  return bullet.replace(/\s*\(via @swapkit\/[^)]+\)\s*$/, "");
}

// Real (non-"Updated dependencies") bullets of every changelog section whose
// version is in (oldVersion, newVersion]. If oldVersion is empty, take only newVersion.
// With includeNested, sub-bullets of a real bullet (how enrich-dep-changelogs inlines
// the underlying dep changes) are returned too, keeping a two-space indent marker so
// callers can tell parent from child.
export function bulletsInRange(
  changelog: string,
  oldVersion: string,
  newVersion: string,
  { includeNested = false } = {},
): string[] {
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
    if (/^\s+- /.test(line)) {
      if (includeNested && !inDepBlock && bullets.length > 0) {
        bullets.push(`  ${line.trim()}`);
      }
      continue;
    }
    if (/^- /.test(line)) {
      inDepBlock = false;
      bullets.push(line.trim());
    }
  }
  return bullets;
}
