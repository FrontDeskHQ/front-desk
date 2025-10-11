import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "./src/index.ts",
    "./src/live-state/router.ts",
    "./src/live-state/schema.ts",
  ],
  target: "node20.18",
  clean: (process.env.NODE_ENV ?? "development") !== "development",
  dts: false,
  platform: "node",
  noExternal: [/^@workspace\//],
});
