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

## GitHub -> DigitalOcean Deployment Pipeline

This repo includes a GitHub Actions workflow at:

- `.github/workflows/deploy-do-app-platform.yml`

What it does:

- On push to `main`, deploys `apps/core` only when `apps/core/**` changes.
- On push to `main`, deploys `apps/web` only when `apps/web/**` changes.
- Supports manual runs (`workflow_dispatch`) for `core`, `web`, or `both`.
- Runs basic app checks first (`db:generate` for core, `build` for web), then triggers a DigitalOcean deployment.

Required GitHub repository secrets:

- `DO_API_TOKEN`: DigitalOcean personal access token with App Platform permissions.
- `DO_CORE_APP_ID`: App ID for your backend app (`apps/core`).
- `DO_WEB_APP_ID`: App ID for your static frontend app (`apps/web`).

One-time DigitalOcean App Platform setup (per app):

- Core app (`apps/core`):
  - Type: Web Service
  - Source directory: `apps/core`
  - Build command: `bun install --frozen-lockfile`
  - Run command: `bun run start`
- Web app (`apps/web`):
  - Type: Static Site
  - Source directory: `apps/web`
  - Build command: `bun install --frozen-lockfile && bun run build`
  - Output directory: `dist`

Notes:

- The workflow triggers deployments using `doctl apps create-deployment <APP_ID> --wait`.
- Keep runtime env vars configured in each DigitalOcean app (for example `DATABASE_URL` on core and `VITE_API_BASE_URL` / `VITE_WS_URL` for web builds).
