import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  // Tauri expects a fixed port and no clearing of the console
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // wrangler state + demo assets churn constantly — don't full-reload the app.
      // .mimosa hook-state writes caused an HMR/reload storm (blank page).
      ignored: ["**/worker/**", "**/.wrangler/**", "**/dist/**", "**/.mimosa/**"],
    },
  },
  build: { target: "es2022" },
  resolve: {
    alias: { "@": "/src" },
  },
});
