import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The bug: a dialog taller than a short viewport centred itself, so its top
 * (and its heading, and often its confirm button) went off-screen with no
 * scrollbar to reach it — "cannot use the app" on a phone in landscape and on a
 * 1280x600 laptop.
 *
 * The fix is CSS, and jsdom does not do layout, so this asserts the two halves
 * of the contract that CAN be checked: the custom property exists with a
 * viewport-relative value and a `dvh` upgrade, and every dialog surface is
 * capped by it and scrolls inside itself. A regression is nearly always the
 * deletion of one of those, which this catches.
 */

const root = resolve(__dirname, "../..");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");

describe("dialog height cap", () => {
  it("defines --dialog-max-h against the viewport, with a dvh upgrade", () => {
    expect(css).toMatch(/--dialog-max-h:\s*calc\(100vh - 2rem\)/);
    // `dvh` is the one that survives a mobile URL bar; `vh` stays as the
    // fallback for the Chrome 109 target, so both must be present.
    expect(css).toMatch(/@supports \(height: 100dvh\)/);
    expect(css).toMatch(/--dialog-max-h:\s*calc\(100dvh - 2rem\)/);
  });

  it("caps the dialog and scrolls inside it rather than clipping off-screen", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open the long form</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A very long form</DialogTitle>
            <DialogDescription>Many fields.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    await user.click(screen.getByRole("button", { name: "Open the long form" }));

    const dialog = screen.getByRole("dialog", { name: "A very long form" });
    const classes = dialog.className;
    expect(classes).toContain("max-h-[var(--dialog-max-h)]");
    expect(classes).toContain("overflow-y-auto");
    // Without this a scroll that runs past the end of the dialog scrolls the
    // page behind it instead, which on a phone loses the dialog entirely.
    expect(classes).toContain("overscroll-contain");
  });

  it("keeps the title reachable as the dialog's accessible name", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust this month</DialogTitle>
            <DialogDescription>What changed.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole("button", { name: "Open" }));

    // The heading is the first thing clipped when the cap is missing, so
    // naming the dialog by it is what makes the failure detectable at all.
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Adjust this month",
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });
});
