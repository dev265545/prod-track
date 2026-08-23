import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/components/language-provider";
import { OperatorSettingsCard } from "@/components/employee/operator-settings-card";
import type { Row } from "@/lib/utils/employeeDetail";

/**
 * The defect these tests exist for: opening a worker's page wrote 26 and 1.2
 * onto the worker. Nobody typed anything, nothing on screen said a number had
 * been stored, and from then on that worker's Sunday category could never give
 * them extra Sunday pay — a number on the worker beats the category's rule.
 *
 * So the assertions are about what is *saved*, not about what is displayed.
 */

/** A host that keeps the two values, the way the employee page does. */
function Host({
  initialRequired,
  initialMultiplier,
  onSave,
}: {
  initialRequired?: number;
  initialMultiplier?: number;
  onSave: (patch: Row) => void;
}) {
  const [row, setRow] = React.useState<Row>({
    requiredPresentDays: initialRequired,
    sundayMultiplier: initialMultiplier,
  });
  const apply = (patch: Row) => {
    setRow((prev) => {
      const next = { ...prev, ...patch };
      for (const key of Object.keys(patch)) {
        if (patch[key] === undefined) delete next[key];
      }
      return next;
    });
  };
  return (
    <LanguageProvider>
      <OperatorSettingsCard
        requiredPresentDays={row.requiredPresentDays as number | undefined}
        sundayMultiplier={row.sundayMultiplier as number | undefined}
        fallbackRequiredPresentDays={22}
        fallbackSundayMultiplier={1.5}
        onDraft={apply}
        onSave={(patch) => {
          apply(patch);
          onSave(patch);
        }}
      />
    </LanguageProvider>
  );
}

describe("OperatorSettingsCard", () => {
  it("saves nothing when the page is merely opened", () => {
    const onSave = vi.fn();
    render(<Host onSave={onSave} />);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves nothing when a worker with no numbers of their own is tabbed through", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Host onSave={onSave} />);

    const days = screen.getByLabelText("Required present days");
    const times = screen.getByLabelText("Sunday multiplier");
    await user.click(days);
    await user.tab();
    await user.click(times);
    await user.tab();

    // Blur used to be enough to write 26 and 1.2 onto the worker for good.
    // A save may still fire; what it must never carry is a number.
    for (const [patch] of onSave.mock.calls) {
      for (const value of Object.values(patch as Row)) {
        expect(value).toBeUndefined();
      }
    }
  });

  it("shows the number that applies as a hint, not as this worker's own value", () => {
    render(<Host onSave={vi.fn()} />);

    const days = screen.getByLabelText("Required present days");
    const times = screen.getByLabelText("Sunday multiplier");
    expect(days).toHaveValue("");
    expect(times).toHaveValue("");
    expect(days).toHaveAttribute("placeholder", "22");
    expect(times).toHaveAttribute("placeholder", "1.5");
  });

  it("saves a number the owner actually types", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Host onSave={onSave} />);

    await user.type(screen.getByLabelText("Required present days"), "24");
    await user.tab();

    expect(onSave).toHaveBeenCalledWith({ requiredPresentDays: 24 });
  });

  it("gives a worker back to the rule when their number is cleared", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Host initialRequired={24} initialMultiplier={2} onSave={onSave} />);

    await user.clear(screen.getByLabelText("Required present days"));
    await user.tab();

    expect(onSave).toHaveBeenCalledWith({ requiredPresentDays: undefined });
    expect(screen.getByLabelText("Required present days")).toHaveValue("");
  });

  it("offers a clear button only while the worker has a number of their own", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Host initialRequired={24} onSave={onSave} />);

    const clear = screen.getByRole("button", {
      name: /Clear — Required present days/,
    });
    // The multiplier is unset, so it has nothing to clear.
    expect(
      screen.queryByRole("button", { name: /Clear — Sunday multiplier/ }),
    ).toBeNull();

    await user.click(clear);

    expect(onSave).toHaveBeenCalledWith({ requiredPresentDays: undefined });
    expect(
      screen.queryByRole("button", { name: /Clear — Required present days/ }),
    ).toBeNull();
  });
});
