import { createFileRoute } from "@tanstack/react-router";
import { SurfaceFrame } from "@workspace/ui/components/surface-frame";
import { cn } from "@workspace/ui/lib/utils";
import { TextCursor } from "lucide-react";
import { useState } from "react";
import type * as React from "react";

export const Route = createFileRoute(
  "/app/_workspace/_main/playground/card-frame"
)({
  component: CardFramePlaygroundPage,
});

/**
 * Frame geometry. The outer radius drives everything else:
 *   inner surface (::before) = outer - 1px  (inner curve of a 1px border)
 *   halo ring (::after)      = outer + halo offset (concentric)
 */
const FRAME_RADIUS = "var(--radius-xl)"; // 14px
const INNER_RADIUS = `calc(${FRAME_RADIUS} - 1px)`;
const HALO_OFFSET = 5;
const HALO_RADIUS = `calc(${FRAME_RADIUS} + ${HALO_OFFSET}px)`;

interface Layers {
  halo: boolean;
  shadow: boolean;
  bevel: boolean;
  clipPadding: boolean;
  tightHalo: boolean;
}

function CardFrame({
  layers,
  className,
  children,
}: {
  layers: Layers;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="card-frame"
      style={
        {
          "--frame-radius": FRAME_RADIUS,
          "--frame-inner-radius": INNER_RADIUS,
          "--frame-halo-radius": layers.tightHalo ? FRAME_RADIUS : HALO_RADIUS,
        } as React.CSSProperties
      }
      className={cn(
        "relative flex w-full flex-col rounded-[var(--frame-radius)] border border-border-primary bg-background-primary text-foreground-primary",

        // Layer 3 — let a translucent border blend with what's behind the card
        // instead of with the card's own fill. No-op in dark mode by design.
        layers.clipPadding && "not-dark:bg-clip-padding",

        // Layer 2
        layers.shadow && "shadow-xs/5",

        // Layer 4 — fills the padding box exactly, so it never covers the border.
        // Carries only the bevel: a zero-blur shadow bleeding 1px past the
        // pseudo-element paints a hard line over the parent's border.
        // Down + dark in light mode, up + light in dark mode.
        layers.bevel &&
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-[var(--frame-inner-radius)] before:shadow-[0_1px_--alpha(var(--color-black)/4%)] dark:before:shadow-[0_-1px_--alpha(var(--color-white)/6%)]",

        // Layer 1 — behind the frame's own background, so only the outside shows.
        layers.halo &&
          "after:pointer-events-none after:absolute after:-inset-[5px] after:-z-1 after:rounded-[var(--frame-halo-radius)] after:border after:border-border-primary/64",

        className
      )}
    >
      {children}
    </div>
  );
}

function FrameHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex flex-col gap-1 px-5 py-4">
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="text-foreground-secondary text-sm">{description}</p>
    </div>
  );
}

/**
 * Inner panel, mounted flush into the frame: pulled out 1px so its border lands
 * exactly on the frame's, then clipped 1px on the sides (always) and on the
 * bottom (only because it is the last child here).
 */
function FramePanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-slot="card-panel"
      className={cn(
        "-m-px relative flex min-h-48 flex-1 flex-col rounded-[var(--frame-inner-radius)] border border-border-primary bg-background-secondary",
        "[clip-path:inset(-1rem_1px_1px_1px_round_var(--frame-inner-radius))]"
      )}
    >
      {children}
    </div>
  );
}

function getSurfaceFrameVariants(layers: Layers) {
  return {
    bevel: layers.bevel ? "subtle" : "none",
    elevation: layers.shadow ? "sm" : "none",
    halo: layers.halo ? "default" : "none",
  } as const;
}

/** Inner panel for the shadow variant — an inset ring, no overlap trick needed. */
function ShadowPanel({ children }: { children?: React.ReactNode }) {
  return (
    <div
      style={{
        borderRadius: INNER_RADIUS,
        boxShadow: "inset 0 0 0 1px var(--color-border-primary)",
      }}
      className="relative flex min-h-48 flex-1 flex-col bg-background-secondary"
    >
      {children}
    </div>
  );
}

const LAYER_CONTROLS: { key: keyof Layers; label: string; hint: string }[] = [
  { key: "halo", label: "Halo ring", hint: "::after, 5px out, 64% border" },
  { key: "shadow", label: "Drop shadow", hint: "shadow-xs/5" },
  { key: "bevel", label: "Inner bevel", hint: "1px hard shadow on ::before" },
  {
    key: "clipPadding",
    label: "bg-clip-padding",
    hint: "light mode only; matters for translucent borders",
  },
  {
    key: "tightHalo",
    label: "Tight halo radius",
    hint: "reproduces the non-concentric radius from the reference",
  },
];

