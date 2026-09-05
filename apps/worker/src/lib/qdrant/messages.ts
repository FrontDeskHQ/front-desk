import { ULIDtoUUID } from "ulid-uuid-converter";

import { defineIndex } from "./define-index";

export const MESSAGES_COLLECTION = "messages-v1";

export interface MessagePayload {
  messageId: string;
  threadId: string;
  organizationId: string;
  content: string;
  messageIndex: number;
  createdAt: number;
}

/**
 * Hybrid index over individual messages, backing the Agent message
 * search. Point identity is the message's own ULID reinterpreted as a UUID —
 * message ids are already globally unique, so no organization prefix is needed.
 * A malformed ULID yields `null`; callers use `pointIdFor` to skip those with a
 * warning rather than failing a whole batch.
 */
export const messageIndex = defineIndex<MessagePayload, "messageId", true>({
  dimensions: 3072,
  key: ({ messageId }) =>
    ULIDtoUUID(messageId.toUpperCase(), { nullOnInvalidInput: true }),
  name: MESSAGES_COLLECTION,
  payloadIndexes: [
    { field: "organizationId", schema: "keyword" },
    { field: "threadId", schema: "keyword" },
    { field: "messageId", schema: "keyword" },
  ],
  sparse: true,
});
