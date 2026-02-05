# augmego-core

To install dependencies:

```bash
bun install
```

Database setup (Postgres):

```bash
# Update DATABASE_URL in .env if needed
bun run db:migrate -- --name init
bun run db:generate
```

To run:

```bash
bun run dev
```

Architecture overview:
- `src/index.ts` boots an Elysia HTTP server and wires routes.
- Prisma handles database access via the generated client (`@prisma/client`).
- `prisma/schema.prisma` is the source of truth for models and migrations.
- `.env` provides the `DATABASE_URL` used by Prisma and the app.

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
