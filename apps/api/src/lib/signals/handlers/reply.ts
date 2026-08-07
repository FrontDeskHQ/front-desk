import type { ReplyAction } from "@workspace/schemas/signals";
import { parse } from "@workspace/utils/md-tiptap";
import { ulid } from "ulid";

import { nextMessageInsertionSequence } from "../../message-sequence";
import type { ActionHandler } from "../types";

export const replyHandler: ActionHandler<ReplyAction> = {
  async apply(action, ctx) {
    if (!ctx.actorUserId || !ctx.actorUserName) {
      throw new Error("REPLY_REQUIRES_ACTOR");
    }
    const actorUserId = ctx.actorUserId;
    const actorUserName = ctx.actorUserName;

    const thread = await ctx.db.thread.one(ctx.threadId).get();
    if (!thread || thread.organizationId !== ctx.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const draft = action.draftMarkdown.trim();
    if (draft.length === 0) {
      throw new Error("REPLY_DRAFT_EMPTY");
    }

    const content = JSON.stringify(parse(draft));

    await ctx.db.transaction(async ({ trx }) => {
      const existingAuthor = await trx.author
        .first({
          organizationId: ctx.organizationId,
          userId: actorUserId,
        })
        .get();

      let authorId = existingAuthor?.id;
      if (!authorId) {
        authorId = ulid().toLowerCase();
        await trx.author.insert({
          id: authorId,
          metaId: null,
          name: actorUserName,
          organizationId: ctx.organizationId,
          userId: actorUserId,
        });
      }

      await trx.message.insert({
        authorId,
        content,
        createdAt: new Date(),
        externalMessageId: null,
        id: ulid().toLowerCase(),
        insertionSequence: await nextMessageInsertionSequence(
          trx,
          ctx.threadId
        ),
        origin: "agent_read",
        threadId: ctx.threadId,
      });
    });
  },
};
