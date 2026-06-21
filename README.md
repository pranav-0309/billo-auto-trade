# Billo Auto-Trade

> Telegram → MetaTrader 5 trade signal copier. Watches one Telegram channel, parses signals, places trades on a VT Markets MT5 account via MetaAPI. v1 is autonomous, demo-only, 0.01 lot, TP1-only.

**Status: in progress (M1 — database & repositories; M0 complete)**

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

## Test database setup

Tests require a `billo_test` Postgres database on the same Postgres instance as the production DB. Provision it once:

1. In Railway dashboard → your Postgres service → "Data" tab → run:

   ```sql
   CREATE DATABASE billo_test;
   ```

2. Copy the connection string from the Postgres "Connect" tab. Change the database name from `railway` (or whatever the prod DB is named) to `billo_test`.

3. Locally:

   ```bash
   cp .env.test.example .env.test
   # edit .env.test and paste the billo_test connection string into DATABASE_URL_TEST
   ```

4. Run migrations against the test DB:

   ```bash
   npm run db:migrate:test
   ```

Then `npm test` runs the full suite (env loader tests + repo tests). The vitest config sets `fileParallelism: false` so the repo tests run serially against the shared test DB.

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
src/        TypeScript source. M1 ships `config/env.ts`, `db/{pool,types,signals.repo,parseResults.repo,trades.repo,errors.repo}.ts`, and `util/logger.ts`. The parser, listener, executor, and notifier land in M2–M7.
sql/        Schema migrations (M1+).
scripts/    One-off scripts such as `telegram-auth.ts` (M3).
docs/       Product requirements and design specs.
```

See `docs/PRD.md` for the full product requirements and milestone breakdown (M0–M10).
See `docs/superpowers/specs/` for design specs produced during brainstorming.

## Notes

- `npm run dev` and `npm start` are configured per PRD §6.1 but will not succeed until M7 adds `src/index.ts`. This is expected.
- ESLint enforces a no-hardcoded-`MetaTrader 5` rule (use the `PLATFORM_LABEL` env var). See `eslint.config.js`.
