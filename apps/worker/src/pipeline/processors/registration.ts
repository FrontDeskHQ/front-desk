import { embedProcessor } from "./embed";
import { embedMessagesProcessor } from "./embed-messages";
import { labelClassifierProcessor } from "./inline-track/label/processor";
import { statusInfererProcessor } from "./inline-track/status/processor";
import { processorRegistry } from "./registry";
import { summarizeProcessor } from "./summarize";
import { draftProcessor } from "./synthesis-track/draft/processor";
import { duplicateProcessor } from "./synthesis-track/duplicate/processor";

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

  // --- Synthesis-track generators (issues 05D–05G) ------------------------
  // Each generator issue adds its own `processorRegistry.register(...)` call
  // here for the synthesis-track processors: duplicate, draft, link_pr,
  // close. Each generator handles its own idempotency; no manual override is
  // required. Ordering is resolved by `resolveExecutionOrder()` from each
  // processor's `dependencies` (these run after summarize/embed).
  processorRegistry.register(duplicateProcessor);
  processorRegistry.register(draftProcessor);

  // --- Synthesize (issue 06) ----------------------------------------------
  // The synthesis stage consumes thread.synthesisCandidates and writes
  // thread.agentRead.

  console.log(
    `  Registered ${processorRegistry.getNames().length} processors:`,
  );
  for (const name of processorRegistry.getNames()) {
    const processor = processorRegistry.get(name);
    const deps = processor?.dependencies.length
      ? `(depends on: ${processor.dependencies.join(", ")})`
      : "(no dependencies)";
    console.log(`    - ${name} ${deps}`);
  }
};
