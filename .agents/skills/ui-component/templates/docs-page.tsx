// Docs page template — copy into packages/ui/src/routes/<name>.tsx
// Replace `Thing`/`thing`/`/thing`. Then register it in -components/sidebar.tsx.
//
// Structure is fixed (see DOCS_TEMPLATE.md): meta export → DocPage → Demos →
// PropsTable → Anatomy (compound only). Keep the `meta` export first and complete.

import { Thing } from "@workspace/ui/components/thing";
import { createFileRoute } from "@tanstack/react-router";
import {
  Anatomy,
  type ComponentMeta,
  Demo,
  DocPage,
  DocSection,
  PropsTable,
} from "./-components/doc-kit";

export const meta: ComponentMeta = {
  name: "Thing",
  status: "stable",
  description:
    "One sentence describing what Thing is and the job it does in the UI.",
  import: 'import { Thing } from "@workspace/ui/components/thing";',
  whenToUse: [
    "Concrete situation where Thing is the right call.",
    "Another one.",
  ],
  whenNotToUse: [
    "Situation where a different component fits better (name it).",
  ],
  related: ["Button", "Badge"],
};

export const Route = createFileRoute(
  // biome-ignore lint/suspicious/noExplicitAny: route tree is generated after adding new route files
  "/thing" as any,
)({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <DocPage meta={meta}>
      <DocSection title="Variants" description="Each visual variant of Thing.">
        <Demo
          code={`<Thing variant="default">Default</Thing>`}
        >
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

      <DocSection title="States" description="Disabled, invalid, loading — whatever applies.">
        <Demo code={`<Thing aria-disabled>Disabled</Thing>`}>
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
              name: "variant",
              type: '"default"',
              default: '"default"',
              description: "Visual style.",
            },
            {
              name: "size",
              type: '"sm" | "md" | "lg"',
              default: '"md"',
              description: "Control height and padding.",
            },
          ]}
        />
      </DocSection>

      {/* Compound components only — delete for single-element components. */}
      <DocSection
        title="Anatomy"
        description="How the sub-components nest."
      >
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
