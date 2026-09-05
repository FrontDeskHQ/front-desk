import { createFileRoute } from "@tanstack/react-router";
import { SurfaceFrame } from "@workspace/ui/components/surface-frame";
import type * as React from "react";

import { Demo, DocPage, DocSection, PropsTable } from "./-components/doc-kit";
import type { ComponentMeta } from "./-components/doc-kit";

export const meta: ComponentMeta = {
  description:
    "A faux-border surface with inset chrome, stacked elevation, a mode-aware bevel, and an optional detached halo. Available as utilities or a SurfaceFrame wrapper.",
  import:
    'import { SurfaceFrame } from "@workspace/ui/components/surface-frame";',
  name: "Surface Frame",
  status: "beta",
  whenNotToUse: [
    "Both pseudo-elements are reserved. Set the fill with before:bg-*; do not apply a root background utility.",
    "Use a plain border or shadow when the element is not a new surface in its local composition.",
    "Do not add a separate border or ring to the same element; SurfaceFrame already supplies its edge treatment.",
    "Use the SurfaceFrame component only when utility classes are not enough for the composition.",
  ],
  whenToUse: [
    "Use it when declaring a new surface: any element you decide should read as its own visual layer.",
    "Pair it with a before: background utility from the Colors foundation, such as before:bg-background-secondary or before:bg-background-tertiary, to establish fill and visual distinction.",
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
        description="Use Surface Frame for an element that should read as its own visual layer. The consuming feature defines that boundary. Pair the utility with a background color from the Colors foundation; the frame supplies edge treatment while before:bg-background-* establishes the surface fill and visual distinction."
      >
        <Demo
          code={`<div className="surface-frame rounded-xl before:bg-background-secondary min-h-24 w-64 p-4 text-sm">
  New surface
</div>`}
        >
          <div className="surface-frame rounded-xl before:bg-background-secondary min-h-24 w-64 p-4 text-sm">
            New surface
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Sizing parity with a real border"
        description="A transparent 1px border reserves layout space. The root background paints the faux edge, while an inset pseudo-element supplies the fill and casts elevation. A framed element occupies the same space as a bordered one. Stacked flush, the two edges stay collinear; at equal height and width, the two boxes render identically sized."
      >
        <Demo
          code={`<div className="flex flex-col">
  <div className="surface-frame surface-frame-bevel-none flex h-9 w-56 items-center rounded-none px-3 text-xs">
    surface-frame
  </div>
  <div className="border border-border-primary flex h-9 w-56 items-center rounded-none px-3 text-xs">
    border
  </div>
</div>

<div className="flex items-center gap-4">
  <div className="surface-frame surface-frame-bevel-none flex h-9 w-32 items-center justify-center rounded-md text-xs">
    surface-frame
  </div>
  <div className="border border-border-primary flex h-9 w-32 items-center justify-center rounded-md text-xs">
    border
  </div>
</div>`}
        >
          <div className="flex flex-col">
            <div className="surface-frame surface-frame-bevel-none flex h-9 w-56 items-center rounded-none px-3 text-xs">
              surface-frame
            </div>
            <div className="border border-border-primary rounded-none flex h-9 w-56 items-center px-3 text-xs">
              border
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="surface-frame surface-frame-bevel-none flex h-9 w-32 items-center justify-center rounded-md text-xs">
              surface-frame
            </div>
            <div className="border border-border-primary flex h-9 w-32 items-center justify-center rounded-md text-xs">
              border
            </div>
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Elevation"
        description="Use the elevation utility to control the smooth stacked shadow. The scale is adapted from flornkm/shadow-plugin and can use Tailwind shadow colors through --tw-shadow-color."
      >
        <Demo
          code={`<div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-none min-h-20 w-28 p-3 text-xs">None</div>
<div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-xs min-h-20 w-28 p-3 text-xs">Extra small</div>
<div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-sm min-h-20 w-28 p-3 text-xs">Small</div>
<div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-md min-h-20 w-28 p-3 text-xs">Medium</div>
<div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-lg min-h-20 w-28 p-3 text-xs">Large</div>
<div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-xl min-h-20 w-28 p-3 text-xs">Extra large</div>
<div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-2xl min-h-20 w-28 p-3 text-xs">2XL</div>`}
          className="py-48"
        >
          <div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-none min-h-20 w-28 p-3 text-xs">
            None
          </div>
          <div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-xs min-h-20 w-28 p-3 text-xs">
            Extra small
          </div>
          <div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-sm min-h-20 w-28 p-3 text-xs">
            Small
          </div>
          <div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-md min-h-20 w-28 p-3 text-xs">
            Medium
          </div>
          <div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-lg min-h-20 w-28 p-3 text-xs">
            Large
          </div>
          <div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-xl min-h-20 w-28 p-3 text-xs">
            Extra large
          </div>
          <div className="surface-frame rounded-xl before:bg-background-secondary surface-frame-elevation-2xl min-h-20 w-28 p-3 text-xs">
            2XL
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Edge bevel"
        description="Bevel adds a crisp bottom edge in light mode and a top highlight in dark mode. A separate pseudo-element draws it without moving the chrome or elevation shadow."
      >
        <Demo
          code={`<div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-bevel-none min-h-20 w-40 p-3 text-xs">None</div>
<div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-bevel-subtle min-h-20 w-40 p-3 text-xs">Subtle</div>
<div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-bevel-strong min-h-20 w-40 p-3 text-xs">Strong</div>`}
        >
          <div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-bevel-none min-h-20 w-40 p-3 text-xs">
            None
          </div>
          <div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-bevel-subtle min-h-20 w-40 p-3 text-xs">
            Subtle
          </div>
          <div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-bevel-strong min-h-20 w-40 p-3 text-xs">
            Strong
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Optional halo"
        description="Halo adds an outline with a transparent gap and is always opt-in. No backdrop color is painted between the edge and halo; the background and elevation shadow remain visible through the gap."
      >
        <Demo
          code={`<div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-halo-none min-h-20 w-40 p-3 text-xs">None</div>
<div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-halo-subtle min-h-20 w-40 p-3 text-xs">Subtle</div>
<div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-halo-default min-h-20 w-40 p-3 text-xs">Default</div>
<div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-halo-strong min-h-20 w-40 p-3 text-xs">Strong</div>`}
        >
          <div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-halo-none min-h-20 w-40 p-3 text-xs">
            None
          </div>
          <div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-halo-subtle min-h-20 w-40 p-3 text-xs">
            Subtle
          </div>
          <div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-halo-default min-h-20 w-40 p-3 text-xs">
            Default
          </div>
          <div className="surface-frame rounded-xl before:bg-background-tertiary surface-frame-halo-strong min-h-20 w-40 p-3 text-xs">
            Strong
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Transparent halo gap"
        description="The stripes remain visible through the halo gap. Elevation is disabled here so you can inspect the gap without a shadow. Opaque chrome fills cover the root tint; translucent fills allow that tint to show through."
      >
        <Demo
          code={`<div className="w-full bg-[repeating-linear-gradient(135deg,var(--color-background-primary)_0_12px,var(--color-background-tertiary)_12px_24px)] p-10">
  <SurfaceFrame elevation="none" halo="default" className="before:bg-background-secondary p-6">
    Background visible through the gap
  </SurfaceFrame>
</div>`}
        >
          <div className="w-full bg-[repeating-linear-gradient(135deg,var(--color-background-primary)_0_12px,var(--color-background-tertiary)_12px_24px)] p-10">
            <SurfaceFrame
              elevation="none"
              halo="default"
              className="before:bg-background-secondary p-6"
            >
              Background visible through the gap
            </SurfaceFrame>
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Custom halo values"
        description="Use --surface-frame-halo-color for exceptional halo colors. The gap is transparent and needs no backdrop token. Prefer named utility variants for normal usage."
      >
        <Demo
          code={`<div
  className="surface-frame rounded-xl before:bg-background-secondary surface-frame-halo-default min-h-20 w-64 p-4 text-sm"
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
            className="surface-frame rounded-xl before:bg-background-secondary surface-frame-halo-default min-h-20 w-64 p-4 text-sm"
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
  className="before:bg-background-secondary min-h-24 w-64 p-4 text-sm"
>
  Component wrapper
</SurfaceFrame>`}
        >
          <SurfaceFrame
            elevation="md"
            halo="default"
            className="before:bg-background-secondary min-h-24 w-64 p-4 text-sm"
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
                "Base utility that applies the inset chrome, stacked shadow, mode-aware bevel, faux edge, and halo variables; pair it with a before:bg-background-* utility for the surface fill.",
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
                "Utility suffix controls the crisp edge bevel. Its direction and opacity adapt to the color mode.",
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
                "SurfaceFrame prop for the crisp edge bevel. It adapts to the color mode.",
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
