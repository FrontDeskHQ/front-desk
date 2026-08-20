import { embedProcessor } from "./embed";
import { labelClassifierProcessor } from "./inline-track/label/processor";
import { processorRegistry } from "./registry";
import { summarizeProcessor } from "./summarize";
import { duplicateProcessor } from "./synthesis-track/duplicate/processor";
import { relatedDocsProcessor } from "./synthesis-track/related_docs/processor";
import { relatedIssuesProcessor } from "./synthesis-track/related_issues/processor";
import { relatedPrsProcessor } from "./synthesis-track/related_prs/processor";
import { synthesisProcessor } from "./synthesis-track/synthesis/processor";

export const registerDefaultProcessors = (): string[] => {
  processorRegistry.register(summarizeProcessor);
  processorRegistry.register(embedProcessor);
  // TODO(FRO-224): `messages-v1` is retired — per-message embedding produced the
  // largest collection in Qdrant to serve a flag-gated search page and one Agent
  // tool, neither of which used message-level granularity. `embedMessagesProcessor`
  // is left in the tree, unregistered, so the search rewrite can reuse or delete it
  // deliberately rather than reconstruct it from history.

  // --- Inline suggestions --------------------------------------------------
  // One producer, one kind (ADR 0014): synthesis owns status, since it already
  // gathers the evidence that finishes a thread. What is left here is genuine
  // classification over the thread's opening content.
  processorRegistry.register(labelClassifierProcessor);

  // --- Synthesis-track hint processors + synthesis agent --------------------
  // Hint processors (duplicate, related_docs, related_prs, related_issues) emit evidence to
  // thread.hints. Synthesis reads the hint bag + thread state and emits a raw
  // action set. Each processor handles its own idempotency; no manual override
  // is required. Ordering is resolved by `resolveExecutionOrder()` from each
  // processor's `dependencies` (these run after summarize/embed).
  processorRegistry.register(duplicateProcessor);
  processorRegistry.register(relatedDocsProcessor);
  processorRegistry.register(relatedPrsProcessor);
  processorRegistry.register(relatedIssuesProcessor);
  processorRegistry.register(synthesisProcessor);

  return processorRegistry.getNames();
};
