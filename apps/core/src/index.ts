import { Elysia } from "elysia";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const api = new Elysia({ prefix: "/api/v1" })
  .get("/health", () => ({ ok: true }))
  .get("/examples", async () => {
    return prisma.example.findMany({
      orderBy: { id: "desc" },
      take: 20,
    });
  });

const app = new Elysia()
  .get("/", () => "Augmego Core API")
  .use(api)
  .listen(3000);

console.log(
  `Elysia server running at http://${app.server?.hostname}:${app.server?.port}`
);
