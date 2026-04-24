/**
 * Pure schema version helpers (SQLite `_metadata` row `id = '_schema'`).
 * Used by the sql.js file adapter and covered by unit tests so migrations stay safe.
 */

export function parseSchemaMetadataJson(data: string): number {
  try {
    const parsed = JSON.parse(data) as { schemaVersion?: number };
    return typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 0;
  } catch {
    return 0;
  }
}

export function buildSchemaMetadataPayload(version: number): string {
  return JSON.stringify({ id: "_schema", schemaVersion: version });
}

export type SchemaMigrationPlan =
  | { kind: "fresh"; writeVersion: number }
  | {
      kind: "upgrade";
      /** Each intermediate target, e.g. [5] or [4, 5]. */
      versionsToApply: number[];
    }
  /** DB already at or ahead of app — same behavior as legacy loop (no downgrade). */
  | { kind: "noop" };

/**
 * `currentVersion === 0` means no `_schema` row yet (new file).
 * Otherwise applies migrations for each integer step until `targetVersion`.
 */
export function planSchemaMigration(
  currentVersion: number,
  targetVersion: number,
): SchemaMigrationPlan {
  if (targetVersion < 0) {
    throw new Error("targetVersion must be non-negative");
  }
  if (currentVersion < 0) {
    throw new Error("currentVersion must be non-negative");
  }
  if (currentVersion === 0) {
    return { kind: "fresh", writeVersion: targetVersion };
  }
  if (currentVersion > targetVersion) {
    return { kind: "noop" };
  }
  const versionsToApply: number[] = [];
  let v = currentVersion;
  while (v < targetVersion) {
    v += 1;
    versionsToApply.push(v);
  }
  return { kind: "upgrade", versionsToApply };
}
