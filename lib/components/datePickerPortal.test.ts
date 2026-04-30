import { describe, expect, it } from "vitest";
import { isDatePickerInteractionOutside } from "@/components/ui/date-picker";

describe("isDatePickerInteractionOutside", () => {
  it("treats clicks inside the portaled popup as inside", () => {
    const popupChild = { id: "popup-child" };
    const container = {
      contains: (target: unknown) => target === "container-child",
    };
    const popup = {
      contains: (target: unknown) => target === popupChild,
    };

    expect(
      isDatePickerInteractionOutside({
        target: popupChild as unknown as Node,
        container,
        popup,
      }),
    ).toBe(false);
  });

  it("treats clicks outside both wrapper and popup as outside", () => {
    const outside = { id: "outside" };
    const container = {
      contains: (target: unknown) => target === "container-child",
    };
    const popup = {
      contains: (target: unknown) => target === "popup-child",
    };

    expect(
      isDatePickerInteractionOutside({
        target: outside as unknown as Node,
        container,
        popup,
      }),
    ).toBe(true);
  });
});
