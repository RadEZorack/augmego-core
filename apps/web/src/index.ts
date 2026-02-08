import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import path from "node:path";

const app = new Elysia();

app.get("/health", () => ({ ok: true }));

const isProd = process.env.NODE_ENV === "production";
const appRoot = path.resolve(import.meta.dir, "..");
const distDir = path.join(appRoot, "dist");
const clientDir = path.join(appRoot, "client");

console.log(`Starting server in ${isProd ? "production" : "development"} mode...`);

app.use(
  staticPlugin({
    assets: isProd ? distDir : clientDir,
    prefix: "/"
  })
);

app.get("*", async () => {
  const file = Bun.file(path.join(distDir, "index.html"));
  return (await file.exists())
    ? file
    : new Response("Build not found. Run `bun run build`.", { status: 404 });
});

app.listen(3001);

console.log("Web UI server running at http://localhost:3001");
