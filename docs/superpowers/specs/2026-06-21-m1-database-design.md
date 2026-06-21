# M1 — Database Schema & Repositories: Design

**Status:** Approved (brainstorming complete)
**Date:** 2026-06-21
**Project:** Billo Auto-Trade (Telegram → MetaTrader 5 signal copier)
**PRD reference:** `docs/PRD.md` §22 Milestones, M1

---

## 1. Goal & Scope

Ship the persistence layer M7 (executor) and M3 (listener) need: a versioned Postgres schema applied by `node-pg-migrate`, a singleton `pg.Pool` with SSL/Railway support, four typed repositories, and a zod-validated env loader. Repo tests run locally only.

**In scope:** SQL schema + `001_init.sql`, JS-shim migrations, `node-pg-migrate` config, `src/db/pool.ts`, four `src/db/*.repo.ts` files, `src/config/env.ts` (zod), env loader tests, repo tests against Railway Postgres local-test DB, swap `src/util/logger.ts` to read from the new env loader.

**Out of scope (deferred):**

- Any Telegram / MT5 / parser / executor code → M2–M4, M7
- `src/index.ts` composition root → M7
- `Procfile`, `railway.json`, `.github/workflows/ci.yml` → M8
- CI execution of repo tests → M8
- `KILL_SWITCH` enforcement → M6 (env loader still validates it)

---

## 2. Decisions Resolved in Brainstorming

| Topic | Decision |
| --- | --- |
| Migration file format | **JS shim + raw SQL.** `migrations/` holds tiny `.ts` files that `readFileSync('sql/migrations/NNN_xxx.sql')` and execute it; sibling `NNN_xxx.down.sql` files for rollback. |
| Repo test scope | **Local-only.** Run with `DATABASE_URL_TEST` against a `billo_test` database on Railway Postgres. CI is M8. |
| Numeric return type | **Parse to `number` at the repo boundary** via `pg.types.setTypeParser(1700, parseFloat)` and `(20, parseInt)` for `bigint`. Callers receive plain JS numbers. |

---

## 3. File Layout (M1 additions only)

```
billo-auto-trade/
├── migrations/                        # NEW — node-pg-migrate shims
│   └── 1700000000001_init.ts          # up/down reads sql/migrations/001_init.sql
├── sql/
│   └── migrations/                    # NEW — the actual SQL
│       ├── 001_init.sql
│       └── 001_init.down.sql
├── src/
│   ├── config/
│   │   ├── env.ts                     # NEW — zod loader
│   │   └── env.test.ts                # NEW
│   ├── db/
│   │   ├── pool.ts                    # NEW — singleton pg.Pool
│   │   ├── types.ts                   # NEW — row types + numeric parsers
│   │   ├── signals.repo.ts
│   │   ├── signals.repo.test.ts
│   │   ├── parseResults.repo.ts
│   │   ├── parseResults.repo.test.ts
│   │   ├── trades.repo.ts
│   │   ├── trades.repo.test.ts
│   │   ├── errors.repo.ts
│   │   └── errors.repo.test.ts
│   └── util/
│       └── logger.ts                  # MODIFIED — reads env.LOG_LEVEL and env.TZ
├── .node-pg-migrate.json              # NEW
├── .env.test.example                  # NEW — template for DATABASE_URL_TEST
└── tsconfig.migrations.json           # NEW — minimal tsconfig for migration shims
```

Notes:

- Migration filenames are **timestamps in milliseconds** so node-pg-migrate's auto-sorting works and parallel branches don't collide.
- `sql/migrations/` holds the SQL humans review; `migrations/` holds the TS shim that node-pg-migrate imports.
- `.node-pg-migrate.json` points node-pg-migrate at the TS shim directory and at `sql/migrations/` for SQL file lookup.
- `.env.test.example` documents the `DATABASE_URL_TEST` shape; the real `.env.test` is git-ignored (covered by the existing `.env.*` rule in `.gitignore`).

---

## 4. Database Schema

Exactly the PRD §10.1 SQL, with two tiny corrections noted below. Saved as `sql/migrations/001_init.sql`:

