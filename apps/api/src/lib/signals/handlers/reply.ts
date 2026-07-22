import type { ReplyAction } from "@workspace/schemas/signals";
import { parse } from "@workspace/utils/md-tiptap";
import { ulid } from "ulid";

import type { ActionHandler } from "../types";

export const replyHandler: ActionHandler<ReplyAction> = {
  async apply(action, ctx) {
    if (!ctx.actorUserId || !ctx.actorUserName) {
      throw new Error("REPLY_REQUIRES_ACTOR");
    }

    const thread = await ctx.db.thread.one(ctx.threadId).get();
    if (!thread || thread.organizationId !== ctx.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const draft = action.draftMarkdown.trim();
    if (draft.length === 0) {
      throw new Error("REPLY_DRAFT_EMPTY");
    }

    const existingAuthor = await ctx.db.author
      .first({
        organizationId: ctx.organizationId,
        userId: ctx.actorUserId,
      })
      .get();

    let authorId = existingAuthor?.id;
    if (!authorId) {
      authorId = ulid().toLowerCase();
      await ctx.db.author.insert({
        id: authorId,
        metaId: null,
        name: ctx.actorUserName,
        organizationId: ctx.organizationId,
        userId: ctx.actorUserId,
      });
    }

    const content = JSON.stringify(parse(draft));

    await ctx.db.message.insert({
      authorId,
      content,
      createdAt: new Date(),
      externalMessageId: null,
      id: ulid().toLowerCase(),
      origin: "agent_read",
      threadId: ctx.threadId,
    });
  },
};
