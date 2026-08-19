import type { MessageOrigin } from "@workspace/schemas/message-roles";
import type { ReplyAction } from "@workspace/schemas/signals";
import { parse } from "@workspace/utils/md-tiptap";
import { ulid } from "ulid";

import type { ActionHandler, ExecutionContext } from "../types";

export const replyHandler: ActionHandler<ReplyAction> = {
  async apply(action, ctx) {
    const thread = await ctx.db.thread.one(ctx.threadId).get();
    if (!thread || thread.organizationId !== ctx.organizationId) {
      throw new Error("THREAD_NOT_FOUND");
    }

    const draft = action.draftMarkdown.trim();
    if (draft.length === 0) {
      throw new Error("REPLY_DRAFT_EMPTY");
    }

    const sender = await resolveSender(ctx, thread.assignedUserId);

    const existingAuthor = await ctx.db.author
      .first({
        organizationId: ctx.organizationId,
        userId: sender.userId,
      })
      .get();

    let authorId = existingAuthor?.id;
    if (!authorId) {
      authorId = ulid().toLowerCase();
      await ctx.db.author.insert({
        id: authorId,
        metaId: null,
        name: sender.userName,
        organizationId: ctx.organizationId,
        userId: sender.userId,
      });
    }

    const content = JSON.stringify(parse(draft));

    await ctx.db.message.insert({
      authorId,
      content,
      createdAt: new Date(),
      externalMessageId: null,
      id: ulid().toLowerCase(),
      // An actor id is what makes this an accept — the same test `resolveSender`
      // uses to decide who it goes out as.
      origin: (ctx.actorUserId
        ? "agent_read"
        : "agent_auto") satisfies MessageOrigin,
      threadId: ctx.threadId,
    });
  },
};

/**
 * Who the reply goes out as. The Agent has no identity of its own and never
 * authors a message (ADR 0017): an accepted reply is sent by whoever accepted
 * it, an autonomous one by the thread's assignee.
 *
 * Reply's action gate already refuses an unassigned thread, so throwing here
 * means the gate and this handler disagree — worth failing loudly over.
 */
const resolveSender = async (
  ctx: ExecutionContext,
  assignedUserId: string | null | undefined
): Promise<{ userId: string; userName: string }> => {
  // An actor id is what makes this an accept, so it decides on its own. Falling
  // through on a missing name would send a human's reply as someone else.
  if (ctx.actorUserId) {
    const userName =
      ctx.actorUserName ??
      (await ctx.db.user.one(ctx.actorUserId).get())?.name ??
      null;
    if (!userName) {
      throw new Error("REPLY_REQUIRES_SENDER");
    }
    return { userId: ctx.actorUserId, userName };
  }

  if (!assignedUserId) {
    throw new Error("REPLY_REQUIRES_SENDER");
  }

  const assignee = await ctx.db.user.one(assignedUserId).get();
  if (!assignee) {
    throw new Error("REPLY_REQUIRES_SENDER");
  }

  return { userId: assignedUserId, userName: assignee.name };
};
