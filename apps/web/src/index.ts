import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import path from "node:path";

const app = new Elysia();

app.get("/health", () => ({ ok: true }));

const isProd = process.env.NODE_ENV === "production";
const appRoot = path.resolve(import.meta.dir, "..");
const publicDir = path.join(appRoot, "src", "public");
const coreBaseUrl = process.env.CORE_BASE_URL ?? "http://localhost:3000";

console.log(`Starting server in ${isProd ? "production" : "development"} mode...`);

app.use(
  staticPlugin({
    assets: publicDir,
    prefix: "/"
  })
);

app.all("/api/v1/*", async ({ request }) => {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, coreBaseUrl);
  const headers = new Headers(request.headers);
  headers.delete("host");

  return fetch(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body
  });
});

app.listen(3001);

console.log("Web UI server running at http://localhost:3001");
