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
│     │  ├─ index.ts          # UI server (Elysia)
│     │  └─ public/
│     │     ├─ index.html
│     │     ├─ main.ts
│     │     └─ style.css
│     ├─ package.json
│     └─ tsconfig.json
│
├─ packages/
│  └─ shared/
│     └─ src/
│
├─ package.json
├─ bun.lockb
└─ README.md
