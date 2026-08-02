"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Package2 } from "lucide-react";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/components/language-provider";
import { isAdmin } from "@/lib/auth";
import {
  activeItemHref,
  moduleForPath,
  visibleModules,
} from "@/components/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  // Role is read after mount, never during render: `isAdmin()` touches
  // localStorage, so calling it while rendering makes the server/first-paint
  // markup disagree with the client and hydrate the wrong menu.
  const [admin, setAdmin] = React.useState(false);
  React.useEffect(() => {
    setAdmin(isAdmin());
  }, [pathname]);

  const modules = visibleModules(admin);
  const currentModule = moduleForPath(pathname);
  const currentItem = activeItemHref(pathname);
  const onHome = pathname === "/";

  return (
    <>
      <SidebarHeader className="flex flex-row items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1.5 group-data-[collapsible=icon]:py-3">
        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground no-underline outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 group-data-[collapsible=icon]:hidden"
        >
          <Package2 className="size-5 shrink-0 text-sidebar-primary" />
          <span
            className="truncate font-heading text-base font-semibold"
            translate="no"
          >
            {t("appName")}
          </span>
        </Link>
        <SidebarTrigger className="size-10 shrink-0" />
      </SidebarHeader>

      <SidebarContent>
        {/* Module switcher — always visible, so you can hop between sections
            without going back Home. */}
        <SidebarGroup className="group-data-[collapsible=icon]:px-1.5">
          <SidebarGroupLabel>{t("navSections")}</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={onHome}
                tooltip={t("navHome")}
                size="lg"
              >
                <Link href="/">
                  <Home data-icon="inline-start" className="size-5 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    {t("navHome")}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {modules.map((mod) => {
              const label = t(mod.labelKey);
              const Icon = mod.icon;
              return (
                <SidebarMenuItem key={mod.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={currentModule?.id === mod.id}
                    tooltip={label}
                    size="lg"
                  >
                    <Link href={mod.href}>
                      <Icon data-icon="inline-start" className="size-5 shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">
                        {label}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Pages inside the section you are in. A single-page section (Salary,
            Settings) is already fully described by its switcher entry. */}
        {currentModule &&
        currentModule.items.length > 1 &&
        (!currentModule.adminOnly || admin) ? (
          <>
            <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
            <SidebarGroup className="group-data-[collapsible=icon]:px-1.5">
              <SidebarGroupLabel>{t(currentModule.labelKey)}</SidebarGroupLabel>
              <SidebarMenu>
                {currentModule.items.map(({ href, labelKey, icon: Icon }) => {
                  const label = t(labelKey);
                  return (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton
                        asChild
                        isActive={currentItem === href}
                        tooltip={label}
                        size="lg"
                      >
                        <Link href={href}>
                          <Icon
                            data-icon="inline-start"
                            className="size-5 shrink-0"
                          />
                          <span className="group-data-[collapsible=icon]:hidden">
                            {label}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          </>
        ) : null}
      </SidebarContent>
    </>
  );
}
