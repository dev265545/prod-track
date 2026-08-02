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
import { useIsAdmin } from "@/lib/hooks/useClientValue";
import {
  activeItemHref,
  moduleForPath,
  visibleModules,
} from "@/components/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  // `isAdmin()` touches localStorage, so it cannot simply be called during
  // render — the server markup would disagree with the client and hydrate the
  // wrong menu. `useIsAdmin` gets that right without an effect: React renders
  // `false` on the server and swaps to the real answer during hydration, with
  // no extra render pass and no frame showing the admin menu to a worker.
  const admin = useIsAdmin();

  const modules = visibleModules(admin);
  const currentModule = moduleForPath(pathname);
  const currentItem = activeItemHref(pathname);
  const onHome = pathname === "/";

  // Whether the second group (the current module's pages) is on screen. A
  // single-page module (Salary, Settings) is already fully described by its
  // switcher entry, so it never gets a page list.
  const showPages =
    !!currentModule &&
    currentModule.items.length > 1 &&
    (!currentModule.adminOnly || admin);

  return (
    <>
      <SidebarHeader className="flex flex-row items-center gap-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-3">
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
        <SidebarGroup className="group-data-[collapsible=icon]:px-0">
          <SidebarGroupLabel>{t("navSections")}</SidebarGroupLabel>
          <SidebarMenu className="group-data-[collapsible=icon]:items-center">
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={onHome}
                tooltip={t("navHome")}
                size="lg"
              >
                {/* Collapsed, the label is display:none — so every entry
                    carries an aria-label, or the icon rail would be a column
                    of unnamed links to a screen reader. */}
                <Link href="/" aria-label={t("navHome")}>
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
              const isCurrent = currentModule?.id === mod.id;
              // Only ever one copper item in the rail. When the page list is
              // showing, *it* owns the active state — the module below would
              // otherwise light up a second, identical-looking button for the
              // same place. The module then keeps copper as ink only: "you are
              // in here", quieter than "this is the page you are on".
              const isActive = isCurrent && !showPages;
              return (
                <SidebarMenuItem key={mod.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={label}
                    size="lg"
                    className={
                      isCurrent && !isActive ? "text-sidebar-primary" : undefined
                    }
                  >
                    <Link
                      href={mod.href}
                      aria-label={label}
                      aria-current={
                        isActive ? "page" : isCurrent ? "location" : undefined
                      }
                    >
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
        {showPages && currentModule ? (
          <>
            {/* Collapsed there is no group label to separate the two lists, so
                the rule has to stay — it is the only thing telling the operator
                the icons below belong to the section highlighted above. Sized
                to the 52px rail: a 24px rule, centred (52 − 24) / 2 = 14px. */}
            <SidebarSeparator className="group-data-[collapsible=icon]:mx-3.5 group-data-[collapsible=icon]:w-6" />
            <SidebarGroup className="group-data-[collapsible=icon]:px-0">
              <SidebarGroupLabel>{t(currentModule.labelKey)}</SidebarGroupLabel>
              <SidebarMenu className="group-data-[collapsible=icon]:items-center">
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
                        <Link
                          href={href}
                          aria-label={label}
                          aria-current={currentItem === href ? "page" : undefined}
                        >
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
