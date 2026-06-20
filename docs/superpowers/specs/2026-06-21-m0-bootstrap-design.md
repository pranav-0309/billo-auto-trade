# M0 — Repo Bootstrap & Tooling: Design

**Status:** Approved (brainstorming complete)
**Date:** 2026-06-21
**Project:** Billo Auto-Trade (Telegram → MetaTrader 5 signal copier)
**PRD reference:** `docs/PRD.md` §22 Milestones, M0

---

## 1. Goal & Scope

Bootstrap a runnable TypeScript repository that **lints, tests, and builds green** with zero business logic. The only production code shipped in M0 is `src/util/logger.ts`. All other milestones (M1–M7) layer on top of this baseline.

**In scope:** `git init`, `.gitignore`, `package.json`, `tsconfig.json`, ESLint flat config, Prettier, Vitest, pino logger, folder skeleton, `.nvmrc`, `.editorconfig`, `.env.example`, `README.md`.

**Out of scope (deferred to later milestones):**

- `src/index.ts` composition root → **M7**
- `Procfile`, `railway.json`, `.github/workflows/ci.yml` → **M8**
- Any DB / Telegram / MT5 / parser code → **M1+**
- Any test files (the first tests land with the env loader in **M1**, parser in **M2**)
- `LICENSE` file (PRD does not request one)

The scripts `npm run dev` and `npm start` are configured to match PRD §6.1 but **will not succeed until M7 adds `src/index.ts`**. This is expected per PRD §6.1 and is not an M0 acceptance criterion.

---

## 2. Folder Layout

```
billo-auto-trade/
├── docs/
│   ├── PRD.md                              (existing)
│   └── superpowers/
│       └── specs/                          (this file lives here)
├── src/
│   └── util/
│       └── logger.ts                       (the only M0 production code)
├── sql/                                    (empty; M1 populates)
├── scripts/                                (empty; M3 populates)
├── .editorconfig
├── .env.example
├── .gitignore
├── .nvmrc
├── .prettierrc.json
├── .prettierignore
├── README.md
├── eslint.config.js
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

**Note:** the PRD's M0 "Folder layout" list mentions a top-level `test/` directory. This design **drops `test/`** in favour of colocated tests (`src/**/*.test.ts`), matching PRD §11.1 and §16. This was resolved during brainstorming.

---

## 3. Configuration Files

### 3.1 `package.json`

- `"name": "billo-auto-trade"`, `"version": "0.0.0"`, `"private": true`
- `"type": "module"` (ESM)
- `"engines": { "node": ">=20" }`
- **Scripts** (verbatim per PRD §6.1):
  ```json
  {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "node-pg-migrate up",
    "db:rollback": "node-pg-migrate down"
  }
  ```
- **Runtime dependency:** `pino` (only)
- **Dev dependencies:** `typescript`, `tsx`, `@types/node`, `eslint` (v9.x), `@eslint/js`, `typescript-eslint` (`@typescript-eslint/eslint-plugin` + `@typescript-eslint/parser`), `eslint-config-prettier`, `prettier`, `vitest`, `@vitest/coverage-v8`

### 3.2 `tsconfig.json`

- `strict: true`
- `target: "ES2022"`
- `module: "NodeNext"`, `moduleResolution: "NodeNext"`
- `outDir: "dist"`, `rootDir: "src"`
- `esModuleInterop: true`, `resolveJsonModule: true`, `sourceMap: true`, `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`
- `include: ["src/**/*"]`
- `exclude: ["node_modules", "dist", "**/*.test.ts"]` — tests are still typechecked by Vitest at runtime; this keeps `dist/` free of test files

### 3.3 `eslint.config.js` (flat config)

Order matters — applied in array order:

1. `@eslint/js` recommended rules
2. TypeScript config scoped to `src/**/*.ts`:
   - Parser: `@typescript-eslint/parser`
   - Parser options: `ecmaVersion: 2022`, `sourceType: "module"`
   - Plugin: `@typescript-eslint` with `recommended` ruleset
3. Custom `no-restricted-syntax` rule (this is the PRD §19 #16 enforcement):
   ```js
   {
     selector: 'Literal[value="MetaTrader 5"]',
     message: 'Hardcoded "MetaTrader 5" is forbidden. Use PLATFORM_LABEL env var (PRD §8.5).',
   }
   ```
4. `ignores: ["dist/**", "node_modules/**", "coverage/**"]`
5. `eslint-config-prettier` last — turns off conflicting stylistic rules

### 3.4 `.prettierrc.json`

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

### 3.5 `.prettierignore`

```
dist
node_modules
coverage
```

### 3.6 `vitest.config.ts`

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
```

