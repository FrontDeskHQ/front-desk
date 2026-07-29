/* marketing: static ThreadChip for thread: links — real RichMarkdown uses live-state ThreadMention */

import type { ComponentProps } from "react";
import { useMemo } from "react";
import type { Components } from "streamdown";

import { ThreadChip } from "~/components/chips";
import { RichMarkdown } from "~/components/markdown/rich-markdown";

import type { MockThreadReference } from "./types";

const THREAD_LINK_PROXY_PREFIX = "https://frontdesk-thread.local/";

function mockMarkdownComponents(
  threads: Record<string, MockThreadReference>
): Components {
  return {
    a: ({ href, children }) => {
      if (href?.startsWith(THREAD_LINK_PROXY_PREFIX)) {
        const threadId = href.slice(THREAD_LINK_PROXY_PREFIX.length);
        const thread = threads[threadId];
        if (!thread) {
          return null;
        }
        return (
          <ThreadChip
            thread={thread as ComponentProps<typeof ThreadChip>["thread"]}
            className="mb-0 -translate-y-0.5 inline-flex"
            render={<div />}
          />
        );
      }
      return <span>{children}</span>;
    },
  };
}

interface MockRichMarkdownProps {
  className?: string;
  content: string;
  preset?: ComponentProps<typeof RichMarkdown>["preset"];
  threadReferences: Record<string, MockThreadReference>;
}

export function MockRichMarkdown({
  threadReferences,
  ...props
}: MockRichMarkdownProps) {
  const components = useMemo(
    () => mockMarkdownComponents(threadReferences),
    [threadReferences]
  );

  return <RichMarkdown {...props} components={components} />;
}
