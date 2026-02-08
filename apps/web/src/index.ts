import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import path from "node:path";

const app = new Elysia();

app.get("/health", () => ({ ok: true }));

app.use(
  staticPlugin({
    assets: "src/public",
    prefix: "/"
  })
);

app.listen(3001);

console.log("Web UI server running at http://localhost:3001");
