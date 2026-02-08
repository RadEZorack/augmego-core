import { defineConfig } from "vite";

export default defineConfig({
  root: "./client",
  build: {
    outDir: "../dist",
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
