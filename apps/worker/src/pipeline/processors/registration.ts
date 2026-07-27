import { embedProcessor } from "./embed";
import { embedMessagesProcessor } from "./embed-messages";
import { labelClassifierProcessor } from "./inline-track/label/processor";
import { statusInfererProcessor } from "./inline-track/status/processor";
import { processorRegistry } from "./registry";
import { summarizeProcessor } from "./summarize";
import { duplicateProcessor } from "./synthesis-track/duplicate/processor";
import { relatedDocsProcessor } from "./synthesis-track/related_docs/processor";
import { relatedPrsProcessor } from "./synthesis-track/related_prs/processor";
import { synthesisProcessor } from "./synthesis-track/synthesis/processor";

export const registerDefaultProcessors = (): void => {
  console.log("Registering default processors...");

  processorRegistry.register(summarizeProcessor);
  processorRegistry.register(embedProcessor);
  processorRegistry.register(embedMessagesProcessor);

  // --- Inline-track generators (issues 05B–05C) ---------------------------
  // Each generator issue adds its own `processorRegistry.register(...)` call
  // here for the inline-track processors: label, status.
  processorRegistry.register(labelClassifierProcessor);
  processorRegistry.register(statusInfererProcessor);

  // --- Synthesis-track hint processors + synthesis agent --------------------
  // Hint processors (duplicate, related_docs, related_prs) emit evidence to
  // thread.hints. Synthesis reads the hint bag + thread state and emits a raw
  // action set. Each processor handles its own idempotency; no manual override
  // is required. Ordering is resolved by `resolveExecutionOrder()` from each
  // processor's `dependencies` (these run after summarize/embed).
  processorRegistry.register(duplicateProcessor);
  processorRegistry.register(relatedDocsProcessor);
  processorRegistry.register(relatedPrsProcessor);
  processorRegistry.register(synthesisProcessor);

  console.log(
    `  Registered ${processorRegistry.getNames().length} processors:`
  );
  for (const name of processorRegistry.getNames()) {
    const processor = processorRegistry.get(name);
    const deps = processor?.dependencies.length
      ? `(depends on: ${processor.dependencies.join(", ")})`
      : "(no dependencies)";
    console.log(`    - ${name} ${deps}`);
  }
};
