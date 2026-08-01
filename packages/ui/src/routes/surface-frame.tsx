import { createFileRoute } from "@tanstack/react-router";
import { SurfaceFrame } from "@workspace/ui/components/surface-frame";
import type * as React from "react";

import { Demo, DocPage, DocSection, PropsTable } from "./-components/doc-kit";
import type { ComponentMeta } from "./-components/doc-kit";

export const meta: ComponentMeta = {
  description:
    "A Tailwind utility recipe for smooth stacked shadows, an inner bevel, a 1px edge, an optional halo, and a SurfaceFrame wrapper for component APIs.",
  import:
    'import { SurfaceFrame } from "@workspace/ui/components/surface-frame";',
  name: "Surface Frame",
  status: "beta",
  whenNotToUse: [
    "Use a plain border or shadow when the element is not a new surface in its local composition.",
    "Do not add a separate border or ring to the same element; SurfaceFrame already supplies its edge treatment.",
    "Use the SurfaceFrame component only when utility classes are not enough for the composition.",
  ],
  whenToUse: [
    "Use it when declaring a new surface: any element you decide should read as its own visual layer.",
    "Pair it with a background utility from the Colors foundation, such as bg-background-secondary or bg-background-tertiary, to establish fill and visual distinction.",
    "Start with the surface-frame utility classes, and choose SurfaceFrame only when the frame needs a component API or Base UI render prop.",
  ],
  related: ["Colors", "Card"],
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
          code={`<div className="surface-frame rounded-xl bg-background-secondary min-h-24 w-64 p-4 text-sm">
  New surface
</div>`}
        >
          <div className="surface-frame rounded-xl bg-background-secondary min-h-24 w-64 p-4 text-sm">
            New surface
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Elevation"
        description="Use the elevation utility to control the smooth stacked shadow. The scale is adapted from flornkm/shadow-plugin and can use Tailwind shadow colors through --tw-shadow-color."
      >
        <Demo
          code={`<div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-none min-h-20 w-28 p-3 text-xs">None</div>
<div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-xs min-h-20 w-28 p-3 text-xs">Extra small</div>
<div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-sm min-h-20 w-28 p-3 text-xs">Small</div>
<div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-md min-h-20 w-28 p-3 text-xs">Medium</div>
<div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-lg min-h-20 w-28 p-3 text-xs">Large</div>
<div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-xl min-h-20 w-28 p-3 text-xs">Extra large</div>
<div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-2xl min-h-20 w-28 p-3 text-xs">2XL</div>`}
          className="py-48"
        >
          <div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-none min-h-20 w-28 p-3 text-xs">
            None
          </div>
          <div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-xs min-h-20 w-28 p-3 text-xs">
            Extra small
          </div>
          <div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-sm min-h-20 w-28 p-3 text-xs">
            Small
          </div>
          <div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-md min-h-20 w-28 p-3 text-xs">
            Medium
          </div>
          <div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-lg min-h-20 w-28 p-3 text-xs">
            Large
          </div>
          <div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-xl min-h-20 w-28 p-3 text-xs">
            Extra large
          </div>
          <div className="surface-frame rounded-xl bg-background-secondary surface-frame-elevation-2xl min-h-20 w-28 p-3 text-xs">
            2XL
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Inner bevel"
        description="Bevel adds an inset edge highlight. The direction flips with the color mode, and dark mode uses a stronger token opacity so the highlight remains visible on dark surfaces."
      >
        <Demo
          code={`<div className="surface-frame rounded-xl bg-background-tertiary surface-frame-bevel-none min-h-20 w-40 p-3 text-xs">None</div>
<div className="surface-frame rounded-xl bg-background-tertiary surface-frame-bevel-subtle min-h-20 w-40 p-3 text-xs">Subtle</div>
<div className="surface-frame rounded-xl bg-background-tertiary surface-frame-bevel-strong min-h-20 w-40 p-3 text-xs">Strong</div>`}
        >
          <div className="surface-frame rounded-xl bg-background-tertiary surface-frame-bevel-none min-h-20 w-40 p-3 text-xs">
            None
          </div>
          <div className="surface-frame rounded-xl bg-background-tertiary surface-frame-bevel-subtle min-h-20 w-40 p-3 text-xs">
            Subtle
          </div>
          <div className="surface-frame rounded-xl bg-background-tertiary surface-frame-bevel-strong min-h-20 w-40 p-3 text-xs">
            Strong
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Optional halo"
        description="Halo controls the detached outer ring and is always opt-in. The base 1px edge remains present at every halo setting."
      >
        <Demo
          code={`<div className="surface-frame rounded-xl bg-background-tertiary surface-frame-halo-none min-h-20 w-40 p-3 text-xs">None</div>
<div className="surface-frame rounded-xl bg-background-tertiary surface-frame-halo-subtle min-h-20 w-40 p-3 text-xs">Subtle</div>
<div className="surface-frame rounded-xl bg-background-tertiary surface-frame-halo-default min-h-20 w-40 p-3 text-xs">Default</div>
<div className="surface-frame rounded-xl bg-background-tertiary surface-frame-halo-strong min-h-20 w-40 p-3 text-xs">Strong</div>`}
        >
          <div className="surface-frame rounded-xl bg-background-tertiary surface-frame-halo-none min-h-20 w-40 p-3 text-xs">
            None
          </div>
          <div className="surface-frame rounded-xl bg-background-tertiary surface-frame-halo-subtle min-h-20 w-40 p-3 text-xs">
            Subtle
          </div>
          <div className="surface-frame rounded-xl bg-background-tertiary surface-frame-halo-default min-h-20 w-40 p-3 text-xs">
            Default
          </div>
          <div className="surface-frame rounded-xl bg-background-tertiary surface-frame-halo-strong min-h-20 w-40 p-3 text-xs">
            Strong
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Custom halo values"
        description="Use --surface-frame-halo-color for exceptional halo colors and --surface-frame-backdrop to match a halo gap to its surrounding surface; prefer named utility variants for normal usage."
      >
        <Demo
          code={`<div
  className="surface-frame rounded-xl bg-background-secondary surface-frame-halo-default min-h-20 w-64 p-4 text-sm"
  style={
    {
      "--surface-frame-halo-color": "var(--color-border-tertiary)",
    } as React.CSSProperties
  }
>
  Custom halo color
</div>`}
        >
          <div
            className="surface-frame rounded-xl bg-background-secondary surface-frame-halo-default min-h-20 w-64 p-4 text-sm"
            style={
              {
                "--surface-frame-halo-color": "var(--color-border-tertiary)",
              } as React.CSSProperties
            }
          >
            Custom halo color
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
                "Base utility that applies the smooth stacked shadow, inner bevel, 1px edge, and halo variables; pair it with a bg-background-* utility for the surface fill.",
              name: "surface-frame",
              type: "class",
            },
            {
              default: '"sm"',
              description: "Utility suffix selects the stacked shadow scale.",
              name: "surface-frame-elevation-*",
              type: '"none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl"',
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
              description:
                "Utility suffix controls the inset edge highlight. Its direction and opacity adapt to the color mode.",
              name: "surface-frame-bevel-*",
              type: '"none" | "subtle" | "strong"',
            },
            {
              default: '"sm"',
              description: "SurfaceFrame prop for the stacked shadow scale.",
              name: "elevation",
              type: '"none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl"',
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
                "SurfaceFrame prop for the inset edge highlight. It adapts to the color mode.",
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