Vitest exits 0 when no test files match, so `npm test` is green in M0 with zero shipped tests.

### 3.7 `.gitignore`

Exactly the PRD §M0 list:

```
node_modules/
dist/
.env
.env.*
!.env.example
logs/
coverage/
.DS_Store
*.log
.railway/
```

### 3.8 `.nvmrc`

```
20
```

Mirrors the `engines.node` field in `package.json`.

### 3.9 `.editorconfig`

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

### 3.10 `.env.example`

A committed template that mirrors PRD §8.6 + §21.2, with `TZ=Asia/Dubai` (see PRD deltas below). Even though no zod-based env loader exists until M1, the file gives the owner a single place to record required variables:

```env
# --- Database (Railway Postgres; auto-injected on Railway, copy locally) ---
DATABASE_URL=postgres://user:pass@host:5432/dbname

# --- Telegram: GramJS user session (PRD §13) ---
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION_STRING=
TELEGRAM_CHANNEL_ID=
# TELEGRAM_ADMIN_USER_ID=        # optional; PRD §8.1 FR-3
TELEGRAM_OWNER_CHAT_ID=

# --- Trading ---
PLATFORM_LABEL=MT5
LOT_SIZE=0.01
MAGIC_NUMBER=778899

# --- MT5 (VT Markets) ---
MT5_LOGIN=
MT5_PASSWORD=
MT5_SERVER=VTMarkets-Demo
MT5_INTEGRATION=metaapi
METAAPI_TOKEN=
METAAPI_ACCOUNT_ID=

# --- Operational ---
DRY_RUN=false
LOG_LEVEL=info
TZ=Asia/Dubai
```

### 3.11 `README.md`

Sections required by PRD M0:

- One-liner: _"Telegram → MetaTrader 5 trade signal copier. Watches one Telegram channel, parses signals, places trades on a VT Markets MT5 account via MetaAPI. v1 is autonomous, demo-only, 0.01 lot, TP1-only."_
- **"Status: pre-implementation (M0 — repo bootstrap & tooling)"** banner
- Prerequisites: Node.js ≥ 20, npm ≥ 10
- Quickstart: `npm install`, `cp .env.example .env`, `npm run dev` (with a note that `dev` is a no-op until M7)
- Test: `npm test`, `npm run test:watch`
- Build: `npm run build`, `npm start` (with the same M7 caveat)
- Lint & format: `npm run lint`, `npm run format`
- Project layout: pointer to `src/`, `sql/`, `scripts/`, `docs/`
- Pointer to `docs/PRD.md` for the full product requirements

---

## 4. `src/util/logger.ts` (the only M0 production code)

```ts
import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';
const tz = process.env.TZ ?? 'Asia/Dubai';

function formatTimeInTz(): string {
  const formatted = new Date().toLocaleString('en-GB', {
    timeZone: tz,
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
  level,
  timestamp: formatTimeInTz,
});

export default logger;
```

**Design notes:**

- Reads `LOG_LEVEL` and `TZ` directly from `process.env`. The zod-validated env loader is M1's job — M0 deliberately does not introduce it.
- Default `TZ` is `Asia/Dubai` per PRD §8.6 (the canonical default).
- Custom `timestamp` function formats in the configured TZ, satisfying PRD §8.6: _"the pino logger … render in this zone."_ In dev with `pino-pretty`, this still parses cleanly. In prod with raw JSON to stdout, the `time` field is human-readable in the configured TZ.
- `en-GB` locale is used because its `toLocaleString` output is unambiguously `DD/MM/YYYY, HH:MM:SS` regardless of OS locale settings.

