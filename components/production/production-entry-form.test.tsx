import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/components/language-provider";

/**
 * The one screen where a mis-tap costs money.
 *
 * Every save writes a NEW production row — there is no key an identical second
 * save would overwrite — so a double tap on "Save" is a double payment, not a
 * harmless repeat. That is the property under test here.
 */

const { saveProductionEntry, resolveSaveTarget } = vi.hoisted(() => ({
  saveProductionEntry: vi.fn(),
  resolveSaveTarget: vi.fn(async () => ({
    ok: true as const,
    legacyItemId: "item-1",
    inventoryItemId: null,
  })),
}));

vi.mock("@/lib/services/productionEntryService", () => ({ saveProductionEntry }));
vi.mock("@/lib/services/productionCatalog", () => ({ resolveSaveTarget }));

import { ProductionEntryForm } from "@/components/production/production-entry-form";

const ITEMS = [
  {
    id: "item-1",
    name: "Round Tin",
    code: "RT04",
    rate: 12,
    legacyItemId: "item-1",
    inventoryItemId: null,
  },
];

beforeEach(() => {
  saveProductionEntry.mockReset();
  resolveSaveTarget.mockClear();
});

function renderForm() {
  render(
    <LanguageProvider>
      <ProductionEntryForm
        date="2026-08-02"
        employees={[{ id: "emp-1", name: "Ram" }]}
        items={ITEMS}
        onSaved={vi.fn()}
      />
    </LanguageProvider>,
  );
}

async function fillOneLine(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText("Who made it"));
  await user.click(await screen.findByRole("option", { name: "Ram" }));
  await user.click(screen.getByLabelText("What was made"));
  await user.click(await screen.findByRole("option", { name: /Round Tin/ }));
  await user.type(screen.getByLabelText("How many"), "12");
}

describe("ProductionEntryForm", () => {
  it("writes one row for a double tap on Save", async () => {
    const user = userEvent.setup({ delay: null });
    // A save still in flight is exactly the window a second tap lands in.
    let release: (() => void) | undefined;
    saveProductionEntry.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ production: { id: "prod-1" }, inventory: null });
        }),
    );

    renderForm();
    await fillOneLine(user);

    const save = screen.getByRole("button", { name: /Save and add next/ });
    await user.click(save);
    await user.click(save);
    await user.click(save);

    expect(saveProductionEntry).toHaveBeenCalledTimes(1);
    release?.();
  }, 20000);

  it("refuses a quantity of zero instead of writing work worth nothing", async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();
    await user.click(screen.getByLabelText("Who made it"));
    await user.click(await screen.findByRole("option", { name: "Ram" }));
    await user.click(screen.getByLabelText("What was made"));
    await user.click(await screen.findByRole("option", { name: /Round Tin/ }));
    await user.type(screen.getByLabelText("How many"), "0");
    await user.click(screen.getByRole("button", { name: /Save and add next/ }));

    expect(saveProductionEntry).not.toHaveBeenCalled();
  }, 20000);
});
