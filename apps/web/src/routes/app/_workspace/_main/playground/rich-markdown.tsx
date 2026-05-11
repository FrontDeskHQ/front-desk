import { useLiveQuery } from "@live-state/sync/client";
import { createFileRoute } from "@tanstack/react-router";
import { useAtomValue } from "jotai/react";
import { useEffect, useMemo, useState } from "react";
import {
  RichMarkdown,
  type RichMarkdownMarkings,
  type RichMarkdownPreset,
} from "~/components/markdown/rich-markdown";
import { activeOrganizationAtom } from "~/lib/atoms";
import { query } from "~/lib/live-state";

export const Route = createFileRoute(
  "/app/_workspace/_main/playground/rich-markdown",
)({
  component: RichMarkdownPlaygroundPage,
});

const SAMPLE_CONTENT = `# Rich Markdown Playground

This card tests **bold**, _italic_, ~~strikethrough~~ and [external link](https://streamdown.ai).

## Task list

- [x] Parse markdown from LLM output
- [ ] Keep partial blocks readable while streaming

## List

1. First item
2. Second item with \`inline code\`

## Table

| Feature | Status |
| --- | --- |
| Tables | Enabled |
| Thread mentions | [Open thread](thread:fake-thread-id) |

## Code

\`\`\`ts
const handleRender = (text: string) => {
  return text.trim();
};
\`\`\`
`;

const buildThreadMentionContent = (threadId: string | null) => {
  if (!threadId) {
    return `## Thread mention example

No threads found for this workspace yet.

Create a thread first, then reload this page to see a real thread mention chip.`;
  }

  return `## Thread mention example

This references a real thread using markdown protocol:
[Investigate billing mismatch](thread:${threadId})

The mention should render as the thread chip component.`;
};

const buildInlineContent = (threadId: string | null) => {
  if (!threadId) {
    return "Inline preset sample with no thread mention available yet, **bold**, _italic_, and `code`.";
  }

  return `Inline preset sample with [a thread mention](thread:${threadId}), **bold**, _italic_, and \`code\`.`;
};

type PlaygroundVariant = {
  id: string;
  title: string;
  description: string;
  preset?: RichMarkdownPreset;
  markings?: RichMarkdownMarkings;
  mode?: "static" | "streaming";
  parseIncompleteMarkdown?: boolean;
  normalizeThreadLinks?: boolean;
  streaming?: boolean;
};

const VARIANTS: PlaygroundVariant[] = [
  {
    id: "default-static",
    title: "Default preset (static)",
    description: "Baseline rich markdown rendering.",
    preset: "default",
    mode: "static",
  },
  {
    id: "minimal-static",
    title: "Minimal preset (static)",
    description: "Reduced formatting surface for cleaner output.",
    preset: "minimal",
    mode: "static",
    normalizeThreadLinks: false,
  },
  {
    id: "no-table-no-code",
    title: "No tables + no code",
    description: "Disables selected markings via overrides.",
    preset: "default",
    markings: {
      table: false,
      code: false,
      taskList: false,
    },
    mode: "static",
    normalizeThreadLinks: false,
  },
  {
    id: "inline-static",
    title: "Inline preset (static)",
    description: "Drops non-inline blocks and keeps inline markdown only.",
    preset: "inline",
    mode: "static",
    normalizeThreadLinks: true,
  },
  {
    id: "thread-mention",
    title: "Thread mention example",
    description: "Renders a thread mention from markdown link syntax.",
    preset: "default",
    mode: "static",
  },
  {
    id: "streaming-remend",
    title: "Streaming (parse incomplete on)",
    description:
      "Simulates partial LLM output with incomplete markdown parsing.",
    preset: "default",
    mode: "streaming",
    parseIncompleteMarkdown: true,
    streaming: true,
  },
  {
    id: "streaming-strict",
    title: "Streaming (parse incomplete off)",
    description:
      "Simulates partial output without incomplete markdown parsing.",
    preset: "default",
    mode: "streaming",
    parseIncompleteMarkdown: false,
    streaming: true,
  },
];

function useSimulatedStream(content: string, enabled: boolean) {
  const [streamedContent, setStreamedContent] = useState(
    enabled ? content.slice(0, 1) : content,
  );

  useEffect(() => {
    if (!enabled) {
      setStreamedContent(content);
      return;
    }

    let index = 1;
    setStreamedContent(content.slice(0, index));

    const interval = setInterval(() => {
      index = Math.min(index + 12, content.length);
      setStreamedContent(content.slice(0, index));

      if (index >= content.length) {
        clearInterval(interval);
      }
    }, 80);

    return () => clearInterval(interval);
  }, [content, enabled]);

  return streamedContent;
}

function VariantCard({
  variant,
  threadMentionContent,
  inlineContent,
}: {
  variant: PlaygroundVariant;
  threadMentionContent: string;
  inlineContent: string;
}) {
  const baseContent = (() => {
    if (variant.id === "thread-mention") return threadMentionContent;
    if (variant.id === "inline-static") return inlineContent;
    return SAMPLE_CONTENT;
  })();
  const streamedContent = useSimulatedStream(baseContent, !!variant.streaming);
  const renderedContent = variant.streaming ? streamedContent : baseContent;

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
      <header>
        <h2 className="text-sm font-semibold">{variant.title}</h2>
        <p className="text-xs text-foreground-secondary mt-1">
          {variant.description}
        </p>
      </header>

      <div className="rounded-lg border border-border p-3 bg-background">
        <RichMarkdown
          content={renderedContent}
          preset={variant.preset}
          markings={variant.markings}
          mode={variant.mode}
          parseIncompleteMarkdown={variant.parseIncompleteMarkdown}
          normalizeThreadLinks={variant.normalizeThreadLinks}
        />
      </div>
    </article>
  );
}

function RichMarkdownPlaygroundPage() {
  const currentOrg = useAtomValue(activeOrganizationAtom);
  const threads = useLiveQuery(
    query.thread.where({
      organizationId: currentOrg?.id,
      deletedAt: null,
    }),
  );
  const variants = useMemo(() => VARIANTS, []);
  const threadMentionContent = useMemo(
    () => buildThreadMentionContent(threads?.[0]?.id ?? null),
    [threads],
  );
  const inlineContent = useMemo(
    () => buildInlineContent(threads?.[0]?.id ?? null),
    [threads],
  );

  return (
    <main className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-xl font-semibold">Rich Markdown Playground</h1>
          <p className="text-sm text-foreground-secondary">
            Temporary playground for validating `RichMarkdown` presets,
            markings, and static vs streaming modes.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {variants.map((variant) => (
            <VariantCard
              key={variant.id}
              variant={variant}
              threadMentionContent={threadMentionContent}
              inlineContent={inlineContent}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
