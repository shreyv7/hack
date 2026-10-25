# Vajra — Frontend

Vite + React 18 + TypeScript + Tailwind CSS v4.

## Setup

```bash
copy .env.example .env.local   # Windows — set VITE_API_BASE_URL
pnpm install
pnpm dev
```

`VITE_API_BASE_URL` should point at the backend (default `http://localhost:8000/api`). Never commit `.env` or `.env.local`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Dev server (default port 5173) |
| `pnpm build` | Typecheck + production build |
| `pnpm preview` | Preview production build |
| `pnpm typecheck` | `tsc --noEmit` |

## Layout

- `src/app/` — Application shell, pages, shared components
- `src/lib/` — Utilities and DPDPA reference helpers
- `src/types/` — Shared TypeScript types
- `src/styles/` — Global styles and theme tokens

Path alias: `@/*` → `src/*` (see `vite.config.ts` and `tsconfig.json`).
