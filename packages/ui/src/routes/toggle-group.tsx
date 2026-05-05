import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Underline,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/toggle-group")({
  component: RouteComponent,
});

function RouteComponent() {
  const [single, setSingle] = useState<string[]>(["center"]);
  const [multiple, setMultiple] = useState<string[]>(["bold"]);

  return (
    <div className="flex flex-col gap-8">
      <div className="text-lg">Toggle Group</div>

      <div className="flex flex-col gap-4">
        <div className="text-sm">Sizes (single select)</div>
        <div className="border rounded-md p-4 grid grid-cols-[120px_1fr] border-dashed gap-4 items-center">
          <div className="text-foreground-secondary text-sm">sm</div>
          <div>
            <ToggleGroup size="sm" value={single} onValueChange={setSingle}>
              <ToggleGroupItem value="left" className="px-4">Left</ToggleGroupItem>
              <ToggleGroupItem value="center" className="px-4">Center</ToggleGroupItem>
              <ToggleGroupItem value="right" className="px-4">Right</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="col-span-full border-t border-dashed h-px" />

          <div className="text-foreground-secondary text-sm">default</div>
          <div>
            <ToggleGroup value={single} onValueChange={setSingle}>
              <ToggleGroupItem value="left" className="px-4">Left</ToggleGroupItem>
              <ToggleGroupItem value="center" className="px-4">Center</ToggleGroupItem>
              <ToggleGroupItem value="right" className="px-4">Right</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="col-span-full border-t border-dashed h-px" />

          <div className="text-foreground-secondary text-sm">lg</div>
          <div>
            <ToggleGroup size="lg" value={single} onValueChange={setSingle}>
              <ToggleGroupItem value="left" className="px-4">Left</ToggleGroupItem>
              <ToggleGroupItem value="center" className="px-4">Center</ToggleGroupItem>
              <ToggleGroupItem value="right" className="px-4">Right</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="text-sm">With icons</div>
        <div className="border rounded-md p-4 grid grid-cols-[120px_1fr] border-dashed gap-4 items-center">
          <div className="text-foreground-secondary text-sm">Single</div>
          <div>
            <ToggleGroup value={single} onValueChange={setSingle}>
              <ToggleGroupItem value="left" aria-label="Align left">
                <AlignLeft />
              </ToggleGroupItem>
              <ToggleGroupItem value="center" aria-label="Align center">
                <AlignCenter />
              </ToggleGroupItem>
              <ToggleGroupItem value="right" aria-label="Align right">
                <AlignRight />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="col-span-full border-t border-dashed h-px" />

          <div className="text-foreground-secondary text-sm">Multiple</div>
          <div>
            <ToggleGroup multiple value={multiple} onValueChange={setMultiple}>
              <ToggleGroupItem value="bold" aria-label="Bold">
                <Bold />
              </ToggleGroupItem>
              <ToggleGroupItem value="italic" aria-label="Italic">
                <Italic />
              </ToggleGroupItem>
              <ToggleGroupItem value="underline" aria-label="Underline">
                <Underline />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="text-sm">States</div>
        <div className="border rounded-md p-4 grid grid-cols-[120px_1fr] border-dashed gap-4 items-center">
          <div className="text-foreground-secondary text-sm">Disabled group</div>
          <div>
            <ToggleGroup disabled value={["center"]}>
              <ToggleGroupItem value="left" className="px-4">Left</ToggleGroupItem>
              <ToggleGroupItem value="center" className="px-4">Center</ToggleGroupItem>
              <ToggleGroupItem value="right" className="px-4">Right</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="col-span-full border-t border-dashed h-px" />

          <div className="text-foreground-secondary text-sm">Disabled item</div>
          <div>
            <ToggleGroup defaultValue={["left"]}>
              <ToggleGroupItem value="left" className="px-4">Left</ToggleGroupItem>
              <ToggleGroupItem value="center" className="px-4" disabled>Center</ToggleGroupItem>
              <ToggleGroupItem value="right" className="px-4">Right</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="text-lg">Usage Guidelines</div>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-medium">Overview</div>
            <div className="text-sm space-y-2">
              <p>
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  ToggleGroup
                </code>{" "}
                is a segmented control built on{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  @base-ui/react
                </code>{" "}
                for choosing between a small set of options. It shares its visual
                language with{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  Tabs
                </code>{" "}
                — a muted track with a raised "pill" indicating the pressed state.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">When to use</div>
            <ul className="text-sm space-y-1.5 list-disc list-inside">
              <li>2–5 short, parallel options that fit on one line</li>
              <li>
                Default behaviour is single select. Add{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  multiple
                </code>{" "}
                for independent on/off toggles (e.g. text formatting)
              </li>
              <li>
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  value
                </code>{" "}
                is always an array — for single-select, pass{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  [current]
                </code>{" "}
                and read{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  v[0]
                </code>{" "}
                in{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  onValueChange
                </code>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">vs. Tabs</div>
            <div className="text-sm space-y-2">
              <p>
                Visually identical, but semantically different.{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  Tabs
                </code>{" "}
                switch which content panel is shown;{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  ToggleGroup
                </code>{" "}
                is a form control whose value drives state elsewhere. Pick based on
                what the click <em>does</em>.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Don'ts ✗</div>
            <ul className="text-sm space-y-1.5 list-disc list-inside">
              <li>Don't use for more than ~5 options — use a Select instead</li>
              <li>Don't use icon-only items without an aria-label</li>
              <li>
                Don't use to switch between content views — that's what{" "}
                <code className="px-1 py-0.5 bg-background-tertiary border font-mono rounded text-xs">
                  Tabs
                </code>{" "}
                are for
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Accessibility</div>
            <ul className="text-sm space-y-1.5 list-disc list-inside">
              <li>Arrow keys move focus between items; Space/Enter toggles</li>
              <li>Always provide aria-label on icon-only items</li>
              <li>Disabled items are skipped during keyboard navigation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
