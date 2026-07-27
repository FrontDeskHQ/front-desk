import { createFileRoute } from "@tanstack/react-router";
import {
  TreeItem,
  TreeItemRow,
  TreeJoin,
  TreeList,
  TreeSkip,
} from "@workspace/ui/components/tree";
import { Circle, FileText, Folder } from "lucide-react";

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
    "A composable tree for nested rows with left-side guide columns. Skip draws a vertical guide through the row; Join branches into row content.",
  import:
    'import { TreeList, TreeItem, TreeItemRow } from "@workspace/ui/components/tree";',
  name: "Tree",
  related: ["Composite", "Collapsible", "Separator"],
  status: "stable",
  whenNotToUse: [
    "Flat selectable lists — use Composite or a plain list.",
    "Expandable navigation sidebars — use Sidebar or NavigationMenu.",
    "Hierarchical data with built-in expand/collapse chrome — compose Collapsible inside TreeItemRow instead of expecting it here.",
  ],
  whenToUse: [
    "Showing nested structure where each row needs ancestor guide lines (thread timelines, file trees, nested activity).",
    "You need skip vs gap columns to show whether an ancestor branch continues below the current row.",
  ],
};

export const Route = createFileRoute("/tree" as unknown as "/tree")({
  component: RouteComponent,
});

function SignalTreeDemo() {
  return (
    <TreeList className="max-w-md rounded-md border bg-background-secondary p-3">
      <TreeItem>
        <TreeItemRow>
          <Folder className="size-3.5 text-foreground-secondary" />
          <span>Thread read</span>
        </TreeItemRow>
        <TreeList>
          <TreeItem>
            <TreeItemRow>
              <FileText className="size-3.5 text-foreground-secondary" />
              <span>Summary generated</span>
            </TreeItemRow>
            <TreeList>
              <TreeItem>
                <TreeItemRow>
                  <Circle className="size-3.5 text-foreground-tertiary" />
                  <span className="text-foreground-secondary">
                    Label suggestion
                  </span>
                </TreeItemRow>
              </TreeItem>
            </TreeList>
          </TreeItem>
          <TreeItem>
            <TreeItemRow>
              <FileText className="size-3.5 text-foreground-secondary" />
              <span>Reply draft</span>
            </TreeItemRow>
          </TreeItem>
        </TreeList>
      </TreeItem>
    </TreeList>
  );
}

function RouteComponent() {
  return (
    <DocPage meta={meta}>
      <DocSection
        title="Basic"
        description="Guides are computed automatically. Skip keeps a vertical line through the row. Join branches from the parent into row content."
      >
        <Demo
          code={`<TreeList>
  <TreeItem>
    <TreeItemRow>Thread read</TreeItemRow>
    <TreeList>
      <TreeItem>
        <TreeItemRow>Summary generated</TreeItemRow>
        <TreeList>
          <TreeItem>
            <TreeItemRow>Label suggestion</TreeItemRow>
          </TreeItem>
        </TreeList>
      </TreeItem>
      <TreeItem>
        <TreeItemRow>Reply draft</TreeItemRow>
      </TreeItem>
    </TreeList>
  </TreeItem>
</TreeList>`}
        >
          <SignalTreeDemo />
        </Demo>
      </DocSection>

      <DocSection
        title="Indicators"
        description="Compose TreeJoin and TreeSkip manually when TreeItemRow is not a fit."
      >
        <Demo
          code={`<div className="flex flex-col">
  <div className="flex min-h-8 items-stretch gap-1 text-sm">
    <TreeJoin />
    <span className="flex flex-1 items-center py-1">First</span>
  </div>
  <div className="flex min-h-8 items-stretch gap-1 text-sm">
    <TreeSkip />
    <span className="flex flex-1 items-center py-1">Middle</span>
  </div>
  <div className="flex min-h-8 items-stretch gap-1 text-sm">
    <TreeJoin isLast />
    <span className="flex flex-1 items-center py-1">Last</span>
  </div>
</div>`}
        >
          <div className="max-w-md rounded-md border bg-background-secondary p-3">
            <div className="flex flex-col">
              <div className="flex min-h-8 items-stretch gap-1 text-sm">
                <TreeJoin />
                <span className="flex flex-1 items-center py-1 text-foreground-primary">
                  First
                </span>
              </div>
              <div className="flex min-h-8 items-stretch gap-1 text-sm">
                <TreeSkip />
                <span className="flex flex-1 items-center py-1 text-foreground-primary">
                  Middle
                </span>
              </div>
              <div className="flex min-h-8 items-stretch gap-1 text-sm">
                <TreeJoin isLast />
                <span className="flex flex-1 items-center py-1 text-foreground-primary">
                  Last
                </span>
              </div>
            </div>
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="Stretch"
        description="stretchStart, stretchEnd, and stretchSide extend guides beyond the indicator box — useful for bridging row gaps or reaching into content."
      >
        <Demo
          code={`<div className="flex flex-col">
  <div className="flex min-h-10 items-stretch gap-1 overflow-visible text-sm">
    <TreeJoin stretchEnd={12} stretchSide={6} />
    <span className="flex flex-1 items-center py-1">Parent</span>
  </div>
  <div className="flex min-h-10 items-stretch gap-1 overflow-visible text-sm">
    <TreeSkip stretchStart={12} stretchEnd={12} />
    <TreeJoin stretchStart={12} isLast stretchSide={6} />
    <span className="flex flex-1 items-center py-1">Child</span>
  </div>
</div>`}
        >
          <div className="max-w-md rounded-md border bg-background-secondary p-3">
            <div className="flex flex-col">
              <div className="flex min-h-10 items-stretch gap-1 overflow-visible text-sm">
                <TreeJoin stretchEnd={12} stretchSide={6} />
                <span className="flex flex-1 items-center py-1 text-foreground-primary">
                  Parent
                </span>
              </div>
              <div className="flex min-h-10 items-stretch gap-1 overflow-visible text-sm">
                <TreeSkip stretchStart={12} stretchEnd={12} />
                <TreeJoin stretchStart={12} isLast stretchSide={6} />
                <span className="flex flex-1 items-center py-1 text-foreground-primary">
                  Child
                </span>
              </div>
            </div>
          </div>
        </Demo>
      </DocSection>

      <DocSection
        title="API"
        description="Props in addition to the native element props."
      >
        <PropsTable
          rows={[
            {
              default: "0",
              description:
                "Pixels to extend guides upward beyond the indicator box (TreeJoin, TreeSkip). TreeItemRow defaults this to the tree gap (4px, matching gap-1).",
              name: "stretchStart",
              type: "number",
            },
            {
              default: "0",
              description:
                "Pixels to extend guides downward beyond the indicator box (TreeJoin, TreeSkip).",
              name: "stretchEnd",
              type: "number",
            },
            {
              default: "0",
              description:
                "Pixels to extend the horizontal join branch rightward into row content (TreeJoin).",
              name: "stretchSide",
              type: "number",
            },
            {
              default: "from context",
              description:
                "Last sibling uses a half-height vertical segment before the horizontal branch.",
              name: "isLast (TreeJoin)",
              type: "boolean",
            },
          ]}
        />
      </DocSection>

      <DocSection
        title="Anatomy"
        description="Compose rows and nested lists explicitly — guides flow from parent TreeItem into child TreeList."
      >
        <Anatomy
          code={`<TreeList>
  <TreeItem>
    <TreeItemRow>{label}</TreeItemRow>
    <TreeList>
      <TreeItem>…</TreeItem>
    </TreeList>
  </TreeItem>
</TreeList>`}
        />
      </DocSection>
    </DocPage>
  );
}
