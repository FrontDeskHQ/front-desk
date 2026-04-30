import type { ServerDB } from "@live-state/sync/server";
import {
  type AutonomousActionMetadata,
  type AutonomyLevel,
  LOCKED_SIGNAL_TYPES,
  type SignalType,
} from "@workspace/schemas/signals";
import { ulid } from "ulid";
import { schema } from "../live-state/schema";

type DB = ServerDB<typeof schema>;

export function canDoAutonomously(
  signalType: SignalType,
  level: AutonomyLevel,
): boolean {
  if (level !== "auto") return false;
  if (LOCKED_SIGNAL_TYPES.includes(signalType)) return false;
  return true;
}

export async function listPendingSignals(db: DB, organizationId: string) {
  const rows = Object.values(
    await db.find(schema.suggestion, {
      where: {
        organizationId,
        active: true,
        dismissedAt: null,
        actedAt: null,
      },
    }),
  );
  return rows.sort((a, b) => (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0));
}

export async function listAutonomousActions(
  db: DB,
  organizationId: string,
  since: Date,
) {
  const rows = Object.values(
    await db.find(schema.autonomousAction, {
      where: { organizationId, undoneAt: null },
    }),
  );
  return rows
    .filter((r) => r.appliedAt >= since)
    .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime());
}

export async function recordAutonomousAction(
  db: DB,
  input: {
    organizationId: string;
    signalType: SignalType;
    entityId: string;
    metadata: AutonomousActionMetadata;
  },
) {
  const now = new Date();
  return db.insert(schema.autonomousAction, {
    id: ulid().toLowerCase(),
    organizationId: input.organizationId,
    signalType: input.signalType,
    entityId: input.entityId,
    appliedAt: now,
    undoneAt: null,
    metadataStr: JSON.stringify(input.metadata),
  });
}
