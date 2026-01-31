import { processorRegistry } from "./registry";
import { embedProcessor } from "./embed";
import { findSimilarProcessor } from "./find-similar";
import { suggestLabelsProcessor } from "./suggest-labels";
import { suggestStatusProcessor } from "./suggest-status";
import { summarizeProcessor } from "./summarize";

export const registerDefaultProcessors = (): void => {
  console.log("Registering default processors...");

  processorRegistry.register(summarizeProcessor);
  processorRegistry.register(embedProcessor);
  processorRegistry.register(findSimilarProcessor);
  processorRegistry.register(suggestLabelsProcessor);
  processorRegistry.register(suggestStatusProcessor);

  console.log(`  Registered ${processorRegistry.getNames().length} processors:`);
  for (const name of processorRegistry.getNames()) {
    const processor = processorRegistry.get(name);
    const deps = processor?.dependencies.length
      ? `(depends on: ${processor.dependencies.join(", ")})`
      : "(no dependencies)";
    console.log(`    - ${name} ${deps}`);
  }
};
