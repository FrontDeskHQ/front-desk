// FrontDesk UI Studio doc kit.
// Shared building blocks for component docs pages. Every page under
// `packages/ui/src/routes/*.tsx` is built from these so docs stay consistent
// and are parseable by both humans and agents.
//
// Install location: packages/ui/src/routes/-components/doc-kit.tsx
// Do not duplicate — import from here.

import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import * as React from "react";

export type ComponentStatus = "stable" | "beta" | "deprecated";

export interface PropRow {
  name: string;
  type: string;
  default?: string;
  description: string;
}

/**
 * Machine-readable summary of a component. Exported from every docs route as
 * `meta` so agents can read intent and API without parsing JSX.
 */
export interface ComponentMeta {
  /** Display name, e.g. "Button". */
  name: string;
  /** Lifecycle status, surfaced as a badge. */
  status: ComponentStatus;
  /** One sentence: what it is and the job it does. */
  description: string;
  /** Copy-paste import line, e.g. `import { Button } from "@workspace/ui/components/button"`. */
  import: string;
  /** When this component is the right call. */
  whenToUse: string[];
  /** When to reach for something else instead. */
  whenNotToUse: string[];
  /** Related component names for cross-linking. */
  related?: string[];
}

const statusVariant: Record<
  ComponentStatus,
  "success" | "warning" | "secondary"
> = {
  beta: "warning",
  deprecated: "secondary",
  stable: "success",
};

export function DocPage({
  meta,
  children,
}: {
  meta: ComponentMeta;
  children: React.ReactNode;
}) {
  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-medium text-lg">{meta.name}</h1>
          <Badge variant={statusVariant[meta.status]}>{meta.status}</Badge>
        </div>
        <p className="text-foreground-secondary text-sm">{meta.description}</p>
        <CodeBlock code={meta.import} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Guidance
            title="When to use"
            tone="positive"
            items={meta.whenToUse}
          />
          <Guidance
            title="When not to use"
            tone="negative"
            items={meta.whenNotToUse}
          />
        </div>
        {meta.related?.length ? (
          <div className="flex items-center gap-2 text-foreground-secondary text-xs">
            <span>Related:</span>
            {meta.related.map((r) => (
              <Badge key={r} variant="outline">
                {r}
              </Badge>
            ))}
          </div>
        ) : null}
      </header>
      {children}
    </div>
  );
}

function Guidance({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "negative";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <div className="font-medium text-foreground-secondary text-xs">
        {title}
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              className={cn(
                tone === "positive" ? "text-emerald-500" : "text-red-500"
              )}
              aria-hidden
            >
              {tone === "positive" ? "✓" : "✗"}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A titled section with optional description. Wrap demos and tables in these. */
export function DocSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-sm">{title}</h2>
        {description ? (
          <p className="text-foreground-secondary text-sm">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Live preview + the source that produced it. Pass the exact JSX as `code` so
 * the rendered example and the copy-paste snippet never drift.
 */
export function Demo({
  code,
  children,
  className,
}: {
  code?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border">
      <div
        className={cn(
          "flex flex-wrap items-center gap-4 border-dashed border-b p-6",
          className
        )}
      >
        {children}
      </div>
      {code ? (
        <CodeBlock code={code} className="rounded-none border-0" />
      ) : null}
    </div>
  );
}

export function CodeBlock({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = React.useCallback(() => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  return (
    <div className={cn("relative bg-background-tertiary", className)}>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={copy}
        aria-label="Copy code"
        className="absolute top-2 right-2"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

/** Props / API reference table. Mirror the component's actual props. */
export function PropsTable({ rows }: { rows: PropRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Prop</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Default</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="font-mono text-xs">{row.name}</TableCell>
              <TableCell className="font-mono text-foreground-secondary text-xs">
                {row.type}
              </TableCell>
              <TableCell className="font-mono text-foreground-secondary text-xs">
                {row.default ?? "—"}
              </TableCell>
              <TableCell className="text-sm">{row.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Composition map for compound components — shows the sub-component tree and
 * slots so consumers know how the parts nest. Pass a JSX skeleton as `code`.
 */
export function Anatomy({ code }: { code: string }) {
  return <CodeBlock code={code} />;
}
