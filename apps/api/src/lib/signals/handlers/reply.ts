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
        userId: ctx.actorUserId,
        organizationId: ctx.organizationId,
      })
      .get();

    let authorId = existingAuthor?.id;
    if (!authorId) {
      authorId = ulid().toLowerCase();
      await ctx.db.author.insert({
        id: authorId,
        userId: ctx.actorUserId,
        metaId: null,
        name: ctx.actorUserName,
        organizationId: ctx.organizationId,
      });
    }

    const content = JSON.stringify(parse(draft));

    await ctx.db.message.insert({
      id: ulid().toLowerCase(),
      authorId,
      content,
      threadId: ctx.threadId,
      createdAt: new Date(),
      origin: "agent_read",
      externalMessageId: null,
    });
  },
};
