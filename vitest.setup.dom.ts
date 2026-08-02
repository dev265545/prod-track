import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * Setup for the `dom` project only — the node suite never loads this file.
 *
 * jsdom (not happy-dom) on purpose: every component worth rendering here goes
 * through Radix, which leans on focus management, `inert`/`aria-hidden` sibling
 * trapping, portals and pointer-capture. jsdom implements those closely enough
 * that a passing test means something about a real browser; happy-dom is faster
 * but its focus and event model diverge exactly where Radix lives, which would
 * make the accessibility assertions below untrustworthy — and untrustworthy is
 * the failure mode this whole harness exists to fix.
 */

afterEach(() => {
  cleanup();
});

// Browser APIs jsdom does not implement, which Radix and the pickers call
// unconditionally. Each is a no-op stub: nothing below asserts on them.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

Element.prototype.scrollIntoView ??= () => {};
// Radix sets these while a dialog is open.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};

// Keeps expected console noise out of the run without hiding real errors:
// only unhandled-rejection warnings React logs for deliberately-failing saves.
vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
  const first = String(args[0] ?? "");
  if (first.includes("[attendance] save failed")) return;
  globalThis.process.stderr.write(`${args.join(" ")}\n`);
});
