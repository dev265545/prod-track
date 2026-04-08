"use client";

import {
  Sidebar,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppHeaderActions } from "@/components/app-header-actions";
import { AppSidebar } from "@/components/app-sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarRail />
        <AppSidebar />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center border-b border-border px-3 sm:px-4">
          <SidebarTrigger className="shrink-0 md:hidden" />
          <div className="ml-auto flex shrink-0 items-center">
            <AppHeaderActions />
          </div>
        </header>
        <div className="app-wrap flex-1">{children}</div>
      </SidebarInset>
    </>
  );
}
