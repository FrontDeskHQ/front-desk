import type { BuildConfig } from "bun";

export default {
  entrypoints: [
    "./src/index.ts",
    "./src/live-state/router.ts",
    "./src/live-state/schema.ts",
  ],
  outdir: "./dist",
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "none",
  external: [
    // Don't bundle workspace packages - they should be resolved at runtime
    /^@workspace\//,
    // Don't bundle the api package - it's a workspace dependency that should be resolved
    "api",
    "api/router",
    "api/schema",
  ],
} satisfies BuildConfig;
