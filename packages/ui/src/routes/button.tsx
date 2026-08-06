import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { Plus } from "lucide-react";

import {
  Demo,
  DocPage,
  DocSection,
  PropsTable,
} from "./-components/doc-kit";
import type { ComponentMeta } from "./-components/doc-kit";

export const meta: ComponentMeta = {
  description:
    "An accessible action control with size and variant styles. Primary, secondary, outline, and destructive use the Surface Frame edge recipe.",
  import: 'import { Button } from "@workspace/ui/components/button";',
  name: "Button",
  related: ["ActionButton", "Surface Frame", "Badge"],
  status: "stable",
  whenNotToUse: [
    "Navigation whose only job is to go somewhere — render a Link/a with the Button render prop, or use a text link.",
    "Toggling a binary option — use Switch, Checkbox, or Toggle.",
    "Choosing one value from a set — use Select, RadioGroup, or Combobox.",
  ],
  whenToUse: [
    "Triggering an immediate action (submit, apply, dismiss, open a dialog).",
    "One primary call-to-action per screen or dialog (variant=\"primary\").",
    "Toolbar or dense actions where size=\"sm\" or icon sizes fit the layout.",
  ],
};

export const Route = createFileRoute("/button" as unknown as "/button")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <DocPage meta={meta}>
      <DocSection
        title="Variants"
        description="Primary, secondary, and destructive use Surface Frame with bevel + elevation-xs; outline uses the frame edge without bevel. Ghost and link stay flat."
      >
        <Demo
          code={`<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="link">Link</Button>
<Button variant="destructive">Destructive</Button>`}
        >
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive">Destructive</Button>
        </Demo>
      </DocSection>

      <DocSection
        title="Sizes"
        description="Height and padding scale. Prefer md for most UI; sm for dense tables and toolbars; lg/xl for prominent CTAs."
      >
        <Demo
          code={`<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
<Button size="xl">Extra large</Button>`}
        >
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="xl">Extra large</Button>
        </Demo>
      </DocSection>

      <DocSection
        title="Icons"
        description="Leading icons add purpose; trailing icons signal a side effect (navigate, download). Icon-only sizes need an aria-label (and usually a tooltip)."
      >
        <Demo
          code={`<Button><Plus />Add label</Button>
<Button variant="outline">Export<Plus /></Button>
<Button size="icon" aria-label="Add"><Plus /></Button>
<Button variant="secondary" size="icon-sm" aria-label="Add"><Plus /></Button>`}
        >
          <Button>
            <Plus />
            Add label
          </Button>
          <Button variant="outline">
            Export
            <Plus />
          </Button>
          <Button size="icon" aria-label="Add">
            <Plus />
          </Button>
          <Button variant="secondary" size="icon-sm" aria-label="Add">
            <Plus />
          </Button>
        </Demo>
      </DocSection>

      <DocSection
        title="States"
        description="Disabled removes pointer events. Invalid is for form validation feedback on the control itself."
      >
        <Demo
          code={`<Button disabled>Disabled</Button>
<Button variant="outline" disabled>Disabled outline</Button>
<Button aria-invalid="true">Invalid</Button>
<Button variant="secondary" aria-invalid="true">Invalid secondary</Button>`}
        >
          <Button disabled>Disabled</Button>
          <Button variant="outline" disabled>
            Disabled outline
          </Button>
          <Button aria-invalid="true">Invalid</Button>
          <Button variant="secondary" aria-invalid="true">
            Invalid secondary
          </Button>
        </Demo>
      </DocSection>

      <DocSection
        title="API"
        description="Props in addition to the native button props from Base UI (including render for element substitution)."
      >
        <PropsTable
          rows={[
            {
              default: '"primary"',
              description:
                "Visual style. primary / secondary / outline / destructive use Surface Frame; ghost and link stay flat.",
              name: "variant",
              type: '"primary" | "secondary" | "outline" | "ghost" | "link" | "destructive"',
            },
            {
              default: '"md"',
              description: "Control height, padding, and radius.",
              name: "size",
              type: '"sm" | "md" | "lg" | "xl" | "icon" | "icon-sm" | "icon-lg" | "icon-xl"',
            },
            {
              default: "false",
              description:
                "Appends an external-link icon and sr-only “(opens in new window)” text.",
              name: "externalLink",
              type: "boolean",
            },
            {
              description:
                "Base UI render prop — swap the host element (e.g. Link) while keeping styles.",
              name: "render",
              type: "ReactElement | (props) => ReactElement",
            },
          ]}
        />
      </DocSection>
    </DocPage>
  );
}
