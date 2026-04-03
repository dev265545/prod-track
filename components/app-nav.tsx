"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { logout } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <nav className="nav mb-8 flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/"
          className="nav-brand mr-3 text-lg font-bold no-underline hover:opacity-90 text-foreground"
        >
          ProdTrack Lite
        </Link>
        <Link
          href="/"
          className={cn(
            "nav-link",
            pathname === "/"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          Dashboard
        </Link>
        <Link
          href="/items"
          className={cn(
            "nav-link",
            pathname === "/items"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          Items
        </Link>
        <Link
          href="/shifts"
          className={cn(
            "nav-link",
            pathname === "/shifts"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          Shifts
        </Link>
        <Link
          href="/reports"
          className={cn(
            "nav-link",
            pathname === "/reports"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          Production report
        </Link>
        <Link
          href="/employees"
          className={cn(
            "nav-link",
            pathname === "/employees"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          Employees
        </Link>
        <Link
          href="/settings"
          className={cn(
            "nav-link",
            pathname === "/settings"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground",
          )}
        >
          Settings & data
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
        >
          Logout
        </button>
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle dark mode"
          aria-label="Toggle dark mode"
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          suppressHydrationWarning
        >
          {mounted ? (theme === "dark" ? "☀️" : "🌙") : "🌙"}
        </button>
      </div>
    </nav>
  );
}
