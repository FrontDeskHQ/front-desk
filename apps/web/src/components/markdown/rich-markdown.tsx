import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import { cn } from "@workspace/ui/lib/utils";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  use,
} from "react";
import { Streamdown } from "streamdown";
import type { Components } from "streamdown";

import "streamdown/styles.css";
import { z } from "zod";

import { IssueChip, PrChip, ThreadChipWithSummary } from "~/components/chips";
import { query } from "~/lib/live-state";
import { buildThreadParam } from "~/utils/thread";

const THREAD_LINK_PROXY_PREFIX = "https://frontdesk-thread.local/";

const GITHUB_PR_URL_REGEX =
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pulls?\/(\d+)(?:\/[^?#]*)?(?:[?#].*)?$/;

const GITHUB_ISSUE_URL_REGEX =
  /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)(?:\/[^?#]*)?(?:[?#].*)?$/;

const GithubEntityUrlSchema = z.object({
  number: z.number().int().positive(),
  owner: z.string().min(1),
  repo: z.string().min(1),
  url: z.string().url(),
});

export function parseGithubPrUrl(href: string | undefined) {
  if (!href) {
    return null;
  }
  const match = href.match(GITHUB_PR_URL_REGEX);
  if (!match) {
    return null;
  }
  const parseResult = GithubEntityUrlSchema.safeParse({
    number: Number(match[3]),
    owner: match[1],
    repo: match[2],
    url: href,
  });
  if (!parseResult.success) {
    return null;
  }
  return parseResult.data;
}

export function parseGithubIssueUrl(href: string | undefined) {
  if (!href) {
    return null;
  }
  const match = href.match(GITHUB_ISSUE_URL_REGEX);
  if (!match) {
    return null;
  }
  const parseResult = GithubEntityUrlSchema.safeParse({
    number: Number(match[3]),
    owner: match[1],
    repo: match[2],
    url: href,
  });
  if (!parseResult.success) {
    return null;
  }
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
    blockquote: true,
    code: true,
    emphasis: true,
    heading: true,
    link: true,
    list: true,
    strikethrough: true,
    strong: true,
    table: true,
    taskList: true,
    thematicBreak: true,
  },
  full: {
    blockquote: true,
    code: true,
    emphasis: true,
    heading: true,
    link: true,
    list: true,
    strikethrough: true,
    strong: true,
    table: true,
    taskList: true,
    thematicBreak: true,
  },
  inline: {
    blockquote: false,
    code: true,
    emphasis: true,
    heading: false,
    link: true,
    list: false,
    strikethrough: true,
    strong: true,
    table: false,
    taskList: false,
    thematicBreak: false,
  },
  minimal: {
    blockquote: true,
    code: false,
    emphasis: true,
    heading: true,
    link: true,
    list: true,
    strikethrough: false,
    strong: true,
    table: false,
    taskList: false,
    thematicBreak: true,
  },
};

const PRESET_EXTRA_DISALLOWED: Partial<Record<RichMarkdownPreset, string[]>> = {
  // Keep inline code (`code`) but remove fenced blocks (`pre`) in inline mode.
  inline: ["pre", "p", "div", "br"],
};

const MARKING_ELEMENTS: Record<RichMarkdownMarking, string[]> = {
  blockquote: ["blockquote"],
  code: ["pre", "code"],
  emphasis: ["em"],
  heading: ["h1", "h2", "h3", "h4", "h5", "h6"],
  link: ["a"],
  list: ["ul", "ol", "li"],
  strikethrough: ["del"],
  strong: ["strong"],
  table: ["table", "thead", "tbody", "tr", "th", "td"],
  taskList: ["input"],
  thematicBreak: ["hr"],
};

interface RichMarkdownProps {
  content: string;
  className?: string;
  preset?: RichMarkdownPreset;
  markings?: RichMarkdownMarkings;
  mode?: "static" | "streaming";
  parseIncompleteMarkdown?: boolean;
  normalizeThreadLinks?: boolean;
  components?: Components;
}

interface GithubEntityChipInlineProps {
  owner: string;
  repo: string;
  number: number;
  url: string;
}

function useInlineChipSpacing() {
  const ref = useRef<HTMLSpanElement>(null);
  const [hasLeadingSpace, setHasLeadingSpace] = useState(false);
  const [hasTrailingSpace, setHasTrailingSpace] = useState(false);

  useLayoutEffect(() => {
    const prev = ref.current?.previousSibling;
    setHasLeadingSpace(
      prev?.nodeType === Node.TEXT_NODE && /\s$/.test(prev.textContent ?? "")
    );
    const next = ref.current?.nextSibling;
    setHasTrailingSpace(
      next?.nodeType === Node.TEXT_NODE && /^\s/.test(next.textContent ?? "")
    );
  }, []);

  return { hasLeadingSpace, hasTrailingSpace, ref };
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
          hasTrailingSpace && "mr-px"
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
          hasTrailingSpace && "mr-px"
        )}
      />
    </span>
  );
}

export function ThreadMention({ where }: { where: Record<string, unknown> }) {
  const thread = useLiveQuery(
    query.thread.first(where).include({
      assignedUser: {
        include: { user: true },
      },
      author: {
        include: { user: true },
      },
    })
  );

  const ref = useRef<HTMLSpanElement>(null);
  const [hasLeadingSpace, setHasLeadingSpace] = useState(false);
  const [hasTrailingSpace, setHasTrailingSpace] = useState(false);

  useLayoutEffect(() => {
    const prev = ref.current?.previousSibling;
    setHasLeadingSpace(
      prev?.nodeType === Node.TEXT_NODE && /\s$/.test(prev.textContent ?? "")
    );
    const next = ref.current?.nextSibling;
    setHasTrailingSpace(
      next?.nodeType === Node.TEXT_NODE && /^\s/.test(next.textContent ?? "")
    );
  }, []);

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
          hasTrailingSpace && "mr-px"
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
  markings: RichMarkdownMarkings | undefined
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

const NormalizeThreadLinksContext = createContext(true);

function RichMarkdownAnchor({
  href,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"a">) {
  const normalizeThreadLinks = use(NormalizeThreadLinksContext);
  return (
    <RichMarkdownLink
      href={href}
      normalizeThreadLinks={normalizeThreadLinks}
      {...props}
    >
      {children}
    </RichMarkdownLink>
  );
}

const defaultMarkdownComponents: Components = {
  a: RichMarkdownAnchor,
};

function RichMarkdownLink({
  href,
  children,
  normalizeThreadLinks,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & { normalizeThreadLinks: boolean }) {
  if (normalizeThreadLinks && href?.startsWith(THREAD_LINK_PROXY_PREFIX)) {
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
    [preset, markings]
  );

  const disallowedElements = useMemo(
    () => [
      ...getDisallowedElements(resolvedMarkings),
      ...(PRESET_EXTRA_DISALLOWED[preset] ?? []),
    ],
    [resolvedMarkings, preset]
  );

  const normalizedContent = useMemo(() => {
    if (!normalizeThreadLinks) {
      return content;
    }
    return content.replaceAll(
      /\(thread:([^)]+)\)/g,
      (_, threadId: string) => `(${THREAD_LINK_PROXY_PREFIX}${threadId})`
    );
  }, [content, normalizeThreadLinks]);

  const mergedComponents = useMemo(
    () => ({ ...defaultMarkdownComponents, ...components }),
    [components]
  );

  return (
    <NormalizeThreadLinksContext value={normalizeThreadLinks}>
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
    </NormalizeThreadLinksContext>
  );
};
