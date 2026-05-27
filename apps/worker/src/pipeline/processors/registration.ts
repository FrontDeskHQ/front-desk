import { embedProcessor } from "./embed";
import { embedMessagesProcessor } from "./embed-messages";
import { processorRegistry } from "./registry";
import { summarizeProcessor } from "./summarize";

export const registerDefaultProcessors = (): void => {
  console.log("Registering default processors...");

  processorRegistry.register(summarizeProcessor);
  processorRegistry.register(embedProcessor);
  processorRegistry.register(embedMessagesProcessor);
  // TODO(signals-overhaul, issue 05/06): inline-track generators (label,
  // status) and synthesis-track (duplicate, draft, link_pr, close) will be
  // registered here once the new pipeline lands. The legacy find-similar
  // processor (which wrote to the dropped suggestion table) was removed in
  // issue 02.

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
