import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";

const app = new Elysia();

app.get("/health", () => ({ ok: true }));

const isProd = process.env.NODE_ENV === "production";

app.use(
  staticPlugin({
    assets: isProd ? "./dist" : "./src/public",
    prefix: "/"
  })
);

app.get("*", async () => {
  const file = Bun.file("dist/index.html");
  return await file.exists() ? file : new Response("Build not found. Run `bun run build`.", { status: 404 });
});

app.listen(3001);

console.log("Web UI server running at http://localhost:3001");
