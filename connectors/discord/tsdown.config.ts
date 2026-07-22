import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: false,
  entry: [
    "./src/index.ts",
    "./src/live-state/router.ts",
    "./src/live-state/schema.ts",
  ],
  noExternal: [/^@workspace\//, /^@connectors\//],
  platform: "node",
  target: "node20.18",
});
