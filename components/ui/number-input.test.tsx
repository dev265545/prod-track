import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumberInput } from "@/components/ui/number-input";

/**
 * `NumberInput` exists because of four field reports against `type="number"`:
 * letters got through, invalid content read back as `""`, the wheel changed the
 * value under the operator's cursor, and Chrome autofilled the machine username
 * into "How many". Each of those is one test here, asserted against the real
 * rendered input rather than against `sanitizeNumericInput` — the unit tests for
 * the filter already pass; what was never checked is that the component wires
 * the filter to the DOM.
 */

/** The component is controlled, so a test host has to hold the state. */
function Host({
  initial = "",
  decimal = false,
  onValue,
}: {
  initial?: string;
  decimal?: boolean;
  onValue?: (value: string) => void;
}) {
  const [value, setValue] = React.useState(initial);
  return (
    <label>
      How many
      <NumberInput
        decimal={decimal}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onValue?.(event.target.value);
        }}
      />
    </label>
  );
}

describe("NumberInput", () => {
  it("drops letters as they are typed and never reports them to the caller", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);

    const field = screen.getByRole("textbox", { name: "How many" });
    await user.type(field, "12a3e-4");

    expect(field).toHaveValue("1234");
    // The caller must never see a raw keystroke: every value handed to onChange
    // is already filtered, which is what stops a dirty string reaching state.
    for (const call of onValue.mock.calls) {
      expect(call[0]).toMatch(/^[0-9]*$/);
    }
  });

  it("keeps mid-entry decimals when decimal is set", async () => {
    const user = userEvent.setup();
    render(<Host decimal />);

    const field = screen.getByRole("textbox", { name: "How many" });
    await user.type(field, "1.5");
    expect(field).toHaveValue("1.5");
  });

  it("sanitises a value that ARRIVES with letters (autofill / programmatic set)", async () => {
    // The path a keystroke test cannot reach: Chrome writing into the node
    // directly, then firing input. The component's defensive read must correct
    // the DOM, not just the React state.
    render(<Host />);
    const field = screen.getByRole("textbox", {
      name: "How many",
    }) as HTMLInputElement;

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(field, "dev123");
    field.dispatchEvent(new Event("input", { bubbles: true }));

    expect(field).toHaveValue("123");
  });

  it("sanitises a dirty controlled value supplied by the caller", () => {
    // An old record, or a caller that has not been through the filter yet.
    render(<Host initial="12abc" />);
    expect(screen.getByRole("textbox", { name: "How many" })).toHaveValue("12");
  });

  it("does not change value on a scroll wheel over a focused field", async () => {
    const user = userEvent.setup();
    render(<Host initial="10" />);

    const field = screen.getByRole("textbox", { name: "How many" });
    await user.click(field);
    expect(field).toHaveFocus();

    field.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true }),
    );
    field.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }),
    );

    expect(field).toHaveValue("10");
  });

  it("is not a number input, so the browser's own spinner behaviour is gone", () => {
    render(<Host />);
    // Asserted structurally because the wheel/letter behaviours above are
    // browser-implemented and jsdom cannot reproduce them: the guarantee is
    // that the element is never `type="number"` in the first place.
    expect(screen.getByRole("textbox", { name: "How many" })).toHaveAttribute(
      "type",
      "text",
    );
  });
});
