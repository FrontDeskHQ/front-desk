import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    // oxfmt currently throws DataCloneError on these formats in this repo.
    "**/*.md",
    "**/*.mdx",
    "**/*.yml",
    "**/*.yaml",
    "**/*.html",
  ],
});