```sql
-- One row per Telegram message we observed from the monitored channel.
CREATE TABLE signals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_message_id   bigint      NOT NULL,
  chat_id               text        NOT NULL,
  sender_user_id        bigint      NOT NULL,
  raw_text              text        NOT NULL,
  received_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_message_id)
);

-- One row per parse attempt for a signal.
CREATE TABLE parse_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  outcome         text NOT NULL CHECK (outcome IN ('ok','rejected')),
  rejection_reason text,
  direction       text CHECK (direction IN ('BUY','SELL')),
  pair_raw        text,
  pair_normalized text,
  sl              numeric(12,5),
  tp1             numeric(12,5),
  tp2             numeric(12,5),
  tp3             numeric(12,5),
  execution_price numeric(12,5),
  parsed_at       timestamptz NOT NULL DEFAULT now()
);

-- One row per attempt to place a trade on MT5.
CREATE TABLE trade_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id       uuid NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  parse_result_id uuid NOT NULL REFERENCES parse_results(id) ON DELETE CASCADE,
  status          text NOT NULL CHECK (status IN ('submitted','filled','rejected','error','dry_run')),
  broker_ticket   bigint,
  lot_size        numeric(10,2) NOT NULL,
  requested_symbol text NOT NULL,
  filled_symbol    text,
  filled_price     numeric(12,5),
  raw_error        text,
  attempted_at     timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

-- One row per uncaught exception (useful for post-mortems).
CREATE TABLE errors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id   uuid REFERENCES signals(id) ON DELETE SET NULL,
  message     text NOT NULL,
  stack       text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signals_received_at     ON signals (received_at DESC);
CREATE INDEX idx_parse_results_signal_id ON parse_results (signal_id);
CREATE INDEX idx_trade_attempts_signal_id ON trade_attempts (signal_id);
CREATE INDEX idx_trade_attempts_status   ON trade_attempts (status);
```

Companion `sql/migrations/001_init.down.sql` reverses in FK-safe order:

```sql
DROP TABLE IF EXISTS errors;
DROP TABLE IF EXISTS trade_attempts;
DROP TABLE IF EXISTS parse_results;
DROP TABLE IF EXISTS signals;
```

**Resolved PRD deltas:**

- PRD M1 says migrations are "idempotent" — node-pg-migrate tracks applied versions in a `pgmigrations` table, so each migration runs **exactly once**. DDL is **not** wrapped in `IF NOT EXISTS`. The PRD word "idempotent" is replaced with "versioned" throughout this design.
- `gen_random_uuid()` is built into Postgres 13+. Railway Postgres 15+ ships it; no `CREATE EXTENSION pgcrypto` needed. If a future downgrade happens, we add the extension in `001_init.sql` later.

---

## 5. Migration Runner

### 5.1 `.node-pg-migrate.json` (repo root)

```json
{
  "databaseUrl": ["DATABASE_URL", "DATABASE_URL_TEST"],
  "migrationsDir": "migrations",
  "migrationFileLanguage": "ts",
  "tsconfig": "tsconfig.migrations.json",
  "schema": "public",
  "createSchema": false,
  "createMigrationsSchema": true,
  "migrationTableName": "pgmigrations",
  "ignorePattern": "\\..*",
  "decamelize": false,
  "noLock": false,
  "singleTransaction": true
}
```

- `databaseUrl: ["DATABASE_URL", "DATABASE_URL_TEST"]` — node-pg-migrate tries `DATABASE_URL` first (production / local dev), falls back to `DATABASE_URL_TEST` (used by the repo tests and `db:migrate:test`).
- `migrationsDir: "migrations"` — where the TS shims live. node-pg-migrate does **not** need to know about `sql/migrations/` — the shim reads those files directly via `fs.readFileSync`.
- `migrationFileLanguage: "ts"` — shims are TS; run via `tsx` under the hood.
- `tsconfig.migrations.json` — separate minimal tsconfig for migrations (target ES2022, module NodeNext) so we don't pull the test-exclusion rule from the main `tsconfig.json` into migration compilation.

