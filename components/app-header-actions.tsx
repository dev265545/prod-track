"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { logout } from "@/lib/auth";
import { useCurrentRole, useHydrated } from "@/lib/hooks/useClientValue";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AppHeaderActions({ showLogout = true }: { showLogout?: boolean }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { locale, toggleLocale, t, mounted: langMounted } = useLanguage();
  // Both used to be state filled in by an effect, costing an extra render on
  // every page and leaving one frame in which the role badge was absent and
  // the theme icon was wrong. Read as external stores instead — see
  // `lib/hooks/useClientValue.ts`.
  const mounted = useHydrated();
  const role = useCurrentRole();

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const themeTooltip =
    !mounted
      ? t("themeToggle")
      : theme === "dark"
        ? t("themeLightMode")
        : t("themeDarkMode");

  const langTooltip =
    !langMounted
      ? t("languageToggle")
      : locale === "en"
        ? t("languageUseHindi")
        : t("languageUseEnglish");

  return (
    <div className="flex items-center gap-1.5">
      {mounted && role ? (
        <span
          className={
            "rounded-full px-2.5 py-1 text-xs font-semibold leading-none " +
            (role === "admin"
              ? "border border-primary bg-surface-2 text-primary"
              : "bg-muted text-muted-foreground")
          }
        >
          {role === "admin" ? t("roleBadgeAdmin") : t("roleBadgeWorker")}
        </span>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label={themeTooltip}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            suppressHydrationWarning
          >
            {mounted ? (
              theme === "dark" ? (
                <Sun className="size-4 shrink-0" />
              ) : (
                <Moon className="size-4 shrink-0" />
              )
            ) : (
              <Moon className="size-4 shrink-0" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{themeTooltip}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="min-w-9 text-muted-foreground hover:text-foreground"
            aria-label={langTooltip}
            onClick={toggleLocale}
            suppressHydrationWarning
          >
            <span className="text-xs font-semibold leading-none" translate="no">
              {langMounted ? (locale === "en" ? "EN" : "हि") : "EN"}
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{langTooltip}</TooltipContent>
      </Tooltip>
      {showLogout ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              aria-label={t("logOut")}
              onClick={handleLogout}
            >
              <LogOut className="size-4 shrink-0" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t("logOut")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
