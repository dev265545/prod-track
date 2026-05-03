"use client";

import type { ReactNode } from "react";
import {
  Sidebar,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppHeaderActions } from "@/components/app-header-actions";
import { AppSidebar } from "@/components/app-sidebar";

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
            {headerContent ? (
              <div className="min-w-0 flex-1">{headerContent}</div>
            ) : null}
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
