import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/components/language-provider";
import { ItemPicker } from "@/components/pickers/item-picker";

/**
 * The picker replaced a 200-row drop-down, and it earns that only if three
 * things hold in the rendered dialog: the short code printed on the physical
 * stock finds the item, the keyboard alone can choose one, and an item with no
 * rate is flagged BEFORE it is picked rather than at save time.
 */

const ITEMS = [
  { id: "i1", name: "Round Tin", code: "RT04", rate: 12 },
  { id: "i2", name: "Square Box", code: "S41", rate: 8 },
  { id: "i3", name: "Bucket", code: "B1", rate: null },
];

function renderPicker(onChange = vi.fn()) {
  render(
    <LanguageProvider>
      <ItemPicker items={ITEMS} value="" onChange={onChange} />
    </LanguageProvider>,
  );
  return onChange;
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Choose item/ }));
  return screen.getByRole("listbox", { name: "Which item?" });
}

describe("ItemPicker", () => {
  it("finds an item by the code printed on the stock, not just by name", async () => {
    const user = userEvent.setup();
    renderPicker();
    const list = await openPicker(user);

    await user.type(
      screen.getByRole("combobox", { name: "Search by name or code" }),
      "RT04",
    );

    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName(/Round Tin/);
  });

  it("chooses with the keyboard alone: arrows move, Enter picks", async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();
    await openPicker(user);

    const search = screen.getByRole("combobox", {
      name: "Search by name or code",
    });
    expect(search).toHaveFocus();

    // Highlight starts on the first row; one press down lands on the second.
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledExactlyOnceWith("i2");
  });

  it("wraps the highlight rather than sticking at the ends", async () => {
    const user = userEvent.setup();
    const onChange = renderPicker();
    await openPicker(user);

    // Up from the first row goes to the last, so the third item is one key away.
    await user.keyboard("{ArrowUp}{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("i3");
  });

  it("flags an unpriced item in its accessible name, before it can be chosen", async () => {
    const user = userEvent.setup();
    renderPicker();
    const list = await openPicker(user);

    const bucket = within(list).getByRole("option", { name: /Bucket/ });
    // Not colour, not an icon: the warning is in the name a screen reader
    // reads out, and it is on the row itself rather than on a later error.
    expect(bucket).toHaveAccessibleName(/No rate/);

    const priced = within(list).getByRole("option", { name: /Round Tin/ });
    expect(priced).not.toHaveAccessibleName(/No rate/);
  });

  it("announces how many items matched", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openPicker(user);

    await user.type(
      screen.getByRole("combobox", { name: "Search by name or code" }),
      "zzzz",
    );
    expect(screen.getByText("0 items found")).toBeInTheDocument();
    expect(screen.getByText("Nothing found")).toBeInTheDocument();
  });
});
