# Billo Auto-Trade

> Telegram → MetaTrader 5 trade signal copier. Watches one Telegram channel, parses signals, places trades on a VT Markets MT5 account via MetaAPI. v1 is autonomous, demo-only, 0.01 lot, TP1-only.

**Status: pre-implementation (M0 — repo bootstrap & tooling)**

## Prerequisites

- Node.js ≥ 20 (see `.nvmrc`)
- npm ≥ 10

## Quickstart

```bash
npm install
cp .env.example .env       # then fill in real values for your environment
npm run dev                # tsx watch — placeholder until M7 wires src/index.ts
```

## Test

```bash
npm test           # vitest run (one-shot)
npm run test:watch # vitest watch mode
```

## Build

```bash
npm run build      # tsc → dist/
npm start          # node dist/index.js — placeholder until M7
```

## Lint & format

```bash
npm run lint       # eslint .
npm run format     # prettier --write .
```

## Project layout

```
src/        TypeScript source. M0 ships only `util/logger.ts`. The parser, listener, executor, and notifier land in M1–M7.
sql/        Schema migrations (M1+).
scripts/    One-off scripts such as `telegram-auth.ts` (M3).
docs/       Product requirements and design specs.
```

See `docs/PRD.md` for the full product requirements and milestone breakdown (M0–M10).
See `docs/superpowers/specs/` for design specs produced during brainstorming.

## Notes

- `npm run dev` and `npm start` are configured per PRD §6.1 but will not succeed until M7 adds `src/index.ts`. This is expected.
- ESLint enforces a no-hardcoded-`MetaTrader 5` rule (use the `PLATFORM_LABEL` env var). See `eslint.config.js`.
