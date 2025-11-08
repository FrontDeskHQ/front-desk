import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3333",
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ""),
        ws: true,
        rewriteWsOrigin: true,
      },
    },
    cors: {
      origin: [/^http:\/\/([^.]+\.)?localhost(:\d+)?$/],
      credentials: true,
    },
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    process.env.NODE_ENV === "production"
      ? cloudflare({ viteEnvironment: { name: "ssr" } })
      : undefined,
    tanstackStart(),
    viteReact(),
  ],
});
