await Bun.build({
  entrypoints: ["./src/index.ts"],
  external: [
    // Don't bundle workspace packages - they should be resolved at runtime
    "@workspace/*",
    "api",
    "api/router",
    "api/schema",
    "api/queue",
  ],
  minify: false,
  outdir: "./dist",
  sourcemap: "none",
  target: "bun",
});
