import type { ServerDB } from "@live-state/sync/server";
import {
  type ActionKind,
  actionKindSchema,
  autonomousActionMetadataSchema,
} from "@workspace/schemas/signals";
import { ulid } from "ulid";
import { z } from "zod";
import type { schema } from "../live-state/schema";

export const recordAutonomousActionInputSchema = z
  .object({
    id: z.string().optional(),
    organizationId: z.string(),
    actionKind: actionKindSchema,
    entityId: z.string(),
    metadata: autonomousActionMetadataSchema,
    appliedAt: z.coerce.date().optional(),
  })
  .refine((input) => input.actionKind === input.metadata.kind, {
    path: ["actionKind"],
    message: "actionKind must match metadata.kind",
  });

type RecordAutonomousActionDb = Pick<
  ServerDB<typeof schema>,
  "autonomousAction"
>;

export const runRecordAutonomousAction = async (
  db: RecordAutonomousActionDb,
  input: z.infer<typeof recordAutonomousActionInputSchema>,
) => {
  return db.autonomousAction.insert({
    id: input.id ?? ulid().toLowerCase(),
    organizationId: input.organizationId,
    signalType: input.actionKind as ActionKind,
    entityId: input.entityId,
    appliedAt: input.appliedAt ?? new Date(),
    undoneAt: null,
    metadataStr: JSON.stringify(input.metadata),
  });
};
