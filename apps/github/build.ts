await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  minify: false,
  sourcemap: "none",
  external: [
    // Don't bundle workspace packages - they should be resolved at runtime
    "@workspace/*",
    "api",
    "api/router",
    "api/schema",
  ],
});
