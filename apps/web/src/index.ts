import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import path from "node:path";

const app = new Elysia();

app.get("/health", () => ({ ok: true }));

const isProd = process.env.NODE_ENV === "production";
const appRoot = path.resolve(import.meta.dir, "..");
const distDir = path.join(appRoot, "dist");
const indexHtml = path.join(distDir, "index.html");
const coreBaseUrl = process.env.CORE_BASE_URL ?? "http://localhost:3000";

console.log(`Using core API base URL: ${coreBaseUrl}`);
console.log(`Starting server in ${isProd ? "production" : "development"} mode...`);

// Serve main HTML file
app.all("/", () => Bun.file(indexHtml));

// Serve static assets
app.use(
  staticPlugin({
    assets: distDir,
    prefix: "/"
  })
);

// Proxy API requests to the core server
app.all("/api/v1/*", ({ request }) => {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, coreBaseUrl);
  const headers = new Headers(request.headers);
  headers.delete("host");

  return fetch(target.toString(), {
    method: request.method,
    headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual"
  });
});

// SPA fallback for client-side routes (skip API + health)
app.all("*", ({ request }) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/v1/") || url.pathname === "/health") {
    return;
  }
  return Bun.file(indexHtml);
});

app.listen(3001);

console.log("Web UI server running at http://localhost:3001");
