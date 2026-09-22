await Bun.build({
  entrypoints: ["./src/index.ts"],
  external: ["@connectors/*"],
  minify: false,
  outdir: "./dist",
  sourcemap: "none",
  target: "bun",
});
