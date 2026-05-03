"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { logout } from "@/lib/auth";
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
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

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
    <div className="flex items-center gap-0.5">
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
