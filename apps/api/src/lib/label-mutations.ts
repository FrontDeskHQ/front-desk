import type { InferLiveObject } from "@live-state/sync";
import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";
import { z } from "zod";
import { schema } from "../live-state/schema";

export const attachLabelToThreadInputSchema = z.object({
  threadId: z.string(),
  labelId: z.string(),
  organizationId: z.string(),
  threadLabelId: z.string().optional(),
});

type LabelAttachDb = Pick<
  ServerDB<typeof schema>,
  "thread" | "label" | "threadLabel" | "transaction"
>;

type ThreadRow = InferLiveObject<typeof schema.thread>;
type LabelRow = InferLiveObject<typeof schema.label>;

export const runAttachLabelToThread = async (
  db: LabelAttachDb,
  input: z.infer<typeof attachLabelToThreadInputSchema>,
  options?: {
    preloadedThread?: ThreadRow;
    preloadedLabel?: LabelRow;
  },
) => {
  const thread =
    options?.preloadedThread ??
    (await db.thread
      .first({
        id: input.threadId,
        organizationId: input.organizationId,
      })
      .get());
  if (
    !thread ||
    thread.id !== input.threadId ||
    thread.organizationId !== input.organizationId
  ) {
    throw new Error("THREAD_NOT_FOUND");
  }

  const label =
    options?.preloadedLabel ??
    (await db.label
      .first({
        id: input.labelId,
        organizationId: input.organizationId,
      })
      .get());
  if (
    !label ||
    label.id !== input.labelId ||
    label.organizationId !== input.organizationId
  ) {
    throw new Error("LABEL_NOT_FOUND");
  }

  if (label.organizationId !== thread.organizationId) {
    throw new Error("LABEL_THREAD_ORGANIZATION_MISMATCH");
  }

  const threadLabelId = input.threadLabelId ?? ulid().toLowerCase();

  const attachResult = await db.transaction(async ({ trx }) => {
    const existing = await trx.threadLabel
      .first({
        threadId: input.threadId,
        labelId: input.labelId,
      })
      .get();

    if (existing?.enabled) {
      return {
        threadLabelId: existing.id,
        noOp: true as const,
      };
    }

    if (existing) {
      await trx.threadLabel.update(existing.id, { enabled: true });
      return {
        threadLabelId: existing.id,
        noOp: false as const,
      };
    }

    try {
      const created = await trx.threadLabel.insert({
        id: threadLabelId,
        threadId: input.threadId,
        labelId: input.labelId,
        enabled: true,
      });

      return {
        threadLabelId: created.id,
        noOp: false as const,
      };
    } catch {
      const concurrent = await trx.threadLabel
        .first({
          threadId: input.threadId,
          labelId: input.labelId,
        })
        .get();

      if (concurrent) {
        if (!concurrent.enabled) {
          await trx.threadLabel.update(concurrent.id, { enabled: true });
        }

        return {
          threadLabelId: concurrent.id,
          noOp: concurrent.enabled,
        };
      }

      throw new Error("THREAD_LABEL_ATTACH_FAILED");
    }
  });

  return {
    ...attachResult,
    label,
    thread,
  };
};
