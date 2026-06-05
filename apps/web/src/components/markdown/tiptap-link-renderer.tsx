import {
  type TiptapLinkRenderer as TiptapLinkRendererFn,
  TiptapLinkRendererProvider,
} from "@workspace/ui/components/blocks/tiptap-link";
import { useAtomValue } from "jotai";
import {
  PrChipInline,
  parseGithubPrUrl,
  ThreadMention,
} from "~/components/markdown/rich-markdown";
import { activeOrganizationAtom } from "~/lib/atoms";
import { type ParsedThreadParam, parseThreadParam } from "~/utils/thread";

const THREAD_LINK_PREFIX = "thread:";

/**
 * Matches an internal thread URL (e.g.
 * `https://app.example.com/app/threads/14-some-slug` or a portal
 * `/support/acme/threads/<param>`) and returns the parsed thread param.
 */
function parseThreadUrl(href: string): ParsedThreadParam | null {
  if (typeof window === "undefined") return null;

  let url: URL;
  try {
    url = new URL(href, window.location.origin);
  } catch {
    return null;
  }

  // Only treat same-origin links as internal thread references.
  if (url.origin !== window.location.origin) return null;

  const match = url.pathname.match(/\/threads\/([^/?#]+)/);
  if (!match) return null;

  return parseThreadParam(match[1]);
}

/**
 * Resolves a thread param that may reference a thread by short id, which
 * requires the active organization for scoping.
 */
function ThreadUrlMention({ param }: { param: ParsedThreadParam }) {
  const activeOrg = useAtomValue(activeOrganizationAtom);

  if (param.kind === "ulid") {
    return <ThreadMention where={{ id: param.id }} />;
  }

  if (!activeOrg?.id) return null;

  return (
    <ThreadMention
      where={{ shortId: param.shortId, organizationId: activeOrg.id }}
    />
  );
}

const renderLink: TiptapLinkRendererFn = ({ href }) => {
  if (href.startsWith(THREAD_LINK_PREFIX)) {
    return (
      <ThreadMention where={{ id: href.slice(THREAD_LINK_PREFIX.length) }} />
    );
  }

  const threadParam = parseThreadUrl(href);
  if (threadParam) {
    return <ThreadUrlMention param={threadParam} />;
  }

  const pr = parseGithubPrUrl(href);
  if (pr) {
    return <PrChipInline {...pr} />;
  }

  return null;
};

/**
 * Makes the shared Tiptap editor/renderer render thread references and GitHub
 * PR links as rich chips, mirroring {@link RichMarkdown}. Wrap any subtree that
 * mounts the Tiptap components from `@workspace/ui/components/blocks/tiptap`.
 */
export function TiptapLinkRenderer({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TiptapLinkRendererProvider renderLink={renderLink}>
      {children}
    </TiptapLinkRendererProvider>
  );
}
