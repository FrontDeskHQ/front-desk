// Docs page template — copy into packages/ui/src/routes/<name>.tsx
// Replace `Thing`/`thing`/`/thing`. Then register it in -components/sidebar.tsx.
//
// Structure is fixed (see DOCS_TEMPLATE.md): meta export → DocPage → Demos →
// PropsTable → Anatomy (compound only). Keep the `meta` export first and complete.

import { createFileRoute } from "@tanstack/react-router";
import { Thing } from "@workspace/ui/components/thing";

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
    "One sentence describing what Thing is and the job it does in the UI.",
  import: 'import { Thing } from "@workspace/ui/components/thing";',
  name: "Thing",
  related: ["Button", "Badge"],
  status: "stable",
  whenNotToUse: [
    "Situation where a different component fits better (name it).",
  ],
  whenToUse: [
    "Concrete situation where Thing is the right call.",
    "Another one.",
  ],
};

export const Route = createFileRoute(
  // Route tree is generated after adding new route files.
  "/thing" as unknown as "/thing"
)({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <DocPage meta={meta}>
      <DocSection title="Variants" description="Each visual variant of Thing.">
        <Demo code='<Thing variant="default">Default</Thing>'>
          <Thing variant="default">Default</Thing>
        </Demo>
      </DocSection>

      <DocSection title="Sizes">
        <Demo
          code={`<Thing size="sm" />
<Thing size="md" />
<Thing size="lg" />`}
        >
          <Thing size="sm">sm</Thing>
          <Thing size="md">md</Thing>
          <Thing size="lg">lg</Thing>
        </Demo>
      </DocSection>

      <DocSection
        title="States"
        description="Disabled, invalid, loading — whatever applies."
      >
        <Demo code="<Thing aria-disabled>Disabled</Thing>">
          <Thing aria-disabled>Disabled</Thing>
        </Demo>
      </DocSection>

      <DocSection
        title="API"
        description="Props in addition to the native element props."
      >
        <PropsTable
          rows={[
            {
              default: '"default"',
              description: "Visual style.",
              name: "variant",
              type: '"default"',
            },
            {
              default: '"md"',
              description: "Control height and padding.",
              name: "size",
              type: '"sm" | "md" | "lg"',
            },
          ]}
        />
      </DocSection>

      {/* Compound components only — delete for single-element components. */}
      <DocSection title="Anatomy" description="How the sub-components nest.">
        <Anatomy
          code={`<Thing>
  <ThingHeader />
  <ThingBody>{children}</ThingBody>
</Thing>`}
        />
      </DocSection>
    </DocPage>
  );
}
