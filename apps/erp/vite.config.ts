import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  plugins: [],
  nitro: {
    preset: "node-server",
    externals: {
      external: ["cloudflare:workers"],
    },
    rollupConfig: {
      external: ["cloudflare:workers"],
    },
  },
  vite: {
    server: {
      host: "0.0.0.0",
      port: 3000,
    },
    resolve: {
      // Keep Start and application imports on one router context during HMR.
      dedupe: ["@tanstack/react-router", "@tanstack/router-core"],
    },
    build: {
      rollupOptions: {
        external: ["cloudflare:workers"],
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
