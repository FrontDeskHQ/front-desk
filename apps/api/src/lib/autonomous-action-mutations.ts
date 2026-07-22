import type { ServerDB } from "@live-state/sync/server";
import {
  actionKindSchema,
  autonomousActionMetadataSchema,
} from "@workspace/schemas/signals";
import type { ActionKind } from "@workspace/schemas/signals";
import { ulid } from "ulid";
import { z } from "zod";

import type { schema } from "../live-state/schema";

export const recordAutonomousActionInputSchema = z
  .object({
    actionKind: actionKindSchema,
    appliedAt: z.coerce.date().optional(),
    entityId: z.string(),
    id: z.string().optional(),
    metadata: autonomousActionMetadataSchema,
    organizationId: z.string(),
  })
  .refine((input) => input.actionKind === input.metadata.kind, {
    message: "actionKind must match metadata.kind",
    path: ["actionKind"],
  });

type RecordAutonomousActionDb = Pick<
  ServerDB<typeof schema>,
  "autonomousAction" | "thread"
>;

export const runRecordAutonomousAction = async (
  db: RecordAutonomousActionDb,
  input: z.infer<typeof recordAutonomousActionInputSchema>
) => {
  const thread = await db.thread
    .first({ id: input.entityId, organizationId: input.organizationId })
    .get();
  if (!thread) {
    throw new Error("THREAD_NOT_FOUND");
  }

  return db.autonomousAction.insert({
    appliedAt: input.appliedAt ?? new Date(),
    entityId: input.entityId,
    id: input.id ?? ulid().toLowerCase(),
    metadataStr: JSON.stringify(input.metadata),
    organizationId: input.organizationId,
    signalType: input.actionKind as ActionKind,
    undoneAt: null,
  });
};
