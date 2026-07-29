"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package2,
  LayoutGrid,
  Warehouse,
  Clock,
  FileBarChart,
  FileSpreadsheet,
  UsersRound,
  SlidersHorizontal,
  Cog,
  ChevronRight,
} from "lucide-react";
import {
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/components/language-provider";
import { isAdmin } from "@/lib/auth";
import type { MessageKey } from "@/lib/i18n/messages";
import { CATEGORY_THEME } from "@/components/inventory/category-theme";
import { INVENTORY_CATEGORIES } from "@/lib/services/inventoryService";

const inventoryChildren = [
  { href: "/inventory", icon: LayoutGrid, labelKey: "inventoryNavDashboard" as const },
  ...INVENTORY_CATEGORIES.map(({ value }) => ({
    href: `/inventory/${value}`,
    icon: CATEGORY_THEME[value].icon,
    labelKey: CATEGORY_THEME[value].labelKey,
  })),
] satisfies { href: string; icon: typeof LayoutGrid; labelKey: MessageKey }[];

const navLinks = [
  { href: "/", icon: LayoutGrid, labelKey: "navDashboard" as const },
  { href: "/shifts", icon: Clock, labelKey: "navShifts" as const },
  { href: "/machine", icon: Cog, labelKey: "navMachine" as const },
  { href: "/reports", icon: FileBarChart, labelKey: "navReports" as const },
  {
    href: "/salary-sheet",
    icon: FileSpreadsheet,
    labelKey: "navSalarySheet" as const,
    adminOnly: true,
  },
  { href: "/employees", icon: UsersRound, labelKey: "navEmployees" as const },
  {
    href: "/settings",
    icon: SlidersHorizontal,
    labelKey: "navSettings" as const,
    adminOnly: true,
  },
] satisfies {
  href: string;
  icon: typeof LayoutGrid;
  labelKey: MessageKey;
  adminOnly?: boolean;
}[];

export function AppSidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const admin = isAdmin();
  const visibleLinks = navLinks.filter((link) => !link.adminOnly || admin);
  const inventoryIsCurrent = pathname === "/inventory" || pathname.startsWith("/inventory/");
  const [inventoryOpen, setInventoryOpen] = useState(inventoryIsCurrent);
  const expanded = inventoryOpen || inventoryIsCurrent;
  const inventoryInsertIndex = visibleLinks.findIndex((link) => link.href === "/shifts");
  const linksBeforeInventory = visibleLinks.slice(0, inventoryInsertIndex);
  const linksAfterInventory = visibleLinks.slice(inventoryInsertIndex);

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
        <SidebarGroup className="group-data-[collapsible=icon]:px-1.5">
          <SidebarMenu>
            {linksBeforeInventory.map(({ href, icon: Icon, labelKey }) => {
              const label = t(labelKey);
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    tooltip={label}
                    size="lg"
                  >
                    <Link href={href}>
                      <Icon data-icon="inline-start" className="size-5 shrink-0" />
                      <span className="group-data-[collapsible=icon]:hidden">
                        {label}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/inventory"}
                tooltip={t("navInventory")}
                size="lg"
                onClick={() => setInventoryOpen(true)}
              >
                <Link href="/inventory">
                  <Warehouse data-icon="inline-start" className="size-5 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">
                    {t("navInventory")}
                  </span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuAction
                type="button"
                className="!top-1/2 !-translate-y-1/2 group-data-[collapsible=icon]:hidden peer-data-[active=true]/menu-button:text-white"
                onClick={() => setInventoryOpen((open) => !open)}
                aria-expanded={expanded}
                aria-label={t("navInventory")}
              >
                <ChevronRight
                  className={`size-4 shrink-0 transition-transform ${
                    expanded ? "rotate-90" : ""
                  }`}
                />
              </SidebarMenuAction>
              {expanded && (
                <SidebarMenuSub>
                  <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/35">
                    {t("inventoryBrowseCategories")}
                  </div>
                  {inventoryChildren.map(({ href, icon: Icon, labelKey }) => {
                    const label = t(labelKey);
                    const isActive =
                      href === "/inventory"
                        ? pathname === "/inventory"
                        : pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <SidebarMenuSubItem key={href}>
                        <SidebarMenuSubButton asChild isActive={isActive}>
                          <Link href={href}>
                            <Icon className="size-4 shrink-0" />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              )}
            </SidebarMenuItem>

            {linksAfterInventory.map(({ href, icon: Icon, labelKey }) => {
              const label = t(labelKey);
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    tooltip={label}
                    size="lg"
                  >
                    <Link href={href}>
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
      </SidebarContent>
    </>
  );
}