function CardFramePlaygroundPage() {
  const [layers, setLayers] = useState<Layers>({
    bevel: true,
    clipPadding: true,
    halo: true,
    shadow: true,
    tightHalo: false,
  });

  const toggle = (key: keyof Layers) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="flex flex-col gap-8 overflow-y-auto p-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-lg">Card frame</h1>
        <p className="text-foreground-secondary text-sm">
          Layered outline: halo ring, drop shadow, 1px border, inner bevel.
          Toggle layers to see what each contributes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LAYER_CONTROLS.map(({ key, label, hint }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-pressed={layers[key]}
            title={hint}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm transition-colors",
              layers[key]
                ? "border-border-tertiary bg-background-tertiary"
                : "border-border-primary text-foreground-secondary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid max-w-4xl grid-cols-1 gap-10 md:grid-cols-2">
        <CardFrame layers={layers}>
          <FrameHeader
            title="Autocomplete"
            description="An input that suggests options as you type."
          />
          <FramePanel>
            <div className="flex flex-1 items-center justify-center px-8">
              <div className="flex w-full max-w-56 flex-col gap-2">
                <div className="relative flex w-full flex-col rounded-[10px] border border-border-primary bg-background-secondary shadow-md/5 not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[9px] before:shadow-[0_-1px_--alpha(var(--color-white)/6%),0_1px_--alpha(var(--color-black)/6%)]">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <div className="h-1.5 w-[40%] rounded-full bg-foreground-tertiary/40" />
                    <TextCursor className="size-4 text-foreground-tertiary/88" />
                  </div>
                </div>
                <div className="relative flex w-full flex-col rounded-[10px] border border-border-primary bg-background-secondary shadow-md/5 not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[9px] before:shadow-[0_-1px_--alpha(var(--color-white)/6%),0_1px_--alpha(var(--color-black)/6%)]">
                  <div className="flex flex-col gap-3 p-3">
                    <div className="h-1.5 rounded-full bg-foreground-tertiary/20" />
                    <div className="h-1.5 rounded-full bg-foreground-tertiary/20" />
                    <div className="h-1.5 rounded-full bg-foreground-tertiary/20" />
                  </div>
                </div>
              </div>
            </div>
          </FramePanel>
        </CardFrame>

        <CardFrame layers={layers}>
          <FrameHeader
            title="Empty frame"
            description="The outline on its own, with no nested panel."
          />
          <div className="relative min-h-48 flex-1" />
        </CardFrame>
      </div>

      <div className="flex max-w-4xl flex-col gap-3">
        <h2 className="font-semibold text-sm">Box-shadow only</h2>
        <p className="max-w-2xl text-foreground-secondary text-sm">
          Same outline with no border and no pseudo-elements — one box-shadow
          stack on a single element. The toggles above drive both. The
          bg-clip-padding toggle has no effect here: outer shadows are already
          clipped to outside the border box.
        </p>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <CardFrame layers={layers}>
              <FrameHeader
                title="Border + pseudo-elements"
                description="Three elements' worth of paint."
              />
              <FramePanel>
                <div className="flex-1" />
              </FramePanel>
            </CardFrame>
            <span className="text-foreground-secondary text-xs">
              border, ::before, ::after
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <SurfaceFrame
              {...getSurfaceFrameVariants(layers)}
              className="flex w-full flex-col"
            >
              <FrameHeader
                title="Box-shadow only"
                description="One element, one property."
              />
              <ShadowPanel>
                <div className="flex-1" />
              </ShadowPanel>
            </SurfaceFrame>
            <span className="text-foreground-secondary text-xs">
              box-shadow &times; {layers.halo ? 4 : 2}
            </span>
          </div>
        </div>
      </div>

      <div className="flex max-w-4xl flex-col gap-3">
        <h2 className="font-semibold text-sm">Layers in isolation</h2>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {(
            [
              ["Border only", { bevel: false, halo: false, shadow: false }],
              ["+ bevel", { bevel: true, halo: false, shadow: false }],
              ["+ shadow", { bevel: true, halo: false, shadow: true }],
              ["+ halo", { bevel: true, halo: true, shadow: true }],
            ] as const
          ).map(([label, override]) => (
            <div key={label} className="flex flex-col gap-2">
              <CardFrame layers={{ ...layers, ...override }} className="h-24" />
              <span className="text-foreground-secondary text-xs">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
