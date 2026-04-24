"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun } from "lucide-react";
import { logout } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AppHeaderActions() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  const themeTooltip =
    !mounted ? "Toggle theme" : theme === "dark" ? "Light mode" : "Dark mode";

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
            className="text-muted-foreground hover:text-foreground"
            aria-label="Log out"
            onClick={handleLogout}
          >
            <LogOut className="size-4 shrink-0" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Log out</TooltipContent>
      </Tooltip>
    </div>
  );
}
