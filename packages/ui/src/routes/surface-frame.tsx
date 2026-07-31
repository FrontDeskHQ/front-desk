import { createFileRoute } from "@tanstack/react-router";
import { SurfaceFrame } from "@workspace/ui/components/surface-frame";
import type * as React from "react";

import { Demo, DocPage, DocSection, PropsTable } from "./-components/doc-kit";
import type { ComponentMeta } from "./-components/doc-kit";

export const meta: ComponentMeta = {
  description:
    "A Tailwind utility recipe for a border, optional halo, inner bevel, and elevation, with a SurfaceFrame wrapper for component APIs.",
  import:
    'import { SurfaceFrame } from "@workspace/ui/components/surface-frame";',
  name: "Surface Frame",
  status: "beta",
  whenNotToUse: [
    "Use a plain border or shadow when the element is not a new surface in its local composition.",
    "Use the SurfaceFrame component only when utility classes are not enough for the composition.",
  ],
  whenToUse: [
    "Use it when declaring a new surface: any element you decide should read as its own visual layer.",
    "Pair it with a background utility from the Colors foundation, such as bg-background-secondary or bg-background-tertiary, to establish fill and visual distinction.",
    "Start with the surface-frame utility classes, and choose SurfaceFrame only when the frame needs a component API or Base UI render prop.",
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
        title="Declare a new surface"
        description="Use Surface Frame when you declare a new surface—any element you decide should read as its own visual layer. The consuming feature defines that boundary. Pair the utility with a background color from the Colors foundation; the frame supplies edge treatment while bg-background-* establishes the surface fill and visual distinction."
      >
        <Demo
          code={`<div className="surface-frame bg-background-secondary min-h-24 w-64 p-4 text-sm">
  New surface
</div>`}
        >
          <div className="surface-frame bg-background-secondary min-h-24 w-64 p-4 text-sm">
            New surface
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Elevation"
        description="Use the elevation utility to control only the ambient drop shadow."
      >
        <Demo
          code={`<div className="surface-frame bg-background-secondary surface-frame-elevation-none min-h-20 w-40 p-3 text-xs">None</div>
<div className="surface-frame bg-background-secondary surface-frame-elevation-sm min-h-20 w-40 p-3 text-xs">Small</div>
<div className="surface-frame bg-background-secondary surface-frame-elevation-md min-h-20 w-40 p-3 text-xs">Medium</div>
<div className="surface-frame bg-background-secondary surface-frame-elevation-lg min-h-20 w-40 p-3 text-xs">Large</div>`}
        >
          <div className="surface-frame bg-background-secondary surface-frame-elevation-none min-h-20 w-40 p-3 text-xs">
            None
          </div>
          <div className="surface-frame bg-background-secondary surface-frame-elevation-sm min-h-20 w-40 p-3 text-xs">
            Small
          </div>
          <div className="surface-frame bg-background-secondary surface-frame-elevation-md min-h-20 w-40 p-3 text-xs">
            Medium
          </div>
          <div className="surface-frame bg-background-secondary surface-frame-elevation-lg min-h-20 w-40 p-3 text-xs">
            Large
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Halo and bevel"
        description="Halo controls the detached outer ring and is always opt-in; bevel controls the inner edge highlight."
      >
        <Demo
          code={`<div className="surface-frame bg-background-tertiary surface-frame-halo-none surface-frame-bevel-none min-h-20 w-40 p-3 text-xs">None</div>
<div className="surface-frame bg-background-tertiary surface-frame-halo-subtle surface-frame-bevel-subtle min-h-20 w-40 p-3 text-xs">Subtle</div>
<div className="surface-frame bg-background-tertiary surface-frame-halo-strong surface-frame-bevel-strong min-h-20 w-40 p-3 text-xs">Strong</div>`}
        >
          <div className="surface-frame bg-background-tertiary surface-frame-halo-none surface-frame-bevel-none min-h-20 w-40 p-3 text-xs">
            None
          </div>
          <div className="surface-frame bg-background-tertiary surface-frame-halo-subtle surface-frame-bevel-subtle min-h-20 w-40 p-3 text-xs">
            Subtle
          </div>
          <div className="surface-frame bg-background-tertiary surface-frame-halo-strong surface-frame-bevel-strong min-h-20 w-40 p-3 text-xs">
            Strong
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Custom utility values"
        description="Use the documented CSS variables for exceptional colors or backdrop contexts; prefer the named utility variants for normal usage."
      >
        <Demo
          code={`<div
  className="surface-frame bg-background-secondary surface-frame-halo-default min-h-20 w-64 p-4 text-sm"
  style={
    {
      "--surface-frame-bevel-color": "var(--color-border-tertiary)",
    } as React.CSSProperties
  }
>
  Custom bevel color
</div>`}
        >
          <div
            className="surface-frame bg-background-secondary surface-frame-halo-default min-h-20 w-64 p-4 text-sm"
            style={
              {
                "--surface-frame-bevel-color": "var(--color-border-tertiary)",
              } as React.CSSProperties
            }
          >
            Custom bevel color
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Use the component when needed"
        description="SurfaceFrame is a secondary wrapper around the same utility recipe. Use it when you want a component API or need the Base UI render prop; otherwise, keep the existing element and use classes."
      >
        <Demo
          code={`<SurfaceFrame
  elevation="md"
  halo="default"
  className="bg-background-secondary min-h-24 w-64 p-4 text-sm"
>
  Component wrapper
</SurfaceFrame>`}
        >
          <SurfaceFrame
            elevation="md"
            halo="default"
            className="bg-background-secondary min-h-24 w-64 p-4 text-sm"
          >
            Component wrapper
          </SurfaceFrame>
        </Demo>
      </DocSection>

      <DocSection
        title="API"
        description="Use utility classes as the main API. SurfaceFrame exposes the same intensity controls as props when a wrapper is useful."
      >
        <PropsTable
          rows={[
            {
              default: '"sm"',
              description:
                "Base utility that applies the ring, bevel, halo variables, and elevation shadow; pair it with a bg-background-* utility for the surface fill.",
              name: "surface-frame",
              type: "class",
            },
            {
              default: '"sm"',
              description:
                "Utility suffix controls the ambient drop-shadow strength.",
              name: "surface-frame-elevation-*",
              type: '"none" | "sm" | "md" | "lg"',
            },
            {
              default: '"none"',
              description:
                "Utility suffix controls the detached outer ring strength.",
              name: "surface-frame-halo-*",
              type: '"none" | "subtle" | "default" | "strong"',
            },
            {
              default: '"subtle"',
              description: "Utility suffix controls the inner bevel strength.",
              name: "surface-frame-bevel-*",
              type: '"none" | "subtle" | "strong"',
            },
            {
              default: '"sm"',
              description:
                "SurfaceFrame prop for ambient drop-shadow strength.",
              name: "elevation",
              type: '"none" | "sm" | "md" | "lg"',
            },
            {
              default: '"none"',
              description:
                "SurfaceFrame prop for detached outer ring strength.",
              name: "halo",
              type: '"none" | "subtle" | "default" | "strong"',
            },
            {
              default: '"subtle"',
              description:
                "SurfaceFrame prop for inner bevel strength. It flips direction with the color mode.",
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
