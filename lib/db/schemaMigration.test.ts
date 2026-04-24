import { describe, expect, it } from "vitest";
import {
  buildSchemaMetadataPayload,
  parseSchemaMetadataJson,
  planSchemaMigration,
} from "./schemaMigration";

describe("parseSchemaMetadataJson", () => {
  it("reads valid schemaVersion", () => {
    expect(parseSchemaMetadataJson('{"id":"_schema","schemaVersion":4}')).toBe(
      4,
    );
  });

  it("returns 0 when schemaVersion missing or not a number", () => {
    expect(parseSchemaMetadataJson('{"id":"_schema"}')).toBe(0);
    expect(parseSchemaMetadataJson('{"schemaVersion":"5"}')).toBe(0);
  });

  it("returns 0 on invalid JSON", () => {
    expect(parseSchemaMetadataJson("not json")).toBe(0);
  });
});

describe("buildSchemaMetadataPayload", () => {
  it("round-trips with parseSchemaMetadataJson", () => {
    const v = 5;
    const payload = buildSchemaMetadataPayload(v);
    expect(JSON.parse(payload)).toMatchObject({
      id: "_schema",
      schemaVersion: v,
    });
    expect(parseSchemaMetadataJson(payload)).toBe(v);
  });
});

describe("planSchemaMigration", () => {
  it("treats version 0 as fresh file and stamps target", () => {
    expect(planSchemaMigration(0, 5)).toEqual({
      kind: "fresh",
      writeVersion: 5,
    });
  });

  it("applies single step when one behind", () => {
    expect(planSchemaMigration(4, 5)).toEqual({
      kind: "upgrade",
      versionsToApply: [5],
    });
  });

  it("applies every integer step when several behind", () => {
    expect(planSchemaMigration(2, 5)).toEqual({
      kind: "upgrade",
      versionsToApply: [3, 4, 5],
    });
  });

  it("no upgrade when already at target", () => {
    expect(planSchemaMigration(5, 5)).toEqual({
      kind: "upgrade",
      versionsToApply: [],
    });
  });

  it("no-op when database is newer than app (no downgrade)", () => {
    expect(planSchemaMigration(6, 5)).toEqual({ kind: "noop" });
  });

  it("rejects negative inputs", () => {
    expect(() => planSchemaMigration(-1, 5)).toThrow();
    expect(() => planSchemaMigration(0, -1)).toThrow();
  });
});
