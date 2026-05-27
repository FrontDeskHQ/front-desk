import type {
  Action,
  CloseAction,
  LinkPrAction,
  MarkDuplicateAction,
  ReplyAction,
  SynthesisCandidates,
  SynthesisCandidateSlot,
} from "@workspace/schemas/signals";
import { fetchClient } from "./database/client";

type SlotActionMap = {
  duplicate: MarkDuplicateAction;
  draft: ReplyAction;
  link_pr: LinkPrAction;
  close: CloseAction;
};

export type SynthesisGenerator = keyof SlotActionMap;

export async function writeSynthesisCandidateSlot<G extends SynthesisGenerator>(
  threadId: string,
  generator: G,
  input: { candidate: SlotActionMap[G] | null; hash: string },
): Promise<void> {
  const current = await readSynthesisCandidates(threadId);
  const slot: SynthesisCandidateSlot<SlotActionMap[G]> = {
    candidate: input.candidate,
    hash: input.hash,
    computedAt: new Date().toISOString(),
  };
  const next: SynthesisCandidates = {
    ...current,
    [generator]: slot,
  };
  await fetchClient.mutate.thread.update(threadId, {
    synthesisCandidates: next,
  });
}

export async function readSynthesisCandidates(
  threadId: string,
): Promise<SynthesisCandidates> {
  const rows = (await fetchClient.query.thread
    .where({ id: threadId })
    .get()) as Array<{ synthesisCandidates: SynthesisCandidates | null }>;
  return rows[0]?.synthesisCandidates ?? {};
}

export type { Action };
