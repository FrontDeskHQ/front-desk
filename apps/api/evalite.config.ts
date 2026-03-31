import { defineConfig } from "evalite/config";

export default defineConfig({
  maxConcurrency: 3,
  testTimeout: 120_000,
  trialCount: 3,
});
