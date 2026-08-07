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

const compareMessageIds = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const messageInsertionSequence = (
  message: ResolvedThread["thread"]["messages"][number]
): string | null => message.insertionSequence ?? null;

const compareMessages = (
  left: ResolvedThread["thread"]["messages"][number],
  right: ResolvedThread["thread"]["messages"][number]
): number => {
  const createdAtDifference =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();

  return createdAtDifference !== 0
    ? createdAtDifference
    : compareMessageIds(left.id, right.id);
};

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
  const messages = [...resolved.thread.messages].sort(compareMessages);

  const afterMessage = after
    ? messages.find((message) => message.id === after)
    : undefined;
  if (after && !afterMessage) {
    throw new Error(`Message cursor not found in thread: ${after}`);
  }

  const afterSequence = afterMessage
    ? messageInsertionSequence(afterMessage)
    : null;
  const hasInsertionSequences = messages.some(
    (message) => messageInsertionSequence(message) !== null
  );

  // Message IDs are caller-controlled, so incremental reads use the
  // server-assigned insertion sequence. This keeps a late-arriving imported
  // message visible even when its provider timestamp places it earlier in the
  // transcript or its ID sorts before the cursor.
  const visibleMessages = after
    ? hasInsertionSequences
      ? messages.filter((message) => {
          const sequence = messageInsertionSequence(message);
          return (
            sequence !== null &&
            (afterSequence === null ||
              compareMessageIds(sequence, afterSequence) > 0)
          );
        })
      : messages.slice(
          messages.findIndex((message) => message.id === after) + 1
        )
    : messages;
  const latestSequencedMessage = messages.reduce<
    ResolvedThread["thread"]["messages"][number] | null
  >((latest, message) => {
    const sequence = messageInsertionSequence(message);
    if (
      sequence === null ||
      (latest !== null &&
        compareMessageIds(sequence, messageInsertionSequence(latest) ?? "") <=
          0)
    ) {
      return latest;
    }
    return message;
  }, null);
  const cursor = latestSequencedMessage?.id ?? messages.at(-1)?.id ?? null;
  const channel = threadChannel(resolved.thread.externalOrigin);
  const webUrl = getWebUrl();

  return {
    cursor,
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
