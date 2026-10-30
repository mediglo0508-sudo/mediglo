import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  plugins: [],
  nitro: {
    preset: "node-server",
  },
  vite: {
    cacheDir: "./.vite",
    server: {
      host: "0.0.0.0",
      port: 3000,
    },
    resolve: {
      // Keep Start and application imports on one router context during HMR.
      dedupe: ["@tanstack/react-router", "@tanstack/router-core"],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
