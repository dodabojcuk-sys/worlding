import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: resolve(fileURLToPath(new URL(".", import.meta.url))),
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    port: Number(process.env.STORY_STUDIO_VITE_PORT || 4191),
    strictPort: true,
    proxy: {
      "/__local/story-studio": `http://127.0.0.1:${Number(process.env.PORT || 4192)}`
    }
  }
});
