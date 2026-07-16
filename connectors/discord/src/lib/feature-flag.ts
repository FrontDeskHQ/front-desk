import { createReflagClient } from "@connectors/framework/runtime";

// Singleton Reflag client for feature flags.
export const reflagClient = createReflagClient();
