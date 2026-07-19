"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package2,
  LayoutGrid,
  Boxes,
  Clock,
  FileBarChart,
  FileSpreadsheet,
  UsersRound,
  SlidersHorizontal,
  Cog,
} from "lucide-react";
import {
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/components/language-provider";
import { isAdmin } from "@/lib/auth";
import type { MessageKey } from "@/lib/i18n/messages";

const navLinks = [
  { href: "/", icon: LayoutGrid, labelKey: "navDashboard" as const },
  { href: "/items", icon: Boxes, labelKey: "navItems" as const },
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
            {visibleLinks.map(({ href, icon: Icon, labelKey }) => {
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
