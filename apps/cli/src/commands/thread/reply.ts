import { readFile } from "node:fs/promises";

import { customerChannelSchema } from "@workspace/schemas/customer-channel";
import type { CustomerChannel } from "@workspace/schemas/customer-channel";

import { assertLocalhostApiUrl, getApiUrl } from "../../lib/env.js";
import { fetchClient } from "../../lib/live-state.js";
import {
  normalizeMessage,
  resolveReplyChannel,
  resolveThread,
} from "../../lib/thread.js";

export interface ThreadReplyOptions {
  channel?: CustomerChannel;
  message?: string | number;
  messageFile?: string | number;
  org?: string;
  ref: string;
}

export interface ThreadReplyOutput {
  cursor: string;
  message: ReturnType<typeof normalizeMessage>;
}

export const readReplyContent = async (
  options: ThreadReplyOptions
): Promise<string> => {
  const hasInlineMessage = options.message !== undefined;
  const hasMessageFile = options.messageFile !== undefined;

  if (hasInlineMessage === hasMessageFile) {
    throw new Error("Provide exactly one of --message or --message-file");
  }

  const content = hasInlineMessage
    ? String(options.message)
    : await readFile(String(options.messageFile), "utf-8");
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Reply message must not be empty");
  }

  return trimmed;
};

export const runThreadReply = async (
  options: ThreadReplyOptions
): Promise<{ output: ThreadReplyOutput; exitCode: number }> => {
  assertLocalhostApiUrl(getApiUrl());

  const content = await readReplyContent(options);
  const resolved = await resolveThread(options.ref, options.org);
  const channel = resolveReplyChannel(
    resolved.thread.externalOrigin,
    options.channel ? customerChannelSchema.parse(options.channel) : undefined
  );

  const message = await fetchClient.mutate.message.createAsThreadAuthor({
    content,
    organizationId: resolved.organizationId,
    origin: channel,
    threadId: resolved.thread.id,
  });
  if (!message) {
    throw new Error("Customer reply was not created");
  }

  return {
    exitCode: 0,
    output: {
      cursor: message.id,
      message: normalizeMessage(resolved.thread, message, channel),
    },
  };
};
