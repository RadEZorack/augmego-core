augmego/
├─ apps/
│  ├─ core/
│  │  ├─ src/
│  │  │  └─ index.ts          # API only (Elysia)
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  └─ migrations/
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  │
│  └─ web/
│     ├─ src/
│     │  └─ index.ts          # UI server (Elysia)
│     ├─ client/
│     │  ├─ index.html
│     │  └─ src/
│     │     ├─ main.ts
│     │     └─ style.css
│     ├─ dist/                # Vite build output
│     ├─ package.json
│     ├─ tsconfig.json
│     └─ vite.config.ts
│
├─ packages/
│  └─ shared/
│     └─ src/
│
├─ package.json
├─ bun.lockb
└─ README.md
