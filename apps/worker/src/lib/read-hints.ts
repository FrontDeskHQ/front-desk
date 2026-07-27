import type {
  DuplicateEvidence,
  HintKind,
  HintSlot,
  Hints,
  RelatedDocsEvidence,
  RelatedPrsEvidence,
} from "@workspace/schemas/signals";

import { fetchClient } from "./database/client";

interface SlotEvidenceMap {
  duplicate: DuplicateEvidence;
  related_docs: RelatedDocsEvidence;
  related_prs: RelatedPrsEvidence;
}

export async function readHintBag(threadId: string): Promise<Hints> {
  const rows = (await fetchClient.query.thread.byIds({
    ids: [threadId],
  })) as { hints: Hints | null }[];
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
  hash: string
): Promise<void> {
  const computedAt = new Date().toISOString();

  if (kind === "duplicate") {
    const slot: HintSlot<DuplicateEvidence> = {
      computedAt,
      evidence: evidence as DuplicateEvidence | null,
      hash,
    };
    await fetchClient.mutate.thread.writeHintSlot({
      kind: "duplicate",
      organizationId,
      slot,
      threadId,
    });
  } else if (kind === "related_prs") {
    const slot: HintSlot<RelatedPrsEvidence> = {
      computedAt,
      evidence: evidence as RelatedPrsEvidence | null,
      hash,
    };
    await fetchClient.mutate.thread.writeHintSlot({
      kind: "related_prs",
      organizationId,
      slot,
      threadId,
    });
  } else {
    const slot: HintSlot<RelatedDocsEvidence> = {
      computedAt,
      evidence: evidence as RelatedDocsEvidence | null,
      hash,
    };
    await fetchClient.mutate.thread.writeHintSlot({
      kind: "related_docs",
      organizationId,
      slot,
      threadId,
    });
  }
}
