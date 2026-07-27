import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

import * as MdxConfig from "./source.config";

export default defineConfig({
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    process.env.NODE_ENV === "production"
      ? cloudflare({ viteEnvironment: { name: "ssr" } })
      : undefined,
    tanstackStart(),
    viteReact(),
    mdx(MdxConfig),
  ],
  server: {
    cors: {
      credentials: true,
      origin: [/^http:\/\/([^.]+\.)?localhost(:\d+)?$/],
    },
    port: 3000,
  },
});
