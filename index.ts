import { Elysia } from "elysia";

const app = new Elysia()
  .get("/", () => "Hello from Elysia + Bun!")
  .get("/health", () => ({ ok: true }))
  .listen(3000);

console.log(
  `Elysia server running at http://${app.server?.hostname}:${app.server?.port}`
);
