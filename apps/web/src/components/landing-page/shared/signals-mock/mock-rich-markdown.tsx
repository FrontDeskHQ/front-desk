/* mirror: signal recommendation body — apps/web/src/components/markdown/rich-markdown.tsx
 * reuse: RichMarkdown, ThreadChip — the real renderer, only its `a` component
 *   overridden, so prose styling and markdown handling cannot drift
 * state: recommendation markdown from fixture; thread: links resolved against
 *   the threadReferences map the caller passes
 * marketing: the app resolves thread mentions through a live-state
 *   ThreadMention lookup. Fixture links are encoded as a proxy https: URL
 *   (streamdown drops unknown schemes) and swapped for a static ThreadChip.
 */

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
