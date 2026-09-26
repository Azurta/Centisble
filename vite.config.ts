import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build:online` makes one self-contained index.html (no sync server) that can be hosted anywhere.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "online" ? [viteSingleFile()] : [])],
  build: mode === "online" ? { outDir: "dist-online", chunkSizeWarningLimit: 4000 } : { chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
}));
