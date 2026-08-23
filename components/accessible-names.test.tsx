import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/components/language-provider";

/**
 * The accessibility pass this session fixed a dozen screens by reading source.
 * Nothing machine-checked that the roles and names it added actually reach the
 * accessibility tree — which is the only place they matter. This file is that
 * check, for the four shapes that were fixed blind.
 *
 * Every query below is by role and accessible NAME. A rename that drops an
 * `aria-label`, or an icon-only control that loses its text, fails here.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/attendance",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SegmentedControl } from "@/components/inventory/category/segmented-control";
import { NeedsStockTable } from "@/components/inventory/hub/needs-stock-table";
import { HomeProductionTrendCard } from "@/components/home/home-production-trend";

function withApp(ui: React.ReactNode) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe("sidebar rail", () => {
  it("names every navigation link independently of its visible label", () => {
    withApp(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    // Collapsed, the <span> label is `display:none` and only the icon remains.
    // The names below come from `aria-label`, which overrides element content
    // in the name calculation — so the same assertion holds in BOTH states, and
    // that equivalence is exactly the property the icon rail depends on.
    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    for (const label of ["Attendance", "Production", "Inventory"]) {
      expect(
        screen.getAllByRole("link", { name: label }).length,
      ).toBeGreaterThan(0);
    }

    // `useIsAdmin` is false before hydration answers, and the admin-only
    // sections must not render even for that first frame — a worker briefly
    // seeing the Salary menu was the reason it reads localStorage this way.
    expect(screen.queryByRole("link", { name: "Salary" })).toBeNull();

    // No unnamed links: an unnamed one in the rail is a bare icon to a screen
    // reader, which is the bug that was fixed here.
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAccessibleName();
    }
  });

  it("marks exactly one item as the current page", () => {
    withApp(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>,
    );

    const current = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
  });
});

describe("segmented control", () => {
  it("exposes the selection as aria-pressed, not as colour", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Host() {
      const [value, setValue] = React.useState("all");
      return (
        <SegmentedControl
          label="Show stock level"
          value={value}
          options={[
            { value: "all", label: "All" },
            { value: "low", label: "Running low" },
          ]}
          onChange={(next) => {
            setValue(next);
            onChange(next);
          }}
        />
      );
    }
    withApp(<Host />);

    const group = within(screen.getByRole("group", { name: "Show stock level" }));
    expect(group.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(group.getByRole("button", { name: "Running low" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(group.getByRole("button", { name: "Running low" }));

    expect(onChange).toHaveBeenCalledWith("low");
    expect(group.getByRole("button", { name: "Running low" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(group.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("data table semantics", () => {
  it("has a named table, column headers, and the item name as the row header", () => {
    withApp(
      <NeedsStockTable
        rows={[
          {
            id: "x1",
            name: "Round Tin",
            code: "RT04",
            category: "finished",
            unit: "pcs",
            lowStockThreshold: 20,
            currentStock: 4,
            isLow: true,
          } as never,
        ]}
        onAddStock={vi.fn()}
        onTakeOut={vi.fn()}
      />,
    );

    const table = screen.getByRole("table", { name: "Items that need stock" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Item",
      "Kind",
      "Stock now",
      "What to do",
    ]);

    // `<th scope="row">` is what lets a screen reader say "Round Tin, Stock, 4"
    // instead of reading a bare number. It is invisible in a screenshot and in
    // a type check, so it is exactly the kind of thing that regresses.
    const rowHeader = within(table).getByRole("rowheader");
    expect(rowHeader).toHaveTextContent("Round Tin");
  });
});

describe("chart", () => {
  it("is an img with a name that carries the whole answer, plus a text list", () => {
    const points = [
      { date: "2026-03-10", total: 40 },
      { date: "2026-03-11", total: 55 },
      { date: "2026-03-12", total: 70 },
    ];
    withApp(
      <HomeProductionTrendCard
        trend={
          {
            points,
            total: 165,
            max: 70,
            bestIndex: 2,
            latestTotal: 70,
            priorTotal: 55,
            direction: "up",
            hasData: true,
          } as never
        }
      />,
    );

    // `role="img"` prunes its subtree, so the label has to say everything the
    // line says — an empty or generic name here means the chart is a blank to
    // anyone not looking at it.
    const chart = screen.getByRole("img");
    expect(chart).toHaveAccessibleName(/70 made on the last day/);
    expect(chart).toHaveAccessibleName(/More than the day before/);

    // …and the per-day figures stay reachable without a pointer.
    expect(screen.getByText("The same figures, day by day")).toBeInTheDocument();
  });
});
