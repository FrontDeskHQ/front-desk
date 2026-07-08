import type {
  DuplicateEvidence,
  HintKind,
  HintSlot,
  Hints,
  RelatedDocsEvidence,
} from "@workspace/schemas/signals";
import { fetchClient } from "./database/client";

type SlotEvidenceMap = {
  duplicate: DuplicateEvidence;
  related_docs: RelatedDocsEvidence;
};

export async function readHintBag(threadId: string): Promise<Hints> {
  const rows = (await fetchClient.query.thread.byIds({
    ids: [threadId],
  })) as Array<{ hints: Hints | null }>;
  return rows[0]?.hints ?? {};
}

/**
 * Writes a single hint slot. The read-modify-write of `thread.hints` runs
 * server-side inside a transaction (see `runWriteHintSlot`) so synthesis-track
 * processors that finish in the same parallel turn don't clobber each other's
 * slots via last-writer-wins.
 */
export async function writeHintSlot<K extends HintKind>(
  threadId: string,
  organizationId: string,
  kind: K,
  evidence: SlotEvidenceMap[K] | null,
  hash: string,
): Promise<void> {
  const computedAt = new Date().toISOString();

  if (kind === "duplicate") {
    const slot: HintSlot<DuplicateEvidence> = {
      evidence: evidence as DuplicateEvidence | null,
      hash,
      computedAt,
    };
    await fetchClient.mutate.thread.writeHintSlot({
      threadId,
      organizationId,
      kind: "duplicate",
      slot,
    });
  } else {
    const slot: HintSlot<RelatedDocsEvidence> = {
      evidence: evidence as RelatedDocsEvidence | null,
      hash,
      computedAt,
    };
    await fetchClient.mutate.thread.writeHintSlot({
      threadId,
      organizationId,
      kind: "related_docs",
      slot,
    });
  }
}
