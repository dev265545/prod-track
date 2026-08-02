import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, put, remove } = vi.hoisted(() => ({
  get: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  put: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db/adapter", () => ({ get, put, remove }));

import {
  APP_SETTINGS_ID,
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  mergeAppSettings,
  normalizeAppSettings,
  resetAppSettings,
  saveAppSettings,
} from "../appSettingsService";

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(null);
  put.mockClear();
  remove.mockClear();
});

describe("getAppSettings", () => {
  it("returns defaults when no row was ever written", async () => {
    // Every install that predates the settings page is in this state, so the
    // defaults must reproduce today's behaviour exactly.
    await expect(getAppSettings()).resolves.toEqual(DEFAULT_APP_SETTINGS);
    expect(DEFAULT_APP_SETTINGS.productionInventoryLinkEnabled).toBe(true);
  });

  it("returns defaults when the store read throws", async () => {
    get.mockRejectedValueOnce(new Error("db closed"));
    await expect(getAppSettings()).resolves.toEqual(DEFAULT_APP_SETTINGS);
  });

  it("fills the gaps in a half-written row", async () => {
    get.mockResolvedValueOnce({
      id: APP_SETTINGS_ID,
      productionInventoryLinkEnabled: false,
    });
    const settings = await getAppSettings();
    expect(settings.productionInventoryLinkEnabled).toBe(false);
    expect(settings.inventoryBomDeductionsEnabled).toBe(true);
    expect(settings.stickerMultiplier).toBe(2);
  });
});

describe("normalizeAppSettings", () => {
  it("replaces corrupt values with safe defaults", () => {
    const settings = normalizeAppSettings({
      productionEnabled: "yes",
      defaultShift: "evening",
      weekStartsOn: 5,
      stickerMultiplier: 999,
      companyName: 42,
    });
    expect(settings.productionEnabled).toBe(true);
    expect(settings.defaultShift).toBe("day");
    expect(settings.weekStartsOn).toBe(1);
    expect(settings.stickerMultiplier).toBe(2);
    expect(settings.companyName).toBe("");
  });

  it("accepts anything at all without throwing", () => {
    expect(normalizeAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings("nonsense")).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings(7)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("keeps a valid stored value", () => {
    expect(
      normalizeAppSettings({ defaultShift: "night", weekStartsOn: 0, stickerMultiplier: 0 }),
    ).toMatchObject({ defaultShift: "night", weekStartsOn: 0, stickerMultiplier: 0 });
  });
});

describe("mergeAppSettings", () => {
  it("changes only the patched field", () => {
    const next = mergeAppSettings(DEFAULT_APP_SETTINGS, {
      productionInventoryLinkEnabled: false,
    });
    expect(next.productionInventoryLinkEnabled).toBe(false);
    expect(next.lowStockWarningsEnabled).toBe(true);
  });

  it("ignores an unknown key", () => {
    const next = mergeAppSettings(DEFAULT_APP_SETTINGS, {
      somethingElse: true,
    } as unknown as Parameters<typeof mergeAppSettings>[1]);
    expect(next).toEqual(DEFAULT_APP_SETTINGS);
  });
});

describe("saveAppSettings", () => {
  it("round-trips a change through the store", async () => {
    const saved = await saveAppSettings({ productionInventoryLinkEnabled: false });
    expect(saved.productionInventoryLinkEnabled).toBe(false);
    const [, written] = put.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(written.id).toBe(APP_SETTINGS_ID);
    expect(written.productionInventoryLinkEnabled).toBe(false);

    get.mockResolvedValueOnce(written);
    await expect(getAppSettings()).resolves.toEqual(saved);
  });

  it("normalizes before writing so invalid values never reach disk", async () => {
    const saved = await saveAppSettings({
      stickerMultiplier: -4,
    } as Partial<typeof DEFAULT_APP_SETTINGS>);
    expect(saved.stickerMultiplier).toBe(2);
  });
});

describe("resetAppSettings", () => {
  it("deletes the row and returns defaults", async () => {
    await expect(resetAppSettings()).resolves.toEqual(DEFAULT_APP_SETTINGS);
    expect(remove).toHaveBeenCalledWith("_metadata", APP_SETTINGS_ID);
  });

  it("still returns defaults when there is nothing to delete", async () => {
    remove.mockRejectedValueOnce(new Error("missing"));
    await expect(resetAppSettings()).resolves.toEqual(DEFAULT_APP_SETTINGS);
  });
});