---

## 5. PRD Deltas Resolved During Brainstorming

| PRD location                     | PRD says                               | Resolved as                       | Reason                                                                                                                                  |
| -------------------------------- | -------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| M0 "Folder layout"               | includes `test/`                       | drop `test/`; tests colocated     | Owner chose colocated in Q1; matches PRD §11.1 (`src/parser/parse.test.ts`) and §16                                                     |
| PRD §21.2 line 742 (Railway env) | `TZ=UTC`                               | `TZ=Asia/Dubai`                   | PRD header, §8.6, §19.8 all say `Asia/Dubai`; line 742 was a copy-paste error                                                           |
| PRD §6.1 "Repo bootstrap"        | includes `Procfile` and `railway.json` | deferred to M8                    | `Procfile`'s `release: npm run db:migrate` would fail with no migrations yet (M1 introduces those); M8 owns deploy config               |
| M0 acceptance ("no-op codebase") | implied empty repo                     | `logger.ts` is the only code      | `tsc` needs at least one `.ts` file in `src/`; pino is the smallest thing that earns its keep and is explicitly listed in M0's features |
| M0 acceptance (test files)       | silent on tests                        | zero tests in M0                  | First tests land with env loader (M1) and parser (M2); Vitest exits 0 with no matches                                                   |
| Scripts `dev` / `start`          | listed in §6.1 bootstrap               | configured but won't run until M7 | Per §6.1; `npm run dev` requires `src/index.ts` which is M7's composition root                                                          |

---

## 6. Acceptance Criteria

Run from a clean clone:

| #   | Check                                          | Command                                                                                                                | Expected                                                |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Fresh install works                            | `npm install`                                                                                                          | exits 0                                                 |
| 2   | Lint is clean                                  | `npm run lint`                                                                                                         | exits 0                                                 |
| 3   | Test runs (no tests yet)                       | `npm test`                                                                                                             | exits 0 with "No test files found" message              |
| 4   | Build produces `dist/`                         | `npm run build`                                                                                                        | exits 0, `dist/util/logger.js` exists                   |
| 5   | All three green in one shot                    | `npm run lint && npm test && npm run build`                                                                            | exits 0                                                 |
| 6   | "MetaTrader 5" ban works                       | append literal `"MetaTrader 5"` to `src/util/logger.ts`, run `npm run lint`, then `git checkout -- src/util/logger.ts` | lint **fails** with custom error; after revert, exits 0 |
| 7   | Folder layout exists                           | `Test-Path src, sql, scripts, docs`                                                                                    | all exist                                               |
| 8   | `.env.example` is committed; `.env` is ignored | `git status`                                                                                                           | `.env.example` tracked, `.env` not tracked              |

---

## 7. Out of Scope (Explicit)

- No test files in M0 (M1 = env loader tests, M2 = parser tests)
- No `src/index.ts` (M7 composition root)
- No `Procfile`, `railway.json` (M8)
- No `.github/workflows/ci.yml` (M8)
- No `LICENSE` file (PRD does not request one)
- No DB connection or migration code (M1)
- No Telegram client code (M3)
- No MT5 / MetaAPI code (M4)

---

## 8. Open Items (carried into M1+)

These are **not** M0 work but are flagged so they are not lost:

- **`TELEGRAM_CHANNEL_ID`** is the only hard blocker for first-run (PRD §19). Must be supplied before M3 can be exercised end-to-end. Owner action, not code.
- **`TELEGRAM_ADMIN_USER_ID`** is optional in v1 (PRD §19 #5).
- The env loader (M1) will replace the bare `process.env` reads in `logger.ts` with the zod-validated object — `logger.ts` will be updated to import `env` rather than reading `process.env` directly.
