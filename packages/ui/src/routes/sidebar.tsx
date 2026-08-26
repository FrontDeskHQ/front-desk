import { createFileRoute } from "@tanstack/react-router";
import {
  createSidebarHandle,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarResizeHandle,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar";
import { Inbox, MessagesSquare, PanelRight, Search } from "lucide-react";
import * as React from "react";

import {
  Anatomy,
  Demo,
  DocPage,
  DocSection,
  PropsTable,
} from "./-components/doc-kit";
import type { ComponentMeta } from "./-components/doc-kit";

export const meta: ComponentMeta = {
  description:
    "A collapsible, resizable app chrome panel with left or right placement, optional hover-to-peek, a floating Dialog overlay, and a detached trigger via createSidebarHandle.",
  import:
    'import { Sidebar, SidebarProvider, SidebarTrigger, createSidebarHandle } from "@workspace/ui/components/sidebar";',
  name: "Sidebar",
  related: ["Button", "Dialog", "Sheet", "Resizable"],
  status: "beta",
  whenNotToUse: [
    "A temporary overlay drawer — use Sheet.",
    "Splitting two content panes that are not app chrome — use ResizablePanelGroup.",
    "Horizontal site navigation — use NavigationMenu.",
  ],
  whenToUse: [
    "App chrome that pins beside the main view and can collapse (inbox nav, thread details, settings nav).",
    "A floating overlay panel that should not push layout — use variant=\"floating\" (Base UI Dialog).",
    "More than one sidebar on the same screen — give each Provider or handle its own id, width, and min/max.",
    "A collapse control that lives outside the panel (toolbar, inbox header) — pass a handle to SidebarTrigger.",
  ],
};

export const Route = createFileRoute("/sidebar" as unknown as "/sidebar")({
  component: RouteComponent,
});

function NavItems() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspace</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton isActive>
              <Inbox />
              <span>Inbox</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <MessagesSquare />
              <span>Threads</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <Search />
              <span>Search</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function DetachedTriggerDemo() {
  const [handle] = React.useState(() =>
    createSidebarHandle({
      defaultWidth: 200,
      id: "docs-detached",
      maxWidth: 280,
      minWidth: 160,
    })
  );

  return (
    <div className="flex h-80 w-full flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger handle={handle} />
        <span className="text-sm">Inbox</span>
      </header>
      <SidebarProvider handle={handle} className="min-h-0 flex-1">
        <Sidebar>
          <SidebarHeader className="text-sm">Acme</SidebarHeader>
          <SidebarContent>
            <NavItems />
          </SidebarContent>
          <SidebarResizeHandle />
        </Sidebar>
        <SidebarInset className="p-3 text-sm text-foreground-secondary">
          Trigger lives in the header, outside the sidebar panel.
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function RouteComponent() {
  return (
    <DocPage meta={meta}>
      <DocSection
        title="Basic"
        description="Left sidebars default to hover peek and a flush surface — no fill, no border. Drag the inner edge to resize; collapse, then hover the edge to peek."
      >
        <Demo
          className="h-80 w-full overflow-hidden p-0"
          code={`<SidebarProvider id="inbox" minWidth={180} maxWidth={360}>
  <Sidebar>
    <SidebarHeader>Acme</SidebarHeader>
    <SidebarContent>{/* nav */}</SidebarContent>
    <SidebarResizeHandle />
  </Sidebar>
  <SidebarInset>
    <SidebarTrigger />
    Inbox
  </SidebarInset>
</SidebarProvider>`}
        >
          <SidebarProvider
            className="h-80 w-full"
            defaultWidth={220}
            id="docs-basic"
            maxWidth={320}
            minWidth={180}
          >
            <Sidebar>
              <SidebarHeader className="text-sm">Acme</SidebarHeader>
              <SidebarContent>
                <NavItems />
              </SidebarContent>
              <SidebarResizeHandle />
            </Sidebar>
            <SidebarInset>
              <header className="flex h-10 items-center gap-2 border-b px-2">
                <SidebarTrigger />
                <span className="text-sm">Inbox</span>
              </header>
              <div className="p-3 text-foreground-secondary text-sm">
                Thread list
              </div>
            </SidebarInset>
          </SidebarProvider>
        </Demo>
      </DocSection>

      <DocSection
        title="Inset"
        description="Filled surface with a side border — the previous default look. Use for a details pane. Leave left nav on the default variant."
      >
        <Demo
          className="h-80 w-full overflow-hidden p-0"
          code={`<SidebarProvider id="details" minWidth={200} maxWidth={400}>
  <SidebarInset>Thread</SidebarInset>
  <Sidebar side="right" variant="inset">
    <SidebarHeader>Details</SidebarHeader>
    <SidebarContent>{/* context */}</SidebarContent>
    <SidebarResizeHandle />
  </Sidebar>
</SidebarProvider>`}
        >
          <SidebarProvider
            className="h-80 w-full"
            defaultWidth={220}
            id="docs-inset"
            maxWidth={320}
            minWidth={180}
          >
            <SidebarInset>
              <header className="flex h-10 items-center justify-end gap-2 border-b px-2">
                <span className="mr-auto text-sm">Thread</span>
                <SidebarTrigger />
              </header>
              <div className="p-3 text-foreground-secondary text-sm">
                Conversation
              </div>
            </SidebarInset>
            <Sidebar side="right" variant="inset">
              <SidebarHeader className="flex-row items-center gap-2 text-sm">
                <PanelRight className="size-4" />
                Details
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Customer</SidebarGroupLabel>
                  <SidebarGroupContent className="px-2 text-foreground-secondary text-sm">
                    alex@acme.com
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
              <SidebarResizeHandle />
            </Sidebar>
          </SidebarProvider>
        </Demo>
      </DocSection>

      <DocSection
        title="Floating"
        description="variant=&quot;floating&quot; renders the panel as a Base UI Dialog overlay — rounded, bordered, no layout gap. Content stays full-width underneath. Collapse, then hover the edge to peek."
      >
        <Demo
          className="h-80 w-full overflow-hidden p-0"
          code={`<SidebarProvider id="nav" defaultOpen={false}>
  <Sidebar variant="floating">
    <SidebarHeader>Acme</SidebarHeader>
    <SidebarContent>{/* nav */}</SidebarContent>
    <SidebarResizeHandle />
  </Sidebar>
  <SidebarInset>
    <SidebarTrigger />
    Inbox
  </SidebarInset>
</SidebarProvider>`}
        >
          <SidebarProvider
            className="h-80 w-full"
            defaultOpen={false}
            defaultWidth={220}
            id="docs-floating"
            maxWidth={320}
            minWidth={180}
          >
            <Sidebar variant="floating">
              <SidebarHeader className="text-sm">Acme</SidebarHeader>
              <SidebarContent>
                <NavItems />
              </SidebarContent>
              <SidebarResizeHandle />
            </Sidebar>
            <SidebarInset>
              <header className="flex h-10 items-center gap-2 border-b px-2">
                <SidebarTrigger />
                <span className="text-sm">Inbox</span>
              </header>
              <div className="p-3 text-foreground-secondary text-sm">
                Content stays full width. Pin with the trigger, or hover the
                left edge to peek.
              </div>
            </SidebarInset>
          </SidebarProvider>
        </Demo>
      </DocSection>

      <DocSection
        title="Hover peek"
        description="Left sidebars default to collapseMode=&quot;hover&quot;. Start collapsed to try the edge peek (Linear / Notion); pin with the trigger."
      >
        <Demo
          className="h-80 w-full overflow-hidden p-0"
          code={`<SidebarProvider id="nav" collapseMode="hover" defaultOpen={false}>
  <Sidebar>
    <SidebarContent>{/* nav */}</SidebarContent>
    <SidebarResizeHandle />
  </Sidebar>
  <SidebarInset>
    <SidebarTrigger />
    Hover the left edge
  </SidebarInset>
</SidebarProvider>`}
        >
          <SidebarProvider
            className="h-80 w-full"
            collapseMode="hover"
            defaultOpen={false}
            defaultWidth={220}
            id="docs-hover"
            maxWidth={320}
            minWidth={180}
          >
            <Sidebar>
              <SidebarHeader className="text-sm">Acme</SidebarHeader>
              <SidebarContent>
                <NavItems />
              </SidebarContent>
              <SidebarResizeHandle />
            </Sidebar>
            <SidebarInset>
              <header className="flex h-10 items-center gap-2 border-b px-2">
                <SidebarTrigger />
                <span className="text-sm">Inbox</span>
              </header>
              <div className="p-3 text-foreground-secondary text-sm">
                Hover the left edge to peek. Pin with the trigger.
              </div>
            </SidebarInset>
          </SidebarProvider>
        </Demo>
      </DocSection>

      <DocSection
        title="Right placement"
        description="side=&quot;right&quot; mirrors layout, hover target, and resize. Pair with variant=&quot;inset&quot; for a filled details pane. Collapse defaults to offcanvas."
      >
        <Demo
          className="h-80 w-full overflow-hidden p-0"
          code={`<SidebarProvider id="details" minWidth={200} maxWidth={400}>
  <SidebarInset>Thread</SidebarInset>
  <Sidebar side="right" variant="inset">
    <SidebarHeader>Details</SidebarHeader>
    <SidebarContent>{/* context */}</SidebarContent>
    <SidebarResizeHandle />
  </Sidebar>
</SidebarProvider>`}
        >
          <SidebarProvider
            className="h-80 w-full"
            defaultWidth={220}
            id="docs-right"
            maxWidth={320}
            minWidth={180}
          >
            <SidebarInset>
              <header className="flex h-10 items-center justify-end gap-2 border-b px-2">
                <span className="mr-auto text-sm">Thread</span>
                <SidebarTrigger />
              </header>
              <div className="p-3 text-foreground-secondary text-sm">
                Conversation
              </div>
            </SidebarInset>
            <Sidebar side="right" variant="inset">
              <SidebarHeader className="flex-row items-center gap-2 text-sm">
                <PanelRight className="size-4" />
                Details
              </SidebarHeader>
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupLabel>Customer</SidebarGroupLabel>
                  <SidebarGroupContent className="px-2 text-foreground-secondary text-sm">
                    alex@acme.com
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
              <SidebarResizeHandle />
            </Sidebar>
          </SidebarProvider>
        </Demo>
      </DocSection>

      <DocSection
        title="Independent sidebars"
        description="Each Provider (or handle) owns its own width and open state. Nest providers when two sidebars share a layout."
      >
        <Demo
          className="h-80 w-full overflow-hidden p-0"
          code={`<SidebarProvider id="nav" minWidth={160} maxWidth={260}>
  <Sidebar side="left">{/* nav */}</Sidebar>
  <SidebarProvider id="details" minWidth={180} maxWidth={320} className="flex-1">
    <SidebarInset>Inbox</SidebarInset>
    <Sidebar side="right" variant="inset">{/* details */}</Sidebar>
  </SidebarProvider>
</SidebarProvider>`}
        >
          <SidebarProvider
            className="h-80 w-full"
            defaultWidth={180}
            id="docs-left-pair"
            maxWidth={240}
            minWidth={148}
          >
            <Sidebar side="left">
              <SidebarHeader className="text-sm">Nav</SidebarHeader>
              <SidebarContent>
                <NavItems />
              </SidebarContent>
              <SidebarResizeHandle />
            </Sidebar>
            <SidebarProvider
              className="min-w-0 flex-1"
              defaultWidth={200}
              id="docs-right-pair"
              maxWidth={280}
              minWidth={160}
            >
              <SidebarInset className="p-3 text-foreground-secondary text-sm">
                Thread list
              </SidebarInset>
              <Sidebar side="right" variant="inset">
                <SidebarHeader className="text-sm">Details</SidebarHeader>
                <SidebarContent>
                  <SidebarGroup>
                    <SidebarGroupLabel>Customer</SidebarGroupLabel>
                    <SidebarGroupContent className="px-2 text-foreground-secondary text-sm">
                      alex@acme.com
                    </SidebarGroupContent>
                  </SidebarGroup>
                </SidebarContent>
                <SidebarResizeHandle />
              </Sidebar>
            </SidebarProvider>
          </SidebarProvider>
        </Demo>
      </DocSection>

      <DocSection
        title="Detached trigger"
        description="createSidebarHandle() is a store. Pass the same handle to SidebarTrigger and SidebarProvider so the trigger can live outside the provider tree."
      >
        <Demo
          className="h-80 w-full overflow-hidden p-0"
          code={`const inbox = createSidebarHandle({ id: "inbox" })

<header>
  <SidebarTrigger handle={inbox} />
</header>
<SidebarProvider handle={inbox}>
  <Sidebar>{/* nav */}</Sidebar>
  <SidebarInset />
</SidebarProvider>`}
        >
          <DetachedTriggerDemo />
        </Demo>
      </DocSection>

      <DocSection
        title="API"
        description="Props in addition to the native element props. One Provider or handle per sidebar."
      >
        <PropsTable
          rows={[
            {
              default: "hover (left) / offcanvas (right)",
              description:
                "How the panel hides. Left defaults to hover peek; right defaults to offcanvas. none keeps it open.",
              name: "collapseMode (Provider / Sidebar)",
              type: '"offcanvas" | "hover" | "none"',
            },
            {
              description:
                "Persistence key for open + width. Required when more than one sidebar is on screen.",
              name: "id (Provider / handle)",
              type: "string",
            },
            {
              default: "256",
              description: "Initial width in pixels, clamped to min/max.",
              name: "defaultWidth (Provider / handle)",
              type: "number",
            },
            {
              default: "196",
              description: "Minimum resize width in pixels.",
              name: "minWidth (Provider / handle)",
              type: "number",
            },
            {
              default: "480",
              description: "Maximum resize width in pixels.",
              name: "maxWidth (Provider / handle)",
              type: "number",
            },
            {
              default: "true",
              description: "Uncontrolled open state. Use open + onOpenChange to control.",
              name: "defaultOpen / open (Provider)",
              type: "boolean",
            },
            {
              description:
                "Shared store from createSidebarHandle(). Lets Trigger and Sidebar connect without a common provider ancestor.",
              name: "handle (Provider, Trigger, Sidebar)",
              type: "SidebarHandle",
            },
            {
              default: '"left"',
              description: "Which edge the panel occupies. Mirrors overlay, hover target, and resize.",
              name: "side (Sidebar)",
              type: '"left" | "right"',
            },
            {
              default: '"left"',
              description:
                "Which panel edge the default trigger icon depicts. The sidebar strip is filled when open and outlined when collapsed. Open does not apply a pressed/active button look. Pass children to replace the icon.",
              name: "side / children (Trigger)",
              type: '"left" | "right" / ReactNode',
            },
            {
              default: '"sidebar"',
              description:
                "Visual chrome. sidebar is flush (no fill, no border). inset is a filled surface with a side border. floating overlays content in a Base UI Dialog (rounded, bordered, no layout gap).",
              name: "variant (Sidebar)",
              type: '"sidebar" | "inset" | "floating"',
            },
            {
              description:
                "Legacy alias mapped onto collapseMode (icon → hover). Prefer collapseMode.",
              name: "collapsible (Sidebar)",
              type: '"offcanvas" | "icon" | "none"',
            },
          ]}
        />
      </DocSection>

      <DocSection
        title="Anatomy"
        description="Provider holds state. Compose the panel, resize handle, inset, and trigger in any order. Trigger may sit outside the provider when given a handle."
      >
        <Anatomy
          code={`<SidebarProvider id="nav">
  <Sidebar side="left">
    <SidebarHeader />
    <SidebarContent />
    <SidebarResizeHandle />
  </Sidebar>
  <SidebarInset>
    <SidebarTrigger />
    {children}
  </SidebarInset>
  <Sidebar side="right" variant="inset">
    <SidebarHeader />
    <SidebarContent />
    <SidebarResizeHandle />
  </Sidebar>
</SidebarProvider>`}
        />
      </DocSection>
    </DocPage>
  );
}
