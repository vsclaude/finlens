import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // The renderer is a subdirectory rather than the repository root, so Vite is
  // pointed at it — `index.html` and `public/` live beside the code they belong
  // to instead of beside the main process'.
  root: fileURLToPath(new URL("./src/renderer", import.meta.url)),
  // Absolute, not relative: the packaged app is served from the app:// origin
  // (see src/main/protocol.ts), so root-absolute paths resolve the same way
  // they do against the dev server.
  base: "/",
  // `bun run dev --hmr=false` turns hot reload off (`scripts/dev.mjs` sets the
  // variable); the window then picks changes up on a reload.
  server: {
    hmr: process.env.APP_HMR !== "false",
  },
  build: {
    // Out of `src/`, and named to match `dist-electron/` beside it. Vite would
    // otherwise write into `src/renderer/dist`.
    outDir: fileURLToPath(new URL("./dist-renderer", import.meta.url)),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/renderer", import.meta.url)),
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
    },
  },
})