### 5.2 `migrations/1700000000001_init.ts`

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  const sql = readFileSync(
    join(process.cwd(), 'sql/migrations/001_init.sql'),
    'utf8',
  );
  await pgm.sql(sql);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  const sql = readFileSync(
    join(process.cwd(), 'sql/migrations/001_init.down.sql'),
    'utf8',
  );
  await pgm.sql(sql);
}
```

### 5.3 Additional npm scripts (added to `package.json`)

```json
{
  "db:migrate": "node-pg-migrate up",
  "db:rollback": "node-pg-migrate down",
  "db:migrate:test": "node-pg-migrate --envPath .env.test up",
  "db:rollback:test": "node-pg-migrate --envPath .env.test down",
  "db:reset:test": "npm run db:rollback:test && npm run db:migrate:test"
}
```

The `db:migrate:test` script uses `node-pg-migrate`'s built-in `--envPath` flag (documented in the upstream CLI) to load `.env.test` and pick up `DATABASE_URL_TEST` automatically. `--envPath` works because `dotenv` is installed as a runtime dep (§11) — node-pg-migrate shells out to it when loading the `.env` file.

---

## 6. Env Loader (`src/config/env.ts`)

One zod schema covers **all** env vars from PRD §8.6 + the new `TZ` and `KILL_SWITCH` requirements. Strict validation on first call — startup throws if anything required is missing.

`dotenv.config()` runs at module load so local `.env` (and `.env.test`) is picked up automatically. In Railway production, real env vars from the platform take precedence — `dotenv` does not override variables that are already set.

```ts
import 'dotenv/config';
import { z } from 'zod';

const numericString = (defaultValue?: number) =>
  z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (s === undefined || s === '') return defaultValue;
      const n = Number(s);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'not a number' });
        return z.NEVER;
      }
      return n;
    });

const boolString = z
  .string()
  .optional()
  .transform((s) => s === 'true' || s === '1');

const mt5Integration = z
  .enum(['metaapi', 'python-bridge', 'mt5-webrequest'])
  .default('metaapi');

