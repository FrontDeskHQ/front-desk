import { processorRegistry } from "./registry";
import { summarizeProcessor } from "./summarize";
import { embedProcessor } from "./embed";
import { findSimilarProcessor } from "./find-similar";

/**
 * Register all default processors
 *
 * Call this during worker initialization to set up the default pipeline.
 */
export const registerDefaultProcessors = (): void => {
  console.log("Registering default processors...");

  processorRegistry.register(summarizeProcessor);
  processorRegistry.register(embedProcessor);
  processorRegistry.register(findSimilarProcessor);

  console.log(`  Registered ${processorRegistry.getNames().length} processors:`);
  for (const name of processorRegistry.getNames()) {
    const processor = processorRegistry.get(name);
    const deps = processor?.dependencies.length
      ? `(depends on: ${processor.dependencies.join(", ")})`
      : "(no dependencies)";
    console.log(`    - ${name} ${deps}`);
  }
};
