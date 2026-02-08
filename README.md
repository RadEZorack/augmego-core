# augmego

This repo contains two Bun apps:
- `apps/core` — API only (Elysia + Prisma)
- `apps/web` — UI server (Elysia) + Three.js client build

## Install

Core:

```bash
cd apps/core
bun install
```

Web:

```bash
cd apps/web
bun install
```

## Database (Postgres)

```bash
cd apps/core
# Update DATABASE_URL in apps/core/.env if needed
bun run db:migrate -- --name init
bun run db:generate
```

## Run

Core API:

```bash
cd apps/core
bun run dev
```

Web UI server:

```bash
cd apps/web
bun run build
bun run start
```

## Architecture

- `apps/core/src/index.ts` boots the API server.
- `apps/core/prisma/schema.prisma` is the schema and migration source of truth.
- `apps/web/src/index.ts` serves `apps/web/dist` and exposes UI health.
- `apps/web/client` contains the Vite + Three.js client source.

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Extra Note

- three.js r160 is vendored under apps/web/src/public/vendor