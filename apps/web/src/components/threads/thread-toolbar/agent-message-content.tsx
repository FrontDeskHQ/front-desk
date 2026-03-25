import { useLiveQuery } from "@live-state/sync/client";
import { Link } from "@tanstack/react-router";
import { type Components, Streamdown } from "streamdown";
import "streamdown/styles.css";
import { BaseThreadChip } from "~/components/chips";
import { query } from "~/lib/live-state";

const THREAD_LINK_PROXY_PREFIX = "https://frontdesk-thread.local/";

function ThreadMention({ threadId }: { threadId: string }) {
  const thread = useLiveQuery(
    query.thread.first({ id: threadId }).include({
      author: {
        include: { user: true },
      },
    }),
  );

  if (!thread || !!thread.deletedAt) {
    return null;
  }

  return (
    <BaseThreadChip
      thread={thread}
      className="inline-flex align-middle"
      render={<Link to="/app/threads/$id" params={{ id: thread.id }} />}
    />
  );
}

const components: Components = {
  a: ({ href, children, ...props }) => {
    if (href?.startsWith(THREAD_LINK_PROXY_PREFIX)) {
      const threadId = href.slice(THREAD_LINK_PROXY_PREFIX.length);
      return <ThreadMention threadId={threadId} />;
    }
    return (
      <a href={href} target="_blank" rel="noreferrer" {...props}>
        {children}
      </a>
    );
  },
};

export function AgentMessageContent({ content }: { content: string }) {
  const normalizedContent = content.replace(
    /\(thread:([^)]+)\)/g,
    (_, threadId: string) => `(${THREAD_LINK_PROXY_PREFIX}${threadId})`,
  );

  return (
    <Streamdown components={components} className="text-sm">
      {normalizedContent}
    </Streamdown>
  );
}
