"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { AppHeaderActions } from "@/components/app-header-actions";
import { AppSidebar } from "@/components/app-sidebar";
import { useLanguage } from "@/components/language-provider";
import { breadcrumbsFor } from "@/components/navigation";

/**
 * Breadcrumb derived from the current route. Every page gets one for free —
 * one back-navigation idiom for the whole app. A page only passes
 * `headerContent` when it needs to append a leaf the route cannot know
 * (an employee's name, say).
 */
function RouteBreadcrumb() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const crumbs = breadcrumbsFor(pathname);
  if (crumbs.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, i) => (
          <BreadcrumbItem key={crumb.labelKey}>
            {crumb.href ? (
              <>
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{t(crumb.labelKey)}</Link>
                </BreadcrumbLink>
                {i < crumbs.length - 1 ? <BreadcrumbSeparator /> : null}
              </>
            ) : (
              <BreadcrumbPage>{t(crumb.labelKey)}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

interface AppShellProps {
  children: ReactNode;
  headerContent?: ReactNode;
}

export function AppShell({ children, headerContent }: AppShellProps) {
  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarRail />
        <AppSidebar />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center border-b border-border px-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <SidebarTrigger className="shrink-0 md:hidden" />
            <div className="min-w-0 flex-1">
              {headerContent ?? <RouteBreadcrumb />}
            </div>
          </div>
          <div className="ml-3 flex shrink-0 items-center">
            <AppHeaderActions />
          </div>
        </header>
        <div className="app-wrap flex-1">{children}</div>
      </SidebarInset>
    </>
  );
}
