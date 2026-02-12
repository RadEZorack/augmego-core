import { defineConfig, loadEnv } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  return {
    root: path.resolve(__dirname),
    base: "/",
    build: {
      outDir: path.resolve(__dirname, "dist"),
      emptyOutDir: true
    },
    server: {
      port: 3001,
      strictPort: true,
      allowedHosts: ["dev.augmego.ca", "localhost"],
      proxy: {
        "/api/v1": {
          target: env.VITE_API_BASE_URL || "http://localhost:3000",
          ws: true
        }
      }
    }
  };
});