const schema = z.object({
  DATABASE_URL: z.string().url(),
  TELEGRAM_API_ID: z.string().min(1),
  TELEGRAM_API_HASH: z.string().min(1),
  TELEGRAM_SESSION_STRING: z.string().min(1),
  TELEGRAM_CHANNEL_ID: z.string().min(1),
  TELEGRAM_ADMIN_USER_ID: numericString(),
  TELEGRAM_OWNER_CHAT_ID: z.string().min(1),
  PLATFORM_LABEL: z.string().default('MT5'),
  LOT_SIZE: numericString(0.01),
  MAGIC_NUMBER: numericString(778899),
  MT5_LOGIN: z.string().min(1),
  MT5_PASSWORD: z.string().min(1),
  MT5_SERVER: z.string().min(1),
  MT5_INTEGRATION: mt5Integration,
  METAAPI_TOKEN: z.string().min(1),
  METAAPI_ACCOUNT_ID: z.string().min(1),
  KILL_SWITCH: boolString,
  DRY_RUN: boolString,
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  TZ: z.string().default('Asia/Dubai'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed; see errors above.');
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
```

**Resolved PRD deltas:**

- `TELEGRAM_ADMIN_USER_ID` is in the schema as optional (PRD §8.1 FR-3 says optional); `undefined` when unset.
- `KILL_SWITCH` is validated here even though enforcement lives in M6 (it's already in `.env.example`).
- `MT5_INTEGRATION` enum includes both `metaapi` (current) and the two v2 paths (`python-bridge`, `mt5-webrequest`) so a future integration flip doesn't break startup.
- `METAAPI_TOKEN` and `METAAPI_ACCOUNT_ID` are hard-required because v1 only runs with `MT5_INTEGRATION=metaapi`. If a future integration flips, the schema needs a discriminator; out of scope for M1.

---

## 7. Pool (`src/db/pool.ts`)

```ts
import pg from 'pg';
import { env } from '../config/env.js';
import { configureNumericTypes } from './types.js';

configureNumericTypes();

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: shouldUseSsl(env.DATABASE_URL) ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30_000,
});

function shouldUseSsl(url: string): boolean {
  return !url.includes('localhost') && !url.includes('127.0.0.1');
}
```

- `max: 5` — plenty for a low-traffic listener; Railway Postgres free tier caps at 20 connections per project.
- `idleTimeoutMillis: 30_000` — releases idle connections to stay well under the cap.
- `ssl` is auto-enabled when the URL is not `localhost`/`127.0.0.1`. This matches the Railway requirement (PRD §21.6) without any extra config.
- `pg` env vars (`PGSSLMODE`, etc.) are still honoured by the underlying driver if set, so this is belt-and-suspenders rather than an override.

---

## 8. Repository Layer

All SQL lives in repo files — the executor never writes a raw query. Every repo function takes an optional `Executor` (`pg.Pool | pg.PoolClient`) defaulting to the singleton pool, so tests can pass their own pool for isolation.

### 8.1 `src/db/types.ts`

```ts
import pg from 'pg';

export function configureNumericTypes(): void {
  pg.types.setTypeParser(1700, (v) => (v === '' ? null : parseFloat(v))); // numeric
  pg.types.setTypeParser(20, (v) => (v === '' ? null : parseInt(v, 10))); // bigint
}

export type SignalRow = {
  id: string;
  telegram_message_id: number;
  chat_id: string;
  sender_user_id: number;
  raw_text: string;
  received_at: Date;
};

export type ParseResultRow = {
  id: string;
  signal_id: string;
  outcome: 'ok' | 'rejected';
  rejection_reason: string | null;
  direction: 'BUY' | 'SELL' | null;
  pair_raw: string | null;
  pair_normalized: string | null;
  sl: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  execution_price: number | null;
  parsed_at: Date;
};

export type TradeAttemptRow = {
  id: string;
  signal_id: string;
  parse_result_id: string;
  status: 'submitted' | 'filled' | 'rejected' | 'error' | 'dry_run';
  broker_ticket: number | null;
  lot_size: number;
  requested_symbol: string;
  filled_symbol: string | null;
  filled_price: number | null;
  raw_error: string | null;
  attempted_at: Date;
  completed_at: Date | null;
};

export type ErrorRow = {
  id: string;
  signal_id: string | null;
  message: string;
  stack: string | null;
  occurred_at: Date;
};

export type Executor = pg.Pool | pg.PoolClient;
```

### 8.2 Repo signatures

```ts
// signals.repo.ts
export function insertSignal(
  executor: Executor,
  input: {
    telegramMessageId: number;
    chatId: string;
    senderUserId: number;
    rawText: string;
  },
): Promise<SignalRow>;

export function getSignalById(
  executor: Executor,
  id: string,
): Promise<SignalRow | null>;

export function findByTelegramMessageId(
  executor: Executor,
  chatId: string,
  telegramMessageId: number,
): Promise<SignalRow | null>;

// parseResults.repo.ts
export function insertParseResult(
  executor: Executor,
  input: {
    signalId: string;
    outcome: 'ok' | 'rejected';
    rejectionReason?: string | null;
    direction?: 'BUY' | 'SELL' | null;
    pairRaw?: string | null;
    pairNormalized?: string | null;
    sl?: number | null;
    tp1?: number | null;
    tp2?: number | null;
    tp3?: number | null;
    executionPrice?: number | null;
  },
): Promise<ParseResultRow>;

export function getBySignalId(
  executor: Executor,
  signalId: string,
): Promise<ParseResultRow[]>;

// trades.repo.ts
export function insertTradeAttempt(
  executor: Executor,
  input: {
    signalId: string;
    parseResultId: string;
    status: TradeAttemptRow['status'];
    lotSize: number;
    requestedSymbol: string;
  },
): Promise<TradeAttemptRow>;

export function updateTradeAttemptStatus(
  executor: Executor,
  id: string,
  patch: Partial<
    Pick<
      TradeAttemptRow,
      | 'status'
      | 'broker_ticket'
      | 'filled_symbol'
      | 'filled_price'
      | 'raw_error'
      | 'completed_at'
    >
  >,
): Promise<TradeAttemptRow>;

export function getBySignalId(
  executor: Executor,
  signalId: string,
): Promise<TradeAttemptRow[]>;

// errors.repo.ts
export function recordError(
  executor: Executor,
  input: { message: string; stack?: string | null; signalId?: string | null },
): Promise<ErrorRow>;
```

All queries use `pg` parameterised queries (`$1, $2, ...`) — no string interpolation of user input.

### 8.3 Dedup contract for `insertSignal`

The `UNIQUE (chat_id, telegram_message_id)` constraint on `signals` makes `insertSignal` race-safe. A concurrent duplicate insert raises Postgres SQLSTATE `23505` (unique_violation). The repo wraps the insert in a `try/catch`:

- On `23505`: look up the existing row via `findByTelegramMessageId` and return it. No error propagated.
- On any other error: re-throw.

This means the listener can call `insertSignal` blindly and either get a freshly inserted row or the pre-existing one — both carry the same `id`, so downstream joins to `parse_results` work identically.

---

## 9. Logger Migration (M0 → M1)

`src/util/logger.ts` swaps from raw `process.env` reads to `env.LOG_LEVEL` and `env.TZ`:

```ts
import pino from 'pino';
import { env } from '../config/env.js';

function formatTimeInTz(): string {
  const formatted = new Date().toLocaleString('en-GB', {
    timeZone: env.TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `,"time":"${formatted}"`;
}

const logger = pino({
  level: env.LOG_LEVEL,
  timestamp: formatTimeInTz,
});

export default logger;
```

This resolves the M0 "Open Items" note that flagged the swap as future work.

---

## 10. Testing Strategy

### 10.1 Env loader tests (`src/config/env.test.ts`)

Pure unit, no DB. Cases:

- Valid minimal env (all required vars) → returns typed `env` object.
- Missing required var (e.g. `DATABASE_URL`) → throws with a clear message.
- Numeric coercion: `LOT_SIZE='0.01'` → `0.01`, `MAGIC_NUMBER='778899'` → `778899`, garbage string → throws.
- Boolean coercion: `DRY_RUN='true'` → `true`, `'false'` → `false`, `'1'` → `true`, unset → `false`.
- Enum defaults: `MT5_INTEGRATION` unset → `'metaapi'`, `LOG_LEVEL` unset → `'info'`, `TZ` unset → `'Asia/Dubai'`.

### 10.2 Repo tests (one `*.test.ts` per repo)

Each test file:

1. Reads `process.env.DATABASE_URL_TEST`; **throws if unset** (so accidental prod-DB usage is impossible).
2. Calls `configureNumericTypes()` from `src/db/types.ts` in a `beforeAll` hook. This is normally triggered by importing `pool.ts`, but repo tests bypass the singleton and need to call it explicitly so numeric columns parse to `number`.
3. Connects via a dedicated `pg.Pool` (not the singleton — keeps tests isolated).
4. `beforeEach`: runs `TRUNCATE errors, trade_attempts, parse_results, signals RESTART IDENTITY CASCADE` in a single statement. CASCADE handles FK order.
5. Test body: exercises each repo function with realistic data and asserts typed row shapes (snake_case columns correctly mapped, numeric columns parsed to `number`).

### 10.3 No CI integration in M1

`npm test` works locally only. The GitHub Actions workflow is M8's problem. A note in `README.md` documents that tests require `DATABASE_URL_TEST` set.

### 10.4 `.env.test.example`

```
DATABASE_URL_TEST=postgres://user:pass@host:5432/billo_test
```

---

## 11. New Dependencies

```json
{
  "dependencies": {
    "dotenv": "^16.4.5",
    "pg": "^8.13.0",
    "node-pg-migrate": "^8.0.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/pg": "^8.11.10"
  }
}
```

`dotenv` is added per PRD §6 ("Loaded via `dotenv` + a typed config module"). It serves three purposes: (1) `env.ts` calls `dotenv.config()` to load `.env` at module load, (2) `node-pg-migrate` uses it under the hood when `--envPath` is set for the `db:migrate:test` scripts, and (3) it is the standard local-dev `.env` mechanism for every future milestone.

---

## 12. Acceptance Criteria

Run from a clean clone, with `DATABASE_URL_TEST` pointing at a `billo_test` database:

| #   | Check                                                              | Command                                                                                  | Expected                                              |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Install adds new deps                                              | `npm install`                                                                            | exits 0                                               |
| 2   | Lint, test, build all green                                        | `npm run lint && npm test && npm run build`                                              | exits 0                                               |
| 3   | Migration up on a fresh DB                                        | `npm run db:migrate`                                                                     | exits 0; tables + indexes exist                       |
| 4   | Migration rollback                                                | `npm run db:rollback`                                                                    | exits 0; all M1 tables dropped                        |
| 5   | Migration version-tracking (re-run after rollback)                | `npm run db:migrate`                                                                     | exits 0, tables recreated, no duplicate errors        |
| 6   | Env loader rejects missing `DATABASE_URL`                         | unset `DATABASE_URL`, run a test that imports `env`                                      | throws with a clear message                           |
| 7   | Env loader accepts a full valid env                                | run `env.test.ts`                                                                        | all assertions pass                                   |
| 8   | Repo tests pass against Railway Postgres test DB                  | `DATABASE_URL_TEST=... npm test`                                                         | exits 0                                               |
| 9   | `insertSignal` is dedup-safe                                      | `signals.repo.test.ts`: two inserts with same `(chat_id, telegram_message_id)`           | returns the same row id, no error                     |
| 10  | Numeric parsing configured globally                                | insert a `numeric(12,5)` row via SQL, read back via repo                                | value is `number`, not `string`                       |
| 11  | `logger.ts` reads from `env`                                       | `grep "process.env" src/util/logger.ts`                                                  | no matches                                            |
| 12  | No SQL outside `src/db/`                                           | `rg "INSERT\|UPDATE\|DELETE\|SELECT" src/` excluding `src/db/`                           | no matches                                            |
| 13  | "MetaTrader 5" ban still holds                                     | append the literal to `src/db/signals.repo.ts`, run `npm run lint`, revert               | lint fails with custom message                        |

---

## 13. PRD Deltas Resolved During Brainstorming

| PRD location                              | PRD says                                  | Resolved as                                                                                      | Reason                                                                                                |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| M1 "raw SQL in `sql/migrations/`"         | raw SQL files                             | raw SQL + JS-shim migration that reads them                                                       | node-pg-migrate's native convention is JS; shim bridges the two cleanly. Owner picked this in Q1.     |
| M1 "migrations are idempotent"            | idempotent migrations                     | versioned migrations (run exactly once via `pgmigrations` table), no `IF NOT EXISTS`              | Versioned is more idiomatic; idempotent DDL hides bugs.                                                |
| M1 "`pgcrypto`" note                      | `gen_random_uuid()` requires pgcrypto     | no `CREATE EXTENSION`; rely on Postgres 13+ built-in                                              | Railway Postgres 15+ has it built in. Re-add the extension only if Railway ever downgrades.           |
| M1 env loader "one schema for all"        | one zod schema                            | confirmed; one schema covers all PRD §8.6 vars + `KILL_SWITCH` (already in `.env.example`)        | Owner confirmed; simplifies startup and tests.                                                        |
| Implicit: how `.env` is loaded             | PRD §6 says "via dotenv" but no dep listed | `dotenv` added as runtime dep, `env.ts` calls `dotenv.config()` at module load                    | Without it, local dev has no `.env` loader and `node-pg-migrate --envPath` doesn't work.              |
| M1 env loader `TELEGRAM_ADMIN_USER_ID`    | not in M1 features list                   | included as optional in schema                                                                   | PRD §8.1 marks it optional; better to validate than ignore.                                           |
| M1 repo tests                             | "using `DATABASE_URL_TEST`"               | confirmed; local-only                                                                            | Owner confirmed in Q2 — no GitHub Actions DB.                                                         |
| PRD §21.6 "honour `pg` env vars"          | honour `pg` env vars (e.g. `PGSSLMODE`)   | honour `pg` env vars + auto-SSL based on host                                                    | Belt-and-suspenders. `pg` reads `PGSSLMODE` natively; we add an explicit `ssl` block for the host heuristic so Railway works without env tinkering. |

---

## 14. Out of Scope (explicit)

- No Telegram, MT5, parser, executor, or composition-root code.
- No `Procfile`, `railway.json`, CI workflow — M8.
- No `KILL_SWITCH` enforcement (env loader validates it; M6 reads it).
- No `CREATE EXTENSION pgcrypto` (Postgres 15+ has `gen_random_uuid()` built in).
- No schema-per-tenant, no row-level security.
- No migrations past `001_init.sql`.
- No stored procedures, views, or triggers — keep v1 simple.

---

## 15. Open Items (carried forward)

- **`TELEGRAM_CHANNEL_ID`** is still the only runtime blocker before M3 can be exercised end-to-end (PRD §19). Not M1 work; flagged so it's not forgotten.
- **Indexes** match the PRD list exactly. If M9 soak-test reveals slow queries on `trade_attempts.attempted_at` or `parse_results.parsed_at`, add indexes then — premature optimisation now.
- The `pgmigrations` table is created by node-pg-migrate automatically on first run; no migration for it.
- The integration testing strategy (M7 executor end-to-end) is M7's job. M1 just verifies the repos in isolation.
