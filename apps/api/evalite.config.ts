import { defineConfig } from "evalite/config";

export default defineConfig({
  maxConcurrency: 2,
  testTimeout: 60000,
  trialCount: 3,
});
