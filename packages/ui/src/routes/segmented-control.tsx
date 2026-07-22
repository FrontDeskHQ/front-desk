import { createFileRoute } from "@tanstack/react-router";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@workspace/ui/components/segmented-control";
import { LayoutGrid, List, Table } from "lucide-react";
import { useState } from "react";

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
    "A single-select control for choosing one option from a small set of mutually exclusive, parallel choices laid out inline.",
  import:
    'import { SegmentedControl, SegmentedControlItem } from "@workspace/ui/components/segmented-control";',
  name: "Segmented Control",
  related: ["ToggleGroup", "Tabs", "RadioGroup", "Select"],
  status: "stable",
  whenNotToUse: [
    "Multiple options can be on at once — use ToggleGroup with `multiple`.",
    "Switching which content panel is shown — use Tabs.",
    "More than ~5 options, or long labels — use Select.",
  ],
  whenToUse: [
    "Picking exactly one of 2–5 short, parallel options (e.g. an autonomy level: Off / Suggest / Auto).",
    "The choice is a form value that drives state elsewhere, and all options should stay visible.",
  ],
};

export const Route = createFileRoute(
  "/segmented-control" as unknown as "/segmented-control"
)({
  component: RouteComponent,
});

function RouteComponent() {
  const [level, setLevel] = useState("suggest");
  const [view, setView] = useState("list");

  return (
    <DocPage meta={meta}>
      <DocSection
        title="Basic"
        description="Single-select with a clean string value — no arrays. Exactly one segment is always selected."
      >
        <Demo
          code={`const [level, setLevel] = useState("suggest");

<SegmentedControl value={level} onValueChange={setLevel}>
  <SegmentedControlItem value="off">Off</SegmentedControlItem>
  <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
  <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
</SegmentedControl>`}
        >
          <SegmentedControl value={level} onValueChange={setLevel}>
            <SegmentedControlItem value="off">Off</SegmentedControlItem>
            <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
            <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
          </SegmentedControl>
        </Demo>
      </DocSection>

      <DocSection title="Sizes">
        <Demo
          code={`<SegmentedControl size="sm" defaultValue="suggest"> … </SegmentedControl>
<SegmentedControl size="md" defaultValue="suggest"> … </SegmentedControl>
<SegmentedControl size="lg" defaultValue="suggest"> … </SegmentedControl>`}
        >
          <SegmentedControl size="sm" defaultValue="suggest">
            <SegmentedControlItem value="off">Off</SegmentedControlItem>
            <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
            <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
          </SegmentedControl>
          <SegmentedControl size="md" defaultValue="suggest">
            <SegmentedControlItem value="off">Off</SegmentedControlItem>
            <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
            <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
          </SegmentedControl>
          <SegmentedControl size="lg" defaultValue="suggest">
            <SegmentedControlItem value="off">Off</SegmentedControlItem>
            <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
            <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
          </SegmentedControl>
        </Demo>
      </DocSection>

      <DocSection
        title="Equal width"
        description="Segments hug their content by default. Add flex-1 to each item to split the track evenly, and a width on the control to bound it."
      >
        <Demo
          code={`<SegmentedControl defaultValue="suggest" className="w-72">
  <SegmentedControlItem value="off" className="flex-1">Off</SegmentedControlItem>
  <SegmentedControlItem value="suggest" className="flex-1">Suggest</SegmentedControlItem>
  <SegmentedControlItem value="auto" className="flex-1">Auto</SegmentedControlItem>
</SegmentedControl>`}
        >
          <SegmentedControl defaultValue="suggest" className="w-72">
            <SegmentedControlItem value="off" className="flex-1">
              Off
            </SegmentedControlItem>
            <SegmentedControlItem value="suggest" className="flex-1">
              Suggest
            </SegmentedControlItem>
            <SegmentedControlItem value="auto" className="flex-1">
              Auto
            </SegmentedControlItem>
          </SegmentedControl>
        </Demo>
      </DocSection>

      <DocSection
        title="With icons"
        description="Compose icons and text as children. Icon-only items need an aria-label."
      >
        <Demo
          code={`const [view, setView] = useState("list");

<SegmentedControl value={view} onValueChange={setView}>
  <SegmentedControlItem value="list">
    <List /> List
  </SegmentedControlItem>
  <SegmentedControlItem value="grid">
    <LayoutGrid /> Grid
  </SegmentedControlItem>
  <SegmentedControlItem value="table" aria-label="Table">
    <Table />
  </SegmentedControlItem>
</SegmentedControl>`}
        >
          <SegmentedControl value={view} onValueChange={setView}>
            <SegmentedControlItem value="list">
              <List /> List
            </SegmentedControlItem>
            <SegmentedControlItem value="grid">
              <LayoutGrid /> Grid
            </SegmentedControlItem>
            <SegmentedControlItem value="table" aria-label="Table">
              <Table />
            </SegmentedControlItem>
          </SegmentedControl>
        </Demo>
      </DocSection>

      <DocSection
        title="Vertical"
        description="Pass orientation='vertical' to stack segments; arrow keys follow the axis."
      >
        <Demo
          code={`<SegmentedControl orientation="vertical" defaultValue="suggest">
  <SegmentedControlItem value="off">Off</SegmentedControlItem>
  <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
  <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
</SegmentedControl>`}
        >
          <SegmentedControl orientation="vertical" defaultValue="suggest">
            <SegmentedControlItem value="off">Off</SegmentedControlItem>
            <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
            <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
          </SegmentedControl>
        </Demo>
      </DocSection>

      <DocSection
        title="States"
        description="Disable the whole control, or an individual segment (skipped during keyboard navigation)."
      >
        <Demo
          code={`<SegmentedControl disabled defaultValue="suggest"> … </SegmentedControl>

<SegmentedControl defaultValue="off">
  <SegmentedControlItem value="off">Off</SegmentedControlItem>
  <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
  <SegmentedControlItem value="auto" disabled>Auto</SegmentedControlItem>
</SegmentedControl>`}
        >
          <SegmentedControl disabled defaultValue="suggest">
            <SegmentedControlItem value="off">Off</SegmentedControlItem>
            <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
            <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
          </SegmentedControl>
          <SegmentedControl defaultValue="off">
            <SegmentedControlItem value="off">Off</SegmentedControlItem>
            <SegmentedControlItem value="suggest">Suggest</SegmentedControlItem>
            <SegmentedControlItem value="auto" disabled>
              Auto
            </SegmentedControlItem>
          </SegmentedControl>
        </Demo>
      </DocSection>

      <DocSection
        title="API"
        description="SegmentedControl props in addition to the native div / Base UI ToggleGroup props."
      >
        <PropsTable
          rows={[
            {
              description: "Selected segment value (controlled).",
              name: "value",
              type: "string",
            },
            {
              description: "Initially selected segment value (uncontrolled).",
              name: "defaultValue",
              type: "string",
            },
            {
              description:
                "Fired with the newly selected value. Never fires empty — one segment is always selected.",
              name: "onValueChange",
              type: "(value: string, details) => void",
            },
            {
              default: '"md"',
              description:
                "Control height and text size, shared with all items.",
              name: "size",
              type: '"sm" | "md" | "lg"',
            },
            {
              default: '"horizontal"',
              description: "Layout axis and arrow-key navigation direction.",
              name: "orientation",
              type: '"horizontal" | "vertical"',
            },
            {
              default: "false",
              description: "Disable the entire control.",
              name: "disabled",
              type: "boolean",
            },
          ]}
        />
      </DocSection>

      <DocSection
        title="Item API"
        description="SegmentedControlItem props in addition to the native button props."
      >
        <PropsTable
          rows={[
            {
              description:
                "Identifies the segment; matched against the control value.",
              name: "value",
              type: "string",
            },
            {
              default: "false",
              description: "Disable this segment only.",
              name: "disabled",
              type: "boolean",
            },
            {
              description:
                "Base UI render prop — substitute the underlying element (e.g. a Link).",
              name: "render",
              type: "ReactElement | function",
            },
          ]}
        />
      </DocSection>

      <DocSection title="Anatomy" description="How the parts nest.">
        <Anatomy
          code={`<SegmentedControl value={value} onValueChange={setValue}>
  <SegmentedControlItem value="a">A</SegmentedControlItem>
  <SegmentedControlItem value="b">B</SegmentedControlItem>
</SegmentedControl>`}
        />
      </DocSection>
    </DocPage>
  );
}
