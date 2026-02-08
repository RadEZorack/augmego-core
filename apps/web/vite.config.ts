import { defineConfig } from "vite";

export default defineConfig({
  root: "src/public",
  build: {
    outDir: "../../dist",
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
