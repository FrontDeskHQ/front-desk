import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { type Components, Streamdown } from "streamdown";
import "streamdown/styles.css";
import { z } from "zod";
import {
  IssueChip,
  PrChip,
  ThreadChipWithSummary,
} from "~/components/chips";
import { query } from "~/lib/live-state";
import { buildThreadParam } from "~/utils/thread";

const THREAD_LINK_PROXY_PREFIX = "https://frontdesk-thread.local/";

const GITHUB_PR_URL_REGEX =
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pulls?\/(\d+)(?:\/[^?#]*)?(?:[?#].*)?$/;

const GITHUB_ISSUE_URL_REGEX =
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/issues?\/(\d+)(?:\/[^?#]*)?(?:[?#].*)?$/;

const GithubEntityUrlSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  number: z.number().int().positive(),
  url: z.string().url(),
});

export function parseGithubPrUrl(href: string | undefined) {
  if (!href) return null;
  const match = href.match(GITHUB_PR_URL_REGEX);
  if (!match) return null;
  const parseResult = GithubEntityUrlSchema.safeParse({
    owner: match[1],
    repo: match[2],
    number: Number(match[3]),
    url: href,
  });
  if (!parseResult.success) return null;
  return parseResult.data;
}

export function parseGithubIssueUrl(href: string | undefined) {
  if (!href) return null;
  const match = href.match(GITHUB_ISSUE_URL_REGEX);
  if (!match) return null;
  const parseResult = GithubEntityUrlSchema.safeParse({
    owner: match[1],
    repo: match[2],
    number: Number(match[3]),
    url: href,
  });
  if (!parseResult.success) return null;
  return parseResult.data;
}

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

type GithubEntityChipInlineProps = {
  owner: string;
  repo: string;
  number: number;
  url: string;
};

function useInlineChipSpacing() {
  const ref = useRef<HTMLSpanElement>(null);
  const [hasLeadingSpace, setHasLeadingSpace] = useState(false);
  const [hasTrailingSpace, setHasTrailingSpace] = useState(false);

  useLayoutEffect(() => {
    const prev = ref.current?.previousSibling;
    setHasLeadingSpace(
      prev?.nodeType === Node.TEXT_NODE && /\s$/.test(prev.textContent ?? ""),
    );
    const next = ref.current?.nextSibling;
    setHasTrailingSpace(
      next?.nodeType === Node.TEXT_NODE && /^\s/.test(next.textContent ?? ""),
    );
  });

  return { ref, hasLeadingSpace, hasTrailingSpace };
}

export function PrChipInline(props: GithubEntityChipInlineProps) {
  const { ref, hasLeadingSpace, hasTrailingSpace } = useInlineChipSpacing();

  return (
    <span ref={ref} className="contents">
      <PrChip
        {...props}
        className={cn(
          "inline-flex mb-0 translate-y-0.5",
          hasLeadingSpace && "ml-px",
          hasTrailingSpace && "mr-px",
        )}
      />
    </span>
  );
}

export function IssueChipInline(props: GithubEntityChipInlineProps) {
  const { ref, hasLeadingSpace, hasTrailingSpace } = useInlineChipSpacing();

  return (
    <span ref={ref} className="contents">
      <IssueChip
        {...props}
        className={cn(
          "inline-flex mb-0 translate-y-0.5",
          hasLeadingSpace && "ml-px",
          hasTrailingSpace && "mr-px",
        )}
      />
    </span>
  );
}

export function ThreadMention({ where }: { where: Record<string, unknown> }) {
  const thread = useLiveQuery(
    query.thread.first(where).include({
      author: {
        include: { user: true },
      },
      assignedUser: {
        include: { user: true },
      },
    }),
  );

  const ref = useRef<HTMLSpanElement>(null);
  const [hasLeadingSpace, setHasLeadingSpace] = useState(false);
  const [hasTrailingSpace, setHasTrailingSpace] = useState(false);

  useLayoutEffect(() => {
    const prev = ref.current?.previousSibling;
    setHasLeadingSpace(
      prev?.nodeType === Node.TEXT_NODE && /\s$/.test(prev.textContent ?? ""),
    );
    const next = ref.current?.nextSibling;
    setHasTrailingSpace(
      next?.nodeType === Node.TEXT_NODE && /^\s/.test(next.textContent ?? ""),
    );
  });

  if (!thread || !!thread.deletedAt) {
    return null;
  }

  return (
    <span ref={ref} className="contents">
      <ThreadChipWithSummary
        thread={thread}
        className={cn(
          "inline-flex mb-0 -translate-y-0.5",
          hasLeadingSpace && "ml-px",
          hasTrailingSpace && "mr-px",
        )}
        render={
          <Link
            to="/app/threads/$id"
            params={{ id: buildThreadParam(thread) }}
          />
        }
      />
    </span>
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
          return <ThreadMention where={{ id: threadId }} />;
        }
        const pr = parseGithubPrUrl(href);
        if (pr) {
          return <PrChipInline {...pr} />;
        }
        const issue = parseGithubIssueUrl(href);
        if (issue) {
          return <IssueChipInline {...issue} />;
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
