import { createFileRoute } from "@tanstack/react-router";
import { SurfaceFrame } from "@workspace/ui/components/surface-frame";
import type * as React from "react";

import { Demo, DocPage, DocSection, PropsTable } from "./-components/doc-kit";
import type { ComponentMeta } from "./-components/doc-kit";

export const meta: ComponentMeta = {
  description:
    "A reusable visual frame with a ring, optional halo, inner bevel, and configurable elevation.",
  import:
    'import { SurfaceFrame } from "@workspace/ui/components/surface-frame";',
  name: "Surface Frame",
  related: ["Card", "Popover"],
  status: "beta",
  whenNotToUse: [
    "Use Card when you need card-specific header, content, and footer parts.",
    "Use a plain border or shadow when the layered frame treatment is unnecessary.",
  ],
  whenToUse: [
    "Use for cards, panels, popovers, and other surfaces that share the layered frame treatment.",
    "Use the surface-frame utility classes directly when styling an existing primitive without adding a wrapper.",
  ],
};

export const Route = createFileRoute(
  "/surface-frame" as unknown as "/surface-frame"
)({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <DocPage meta={meta}>
      <DocSection
        title="Default"
        description="The default frame combines a subtle bevel, low elevation, and the standard halo."
      >
        <Demo code='<SurfaceFrame className="min-h-24 w-64 p-4 text-sm">Default frame</SurfaceFrame>'>
          <SurfaceFrame className="min-h-24 w-64 p-4 text-sm">
            Default frame
          </SurfaceFrame>
        </Demo>
      </DocSection>

      <DocSection
        title="Elevation"
        description="Elevation controls only the ambient drop shadow."
      >
        <Demo
          code={`<SurfaceFrame elevation="none" className="min-h-20 w-40 p-3 text-xs">None</SurfaceFrame>
<SurfaceFrame elevation="sm" className="min-h-20 w-40 p-3 text-xs">Small</SurfaceFrame>
<SurfaceFrame elevation="md" className="min-h-20 w-40 p-3 text-xs">Medium</SurfaceFrame>
<SurfaceFrame elevation="lg" className="min-h-20 w-40 p-3 text-xs">Large</SurfaceFrame>`}
        >
          <SurfaceFrame elevation="none" className="min-h-20 w-40 p-3 text-xs">
            None
          </SurfaceFrame>
          <SurfaceFrame elevation="sm" className="min-h-20 w-40 p-3 text-xs">
            Small
          </SurfaceFrame>
          <SurfaceFrame elevation="md" className="min-h-20 w-40 p-3 text-xs">
            Medium
          </SurfaceFrame>
          <SurfaceFrame elevation="lg" className="min-h-20 w-40 p-3 text-xs">
            Large
          </SurfaceFrame>
        </Demo>
      </DocSection>

      <DocSection
        title="Halo and bevel"
        description="Halo controls the detached outer ring; bevel controls the inner edge highlight."
      >
        <Demo
          code={`<SurfaceFrame halo="none" bevel="none" className="min-h-20 w-40 p-3 text-xs">None</SurfaceFrame>
<SurfaceFrame halo="subtle" bevel="subtle" className="min-h-20 w-40 p-3 text-xs">Subtle</SurfaceFrame>
<SurfaceFrame halo="strong" bevel="strong" className="min-h-20 w-40 p-3 text-xs">Strong</SurfaceFrame>`}
        >
          <SurfaceFrame
            halo="none"
            bevel="none"
            className="min-h-20 w-40 p-3 text-xs"
          >
            None
          </SurfaceFrame>
          <SurfaceFrame
            halo="subtle"
            bevel="subtle"
            className="min-h-20 w-40 p-3 text-xs"
          >
            Subtle
          </SurfaceFrame>
          <SurfaceFrame
            halo="strong"
            bevel="strong"
            className="min-h-20 w-40 p-3 text-xs"
          >
            Strong
          </SurfaceFrame>
        </Demo>
      </DocSection>

      <DocSection
        title="Use on an existing element"
        description="The same recipe is available as utility classes when a wrapper would be unnecessary."
      >
        <Demo code='<div className="surface-frame surface-frame-elevation-md surface-frame-halo-none min-h-20 w-64 p-4 text-sm">Existing element</div>'>
          <div className="surface-frame surface-frame-elevation-md surface-frame-halo-none min-h-20 w-64 p-4 text-sm">
            Existing element
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Custom CSS variables"
        description="Use the documented variables for exceptional colors or backdrop contexts; prefer the named variants for normal usage."
      >
        <Demo
          code={`<SurfaceFrame
  className="min-h-20 w-64 p-4 text-sm"
  style={
    {
      "--surface-frame-bevel-color": "var(--color-border-tertiary)",
    } as React.CSSProperties
  }
>
  Custom bevel color
</SurfaceFrame>`}
        >
          <SurfaceFrame
            className="min-h-20 w-64 p-4 text-sm"
            style={
              {
                "--surface-frame-bevel-color": "var(--color-border-tertiary)",
              } as React.CSSProperties
            }
          >
            Custom bevel color
          </SurfaceFrame>
        </Demo>
      </DocSection>

      <DocSection
        title="API"
        description="Props in addition to the native element and render props."
      >
        <PropsTable
          rows={[
            {
              default: '"sm"',
              description: "Ambient drop-shadow strength.",
              name: "elevation",
              type: '"none" | "sm" | "md" | "lg"',
            },
            {
              default: '"default"',
              description: "Detached outer ring strength.",
              name: "halo",
              type: '"none" | "subtle" | "default" | "strong"',
            },
            {
              default: '"subtle"',
              description:
                "Inner bevel strength. It flips direction with the color mode.",
              name: "bevel",
              type: '"none" | "subtle" | "strong"',
            },
            {
              default: '"xl"',
              description: "Corner radius of the frame.",
              name: "radius",
              type: '"none" | "sm" | "md" | "lg" | "xl" | "full"',
            },
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
