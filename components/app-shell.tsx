"use client";

import {
  Sidebar,
  SidebarInset,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
        <header className="flex h-12 shrink-0 items-center border-b border-border px-4">
          {/* Mobile only: open sheet when sidebar is hidden */}
          <SidebarTrigger className="md:hidden" />
        </header>
        <div className="app-wrap flex-1">{children}</div>
      </SidebarInset>
    </>
  );
}
