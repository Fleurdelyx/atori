import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // per-build stamp: the app compares its own stamp against a fresh "/"
      // fetch and nudges a reload when a newer deploy is live (resumed tabs
      // otherwise run old code forever)
      name: "atori-build-id",
      transformIndexHtml: () => [
        {
          tag: "meta",
          attrs: { name: "atori-build", content: Date.now().toString(36) },
          injectTo: "head",
        },
      ],
    },
  ],
  worker: { format: "es" },
  // Tauri expects a fixed port and no clearing of the console
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // wrangler state + demo assets churn constantly: don't full-reload the app.
      // .mimosa hook-state writes caused an HMR/reload storm (blank page).
      ignored: ["**/worker/**", "**/.wrangler/**", "**/dist/**", "**/.mimosa/**"],
    },
  },
  build: { target: "es2022" },
  resolve: {
    alias: { "@": "/src" },
  },
});
