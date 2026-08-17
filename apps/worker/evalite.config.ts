import { defineConfig } from "evalite/config";

export default defineConfig({
  setupFiles: ["./evalite.setup.ts"],
  maxConcurrency: 3,
  testTimeout: 180_000,
});
