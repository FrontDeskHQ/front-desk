import { defineConfig } from "tsdown";

export default defineConfig({
  clean: (process.env.NODE_ENV ?? "development") !== "development",
  dts: false,
  entry: [
    "./src/index.ts",
    "./src/live-state/router.ts",
    "./src/live-state/schema.ts",
    "./src/lib/queue.ts",
  ],
  noExternal: [/^@workspace\//, /^@connectors\//],
  platform: "node",
  target: "node20.18",
});
