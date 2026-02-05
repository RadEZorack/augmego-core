import { Elysia } from "elysia";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const app = new Elysia()
  .get("/", () => "Hello from Elysia + Bun!")
  .get("/examples", async () => {
    return prisma.example.findMany({
      orderBy: { id: "desc" },
      take: 20,
    });
  })
  .get("/health", () => ({ ok: true }))
  .listen(3000);

console.log(
  `Elysia server running at http://${app.server?.hostname}:${app.server?.port}`
);
