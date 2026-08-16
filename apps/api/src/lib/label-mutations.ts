import type { InferLiveObject } from "@live-state/sync";
import type { ServerDB } from "@live-state/sync/server";
import { ulid } from "ulid";
import { z } from "zod";

import type { schema } from "../live-state/schema";

export const attachLabelToThreadInputSchema = z.object({
  labelId: z.string(),
  organizationId: z.string(),
  threadId: z.string(),
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
    /**
     * Re-read the label inside the attach transaction and reject it when it is
     * disabled. Callers acting on a client-side snapshot (inline suggestions)
     * need this: the label can be disabled between render and the click.
     */
    requireEnabledLabel?: boolean;
  }
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
    if (options?.requireEnabledLabel) {
      const current = await trx.label
        .first({
          id: input.labelId,
          organizationId: input.organizationId,
        })
        .get();

      if (!current) {
        throw new Error("LABEL_NOT_FOUND");
      }

      if (!current.enabled) {
        throw new Error("LABEL_DISABLED");
      }
    }

    const existing = await trx.threadLabel
      .first({
        labelId: input.labelId,
        threadId: input.threadId,
      })
      .get();

    if (existing?.enabled) {
      return {
        noOp: true as const,
        threadLabelId: existing.id,
      };
    }

    if (existing) {
      await trx.threadLabel.update(existing.id, { enabled: true });
      return {
        noOp: false as const,
        threadLabelId: existing.id,
      };
    }

    try {
      const created = await trx.threadLabel.insert({
        enabled: true,
        id: threadLabelId,
        labelId: input.labelId,
        threadId: input.threadId,
      });

      return {
        noOp: false as const,
        threadLabelId: created.id,
      };
    } catch {
      const concurrent = await trx.threadLabel
        .first({
          labelId: input.labelId,
          threadId: input.threadId,
        })
        .get();

      if (concurrent) {
        if (!concurrent.enabled) {
          await trx.threadLabel.update(concurrent.id, { enabled: true });
        }

        return {
          noOp: concurrent.enabled,
          threadLabelId: concurrent.id,
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
