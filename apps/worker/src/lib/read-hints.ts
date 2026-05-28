import type {
  DuplicateEvidence,
  HintKind,
  Hints,
  HintSlot,
  RelatedDocsEvidence,
} from "@workspace/schemas/signals";
import { fetchClient } from "./database/client";

type SlotEvidenceMap = {
  duplicate: DuplicateEvidence;
  related_docs: RelatedDocsEvidence;
};

export async function readHintBag(threadId: string): Promise<Hints> {
  const rows = (await fetchClient.query.thread
    .where({ id: threadId })
    .get()) as Array<{ hints: Hints | null }>;
  return rows[0]?.hints ?? {};
}

export async function writeHintSlot<K extends HintKind>(
  threadId: string,
  kind: K,
  evidence: SlotEvidenceMap[K] | null,
  hash: string,
): Promise<void> {
  const current = await readHintBag(threadId);
  const slot: HintSlot<SlotEvidenceMap[K]> = {
    evidence,
    hash,
    computedAt: new Date().toISOString(),
  };
  const next: Hints = {
    ...current,
    [kind]: slot,
  };
  await fetchClient.mutate.thread.update(threadId, {
    hints: next,
  });
}
