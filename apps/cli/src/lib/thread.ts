import type { CustomerChannel } from "@workspace/schemas/customer-channel";
import { safeParseJSON } from "@workspace/utils/tiptap";
import { stringify } from "@workspace/utils/tiptap-md";

import { getDefaultOrg, getWebUrl } from "./env.js";
import { fetchClient } from "./live-state.js";
import { resolveOrganization } from "./org.js";
import { buildThreadUrl } from "./thread-url.js";

const NUMERIC_THREAD_REF_RE = /^\d+$/;

export interface ResolvedThread {
  organizationId: string;
  orgSlug: string;
  thread: NonNullable<
    Awaited<ReturnType<typeof fetchClient.query.thread.detail>>
  >;
}

export interface ThreadMessageOutput {
  author: {
    id: string;
    name: string;
  };
  channel: string;
  content: string;
  createdAt: string;
  id: string;
  role: "customer" | "frontdesk" | "unknown";
}

export interface ThreadReadOutput {
  cursor: string | null;
  messages: ThreadMessageOutput[];
  thread: {
    channel: string;
    id: string;
    shortId: number | null;
    status: number;
    title: string;
    url: string;
  };
}

const toIsoString = (value: Date | string): string =>
  new Date(value).toISOString();

const messageContentToMarkdown = (content: string): string =>
  stringify(safeParseJSON(content)).trim();

const threadChannel = (externalOrigin: string | null | undefined): string =>
  externalOrigin ?? "portal";

export const resolveThread = async (
  ref: string,
  orgRef?: string
): Promise<ResolvedThread> => {
  const trimmedRef = ref.trim();
  if (!trimmedRef) {
    throw new Error("Thread reference is required");
  }

  const thread = NUMERIC_THREAD_REF_RE.test(trimmedRef)
    ? await (async () => {
        const organizationRef = orgRef ?? getDefaultOrg();
        if (!organizationRef) {
          throw new Error(
            "Organization is required for a short thread ID (--org or FD_DEV_ORG)"
          );
        }
        const { id } = await resolveOrganization(organizationRef);
        return fetchClient.query.thread.detail({
          organizationId: id,
          shortId: Number(trimmedRef),
        });
      })()
    : await fetchClient.query.thread.detail({ id: trimmedRef });

  if (!thread) {
    throw new Error(`Thread not found: ${trimmedRef}`);
  }

  const organizationId = thread.organizationId;
  const orgSlug = thread.organization?.slug;
  if (!orgSlug) {
    throw new Error(`Organization not found for thread: ${trimmedRef}`);
  }

  return { organizationId, orgSlug, thread };
};

export const normalizeMessage = (
  thread: ResolvedThread["thread"],
  message: ResolvedThread["thread"]["messages"][number],
  channelOverride?: string
): ThreadMessageOutput => {
  const author = message.author ?? {
    id: message.authorId,
    name: "Unknown author",
  };
  const role =
    message.authorId === thread.authorId
      ? "customer"
      : author.userId
        ? "frontdesk"
        : "unknown";

  return {
    author: {
      id: author.id,
      name: author.name,
    },
    channel: channelOverride ?? threadChannel(thread.externalOrigin),
    content: messageContentToMarkdown(message.content),
    createdAt: toIsoString(message.createdAt),
    id: message.id,
    role,
  };
};

export const readThread = (
  resolved: ResolvedThread,
  after?: string
): ThreadReadOutput => {
  const messages = [...resolved.thread.messages].sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  const afterIndex = after
    ? messages.findIndex((message) => message.id === after)
    : -1;
  if (after && afterIndex === -1) {
    throw new Error(`Message cursor not found in thread: ${after}`);
  }

  const visibleMessages = messages.slice(after ? afterIndex + 1 : 0);
  const channel = threadChannel(resolved.thread.externalOrigin);
  const webUrl = getWebUrl();

  return {
    cursor: messages.at(-1)?.id ?? null,
    messages: visibleMessages.map((message) =>
      normalizeMessage(resolved.thread, message)
    ),
    thread: {
      channel,
      id: resolved.thread.id,
      shortId: resolved.thread.shortId ?? null,
      status: resolved.thread.status,
      title: resolved.thread.name,
      url: buildThreadUrl({
        orgSlug: resolved.orgSlug,
        shortId: resolved.thread.shortId ?? null,
        threadId: resolved.thread.id,
        title: resolved.thread.name,
        webUrl,
      }),
    },
  };
};

export const resolveReplyChannel = (
  externalOrigin: string | null | undefined,
  requested?: CustomerChannel
): CustomerChannel => {
  if (externalOrigin !== null && externalOrigin !== undefined) {
    if (requested && requested !== externalOrigin) {
      throw new Error("THREAD_ORIGIN_MISMATCH");
    }

    if (
      externalOrigin !== "slack" &&
      externalOrigin !== "discord" &&
      externalOrigin !== "widget" &&
      externalOrigin !== "portal"
    ) {
      throw new Error(`Unsupported thread origin: ${externalOrigin}`);
    }

    return externalOrigin;
  }

  return requested ?? "portal";
};
