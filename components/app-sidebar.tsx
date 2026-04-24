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

const navLinks = [
  { href: "/", icon: LayoutGrid, label: "Dashboard" },
  { href: "/items", icon: Boxes, label: "Items" },
  { href: "/shifts", icon: Clock, label: "Shifts" },
  { href: "/reports", icon: FileBarChart, label: "Production report" },
  { href: "/salary-sheet", icon: FileSpreadsheet, label: "Salary sheet" },
  { href: "/employees", icon: UsersRound, label: "Employees" },
  { href: "/settings", icon: SlidersHorizontal, label: "Settings & data" },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <>
      <SidebarHeader className="flex flex-row items-center gap-2 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-2">
        <Link
          href="/"
          className="order-1 flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground no-underline outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 group-data-[collapsible=icon]:order-2 group-data-[collapsible=icon]:flex-none"
        >
          <Package2 className="size-5 shrink-0 text-sidebar-primary" />
          <span className="truncate font-heading text-base font-semibold group-data-[collapsible=icon]:hidden">
            ProdTrack Lite
          </span>
        </Link>
        <SidebarTrigger className="order-2 h-9 w-9 shrink-0 group-data-[collapsible=icon]:order-1" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navLinks.map(({ href, icon: Icon, label }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === href}
                  tooltip={label}
                  size="lg"
                >
                  <Link href={href}>
                    <Icon data-icon="inline-start" className="size-5 shrink-0" />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
