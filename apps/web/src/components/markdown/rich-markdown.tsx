import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import { useMemo } from "react";
import { type Components, Streamdown } from "streamdown";
import "streamdown/styles.css";
import { ThreadChip } from "~/components/chips";
import { query } from "~/lib/live-state";
import { buildThreadParam } from "~/utils/thread";

const THREAD_LINK_PROXY_PREFIX = "https://frontdesk-thread.local/";

export type RichMarkdownPreset = "default" | "minimal" | "full" | "inline";

export type RichMarkdownMarking =
  | "heading"
  | "emphasis"
  | "strong"
  | "blockquote"
  | "code"
  | "list"
  | "link"
  | "table"
  | "strikethrough"
  | "taskList"
  | "thematicBreak";

export type RichMarkdownMarkings = Partial<
  Record<RichMarkdownMarking, boolean>
>;

const PRESET_MARKINGS: Record<
  RichMarkdownPreset,
  Record<RichMarkdownMarking, boolean>
> = {
  default: {
    heading: true,
    emphasis: true,
    strong: true,
    blockquote: true,
    code: true,
    list: true,
    link: true,
    table: true,
    strikethrough: true,
    taskList: true,
    thematicBreak: true,
  },
  minimal: {
    heading: true,
    emphasis: true,
    strong: true,
    blockquote: true,
    code: false,
    list: true,
    link: true,
    table: false,
    strikethrough: false,
    taskList: false,
    thematicBreak: true,
  },
  full: {
    heading: true,
    emphasis: true,
    strong: true,
    blockquote: true,
    code: true,
    list: true,
    link: true,
    table: true,
    strikethrough: true,
    taskList: true,
    thematicBreak: true,
  },
  inline: {
    heading: false,
    emphasis: true,
    strong: true,
    blockquote: false,
    code: true,
    list: false,
    link: true,
    table: false,
    strikethrough: true,
    taskList: false,
    thematicBreak: false,
  },
};

const PRESET_EXTRA_DISALLOWED: Partial<Record<RichMarkdownPreset, string[]>> = {
  // Keep inline code (`code`) but remove fenced blocks (`pre`) in inline mode.
  inline: ["pre", "p", "div", "br"],
};

const MARKING_ELEMENTS: Record<RichMarkdownMarking, string[]> = {
  heading: ["h1", "h2", "h3", "h4", "h5", "h6"],
  emphasis: ["em"],
  strong: ["strong"],
  blockquote: ["blockquote"],
  code: ["pre", "code"],
  list: ["ul", "ol", "li"],
  link: ["a"],
  table: ["table", "thead", "tbody", "tr", "th", "td"],
  strikethrough: ["del"],
  taskList: ["input"],
  thematicBreak: ["hr"],
};

type RichMarkdownProps = {
  content: string;
  className?: string;
  preset?: RichMarkdownPreset;
  markings?: RichMarkdownMarkings;
  mode?: "static" | "streaming";
  parseIncompleteMarkdown?: boolean;
  normalizeThreadLinks?: boolean;
  components?: Components;
};

function ThreadMention({ threadId }: { threadId: string }) {
  const thread = useLiveQuery(
    query.thread.first({ id: threadId }).include({
      author: {
        include: { user: true },
      },
      assignedUser: {
        include: { user: true },
      },
    }),
  );

  if (!thread || !!thread.deletedAt) {
    return null;
  }

  return (
    <ThreadChip
      thread={thread}
      className="inline-flex mb-0 -translate-y-0.5"
      render={
        <Link to="/app/threads/$id" params={{ id: buildThreadParam(thread) }} />
      }
    />
  );
}

function resolveMarkings(
  preset: RichMarkdownPreset,
  markings: RichMarkdownMarkings | undefined,
) {
  return {
    ...PRESET_MARKINGS[preset],
    ...markings,
  };
}

function getDisallowedElements(markings: Record<RichMarkdownMarking, boolean>) {
  return (Object.keys(MARKING_ELEMENTS) as RichMarkdownMarking[])
    .filter((key) => !markings[key])
    .flatMap((key) => MARKING_ELEMENTS[key]);
}

export const RichMarkdown = ({
  content,
  className,
  preset = "default",
  markings,
  mode = "static",
  parseIncompleteMarkdown,
  normalizeThreadLinks = true,
  components,
}: RichMarkdownProps) => {
  const resolvedMarkings = useMemo(
    () => resolveMarkings(preset, markings),
    [preset, markings],
  );

  const disallowedElements = useMemo(
    () => [
      ...getDisallowedElements(resolvedMarkings),
      ...(PRESET_EXTRA_DISALLOWED[preset] ?? []),
    ],
    [resolvedMarkings, preset],
  );

  const normalizedContent = useMemo(() => {
    if (!normalizeThreadLinks) {
      return content;
    }
    return content.replace(
      /\(thread:([^)]+)\)/g,
      (_, threadId: string) => `(${THREAD_LINK_PROXY_PREFIX}${threadId})`,
    );
  }, [content, normalizeThreadLinks]);

  const defaultComponents = useMemo<Components>(
    () => ({
      a: ({ href, children, ...props }) => {
        if (
          normalizeThreadLinks &&
          href?.startsWith(THREAD_LINK_PROXY_PREFIX)
        ) {
          const threadId = href.slice(THREAD_LINK_PROXY_PREFIX.length);
          return <ThreadMention threadId={threadId} />;
        }
        return (
          <a href={href} target="_blank" rel="noreferrer" {...props}>
            {children}
          </a>
        );
      },
    }),
    [normalizeThreadLinks],
  );

  const mergedComponents = useMemo(
    () => ({ ...defaultComponents, ...components }),
    [defaultComponents, components],
  );

  return (
    <Streamdown
      mode={mode}
      className={cn("text-sm", className)}
      components={mergedComponents}
      parseIncompleteMarkdown={parseIncompleteMarkdown}
      disallowedElements={
        disallowedElements.length > 0 ? disallowedElements : undefined
      }
      unwrapDisallowed
    >
      {normalizedContent}
    </Streamdown>
  );
};
