import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "next-themes";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/sidebar";

import { RootSidebar } from "./-components/sidebar";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="flex h-svh w-full flex-col overflow-hidden">
        <SidebarProvider className="flex min-h-0 w-full flex-1 flex-row overflow-hidden">
          <RootSidebar />
          <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-primary px-2 md:hidden">
              <SidebarTrigger />
              <span className="font-medium text-sm">FrontDesk UI</span>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
              <Outlet />
            </div>

            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
          </SidebarInset>
        </SidebarProvider>
      </div>
    </ThemeProvider>
  );
}
