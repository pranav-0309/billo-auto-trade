# M0 — Repo Bootstrap & Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a runnable TypeScript repository that lints, tests, and builds green, with a single pino logger as the only production code — the baseline for M1+.

**Architecture:** Standard Node.js + TypeScript ESM toolchain. All M0 artifacts are configuration files plus one logger module. ESLint flat config enforces a custom "no hardcoded MetaTrader 5" rule per PRD §19 #16. Vitest is configured with `passWithNoTests: true` so the absence of tests does not fail the suite. Future milestones (M1–M7) compose atop this baseline via `src/index.ts` (M7).

**Tech Stack:** Node.js ≥ 20, TypeScript 5 (strict, NodeNext), ESLint 9 (flat config) + `typescript-eslint`, Prettier 3, Vitest 2/3 + `@vitest/coverage-v8`, pino 9, npm scripts.

**Spec:** `docs/superpowers/specs/2026-06-21-m0-bootstrap-design.md`

---

## File Structure

### Files Created in M0

| Path                 | Responsibility                                                                    |
| -------------------- | --------------------------------------------------------------------------------- |
| `.gitignore`         | Exclude build artifacts, env files, logs, OS junk, Railway cache                  |
| `package.json`       | npm scripts, ESM type, engines, runtime + dev dependencies                        |
| `tsconfig.json`      | Strict TS, ES2022 target, NodeNext modules, excludes `**/*.test.ts`               |
| `eslint.config.js`   | Flat config: JS recommended + TS recommended + MetaTrader 5 ban + Prettier compat |
| `.prettierrc.json`   | Prettier defaults (single quotes, trailing commas)                                |
| `.prettierignore`    | Prettier skip paths (dist, node_modules, coverage)                                |
| `vitest.config.ts`   | Vitest config — `passWithNoTests: true`, v8 coverage configured                   |
| `.nvmrc`             | Node 20 version pin                                                               |
| `.editorconfig`      | 2-space indent, LF, UTF-8, trim trailing whitespace                               |
| `.env.example`       | Env var template (committed; real `.env` is gitignored)                           |
| `src/util/logger.ts` | The only M0 production code — pino logger reading LOG_LEVEL + TZ                  |
| `README.md`          | One-liner, prereqs, quickstart, "Status: pre-implementation" banner               |

### Files NOT Created (Deferred)

- `src/index.ts` → **M7** (composition root)
- `Procfile`, `railway.json`, `.github/workflows/ci.yml` → **M8** (deploy + CI)
- `LICENSE` → not requested by PRD
- Any test files → **M1** introduces env-loader tests; **M2** introduces parser tests

---

## Task 1: Create `.gitignore`

**Files:**

- Create: `.gitignore`

- [ ] **Step 1: Verify the repo is initialized**

Run from repo root:

```bash
git status
```

Expected: output shows "On branch main" with "docs/" as a tracked change (since brainstorming committed the spec) and "nothing else to commit" after we add files.

If git is not initialized, run `git init -b main` first.

- [ ] **Step 2: Create `.gitignore`**

Create the file `.gitignore` at the repo root with this exact content:

```gitignore
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

- [ ] **Step 3: Verify `.gitignore` is parsed correctly**

Run:

```bash
git check-ignore -v node_modules dist/.env .env.example
```

Expected output (one line per path that IS ignored):

```
.gitignore:1:node_modules/    node_modules
.gitignore:2:dist/    dist/.env
.gitignore:3:.env    .env
.gitignore:7:coverage/    coverage
```

The `.env.example` line should NOT appear (it is explicitly un-ignored).

- [ ] **Step 4: Commit**

```bash
rtk git add .gitignore
rtk git commit -m "chore: add .gitignore (node_modules, dist, env, logs, OS junk)"
```

---

## Task 2: Initialize `package.json` and install dependencies

**Files:**

- Create: `package.json`

- [ ] **Step 1: Create `package.json`**

Create the file `package.json` at the repo root with this exact content:

```json
{
  "name": "billo-auto-trade",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "node-pg-migrate up",
    "db:rollback": "node-pg-migrate down"
  },
  "dependencies": {
    "pino": "^9.5.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.13.0",
    "@types/node": "^20.17.6",
    "@typescript-eslint/eslint-plugin": "^8.12.2",
    "@typescript-eslint/parser": "^8.12.2",
    "@vitest/coverage-v8": "^2.1.4",
    "eslint": "^9.13.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.3.3",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "typescript-eslint": "^8.12.2",
    "vitest": "^2.1.4"
  }
}
```

Notes on what the engineer should know:

- Versions are pinned to current stable majors as of late 2024; npm install will pick the latest compatible.
- `node-pg-migrate` is intentionally NOT installed yet — M1 adds it.
- `dev` and `start` scripts are configured per PRD §6.1 but will not succeed until M7 adds `src/index.ts`. This is expected and is not an M0 acceptance criterion.

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: completes with `added N packages` and exits 0. `node_modules/` and `package-lock.json` are created. `node_modules/` is ignored by git (Task 1's `.gitignore`).

- [ ] **Step 3: Verify the lockfile is generated**

Run:

```bash
Test-Path package-lock.json
```

Expected: `True`.

- [ ] **Step 4: Commit**

```bash
rtk git add package.json package-lock.json
rtk git commit -m "chore: add package.json with toolchain + pino deps"
```

---

## Task 3: Configure TypeScript

**Files:**

- Create: `tsconfig.json`

- [ ] **Step 1: Create `tsconfig.json`**

Create the file `tsconfig.json` at the repo root with this exact content:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": false,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 2: Verify TypeScript accepts the config**

Run:

```bash
npx tsc --showConfig
```

Expected: prints a JSON dump of the resolved config and exits 0. There are no `.ts` files yet, so `tsc -p tsconfig.json` would be a no-op — `--showConfig` is the cleanest verification at this stage.

- [ ] **Step 3: Commit**

```bash
rtk git add tsconfig.json
rtk git commit -m "chore: add strict tsconfig.json (ES2022, NodeNext)"
```

---

## Task 4: Implement `src/util/logger.ts` and verify build

**Files:**

- Create: `src/util/logger.ts`

- [ ] **Step 1: Create the file with this exact content**

Create `src/util/logger.ts`:

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

Why this shape:

- Reads `LOG_LEVEL` and `TZ` directly from `process.env`. The zod-validated env loader lands in M1; M0 deliberately does not introduce it.
- Default `TZ` is `Asia/Dubai` per PRD §8.6 (canonical default).
- Custom `timestamp` formats in the configured TZ so logs render in Asia/Dubai by default.
- `en-GB` locale produces unambiguous `DD/MM/YYYY, HH:MM:SS` output regardless of OS locale.

- [ ] **Step 2: Verify TypeScript compiles**

Run:

```bash
npm run build
```

Expected: exits 0 with no output (or `tsc`'s normal compilation summary on larger projects).

- [ ] **Step 3: Verify the built artifact exists**

Run (PowerShell on Windows):

```powershell
Test-Path dist/util/logger.js
```

Expected: `True`.

If using bash:

```bash
ls -la dist/util/logger.js
```

Expected: file exists, non-zero size.

- [ ] **Step 4: Sanity-check the built logger runs**

Run (PowerShell on Windows):

```powershell
node -e "import('./dist/util/logger.js').then(m => m.default.info('m0 smoke')).catch(e => { console.error(e); process.exit(1); })"
```

Expected: a single JSON line is printed to stdout containing `"msg":"m0 smoke"` and a `time` field in `DD/MM/YYYY, HH:MM:SS` format (Asia/Dubai by default).

If using bash:

```bash
node --input-type=module -e "import('./dist/util/logger.js').then(m => m.default.info('m0 smoke'))"
```

Expected: same — one JSON line with `"msg":"m0 smoke"`.

- [ ] **Step 5: Commit**

```bash
rtk git add src/util/logger.ts
rtk git commit -m "feat: add pino logger with LOG_LEVEL + TZ (default Asia/Dubai)"
```

---

## Task 5: Configure Prettier

**Files:**

- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Create `.prettierrc.json`**

Create `.prettierrc.json` at the repo root with this exact content:

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

- [ ] **Step 2: Create `.prettierignore`**

Create `.prettierignore` at the repo root with this exact content:

```
dist
node_modules
coverage
```

(No leading `./` — Prettier's ignore list expects glob patterns relative to the project root.)

- [ ] **Step 3: Verify Prettier accepts the config and finds nothing to format**

Run:

```bash
npx prettier --check .
```

Expected: prints "Checking formatting..." and exits 0. (All files currently tracked in git are JSON/config files written by us — Prettier should be happy.)

- [ ] **Step 4: Commit**

```bash
rtk git add .prettierrc.json .prettierignore
rtk git commit -m "chore: add prettier config and ignore paths"
```

---

## Task 6: Configure ESLint (flat) with "MetaTrader 5" ban

**Files:**

- Create: `eslint.config.js`

- [ ] **Step 1: Create `eslint.config.js`**

Create `eslint.config.js` at the repo root with this exact content:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value="MetaTrader 5"]',
          message:
            'Hardcoded "MetaTrader 5" is forbidden. Use the PLATFORM_LABEL env var (PRD §8.5).',
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  prettier,
);
```

Notes for the engineer:

- We use the `typescript-eslint` meta-package which re-exports the parser and plugin — cleaner than importing them separately.
- `tseslint.config(...)` is the flat-config helper from `typescript-eslint` v8.
- `prettier` (the compat package) is spread last to disable ESLint stylistic rules that conflict with Prettier.
- The `no-restricted-syntax` rule fires on any `Literal` node whose value is exactly the string `"MetaTrader 5"` (the most common case). Template-literal bypass is not covered — that is acceptable for M0.

- [ ] **Step 2: Verify ESLint runs clean**

Run:

```bash
npm run lint
```

Expected: exits 0 with no errors. `src/util/logger.ts` should be linted successfully.

- [ ] **Step 3: Manually verify the "MetaTrader 5" ban works**

This is acceptance criterion #6. Do NOT commit this step.

Append a forbidden literal to `src/util/logger.ts`:

```bash
echo '' >> src/util/logger.ts
echo 'const _banProbe = "MetaTrader 5";' >> src/util/logger.ts
```

Run:

```bash
npm run lint
```

Expected: exits non-zero with an error message containing the rule message:

> `Hardcoded "MetaTrader 5" is forbidden. Use the PLATFORM_LABEL env var (PRD §8.5).`

Revert the probe:

```bash
rtk git checkout -- src/util/logger.ts
```

Verify the revert worked:

```bash
npm run lint
```

Expected: exits 0 again.

- [ ] **Step 4: Commit**

```bash
rtk git add eslint.config.js
rtk git commit -m "chore: add eslint flat config with MetaTrader 5 ban"
```

---

## Task 7: Configure Vitest

**Files:**

- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

Create `vitest.config.ts` at the repo root with this exact content:

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

Why `passWithNoTests: true`: M0 ships zero test files (tests land in M1 and M2). Without this flag, Vitest exits non-zero when no test files match the include pattern. Setting it explicitly makes the M0 baseline green by construction.

- [ ] **Step 2: Verify Vitest runs green with zero tests**

Run:

```bash
npm test
```

Expected: exits 0. Vitest should print a message indicating no test files were found (e.g., `"No test files found, exiting with code 0"`) and exit cleanly.

- [ ] **Step 3: Verify Vitest coverage toolchain is wired**

Run:

```bash
npx vitest run --coverage
```

Expected: exits 0. Since there are no test files, coverage output should be empty (no source files reported) but the toolchain itself must not error.

- [ ] **Step 4: Commit**

```bash
rtk git add vitest.config.ts
rtk git commit -m "chore: add vitest config (passWithNoTests, v8 coverage)"
```

---

## Task 8: Create meta files (`.nvmrc`, `.editorconfig`, `.env.example`)

**Files:**

- Create: `.nvmrc`
- Create: `.editorconfig`
- Create: `.env.example`

- [ ] **Step 1: Create `.nvmrc`**

Create `.nvmrc` at the repo root with this exact content (single line, no trailing newline issues):

```
20
```

This pins the Node major version. `nvm use` (or compatible) will switch to the latest installed Node 20.x.

- [ ] **Step 2: Create `.editorconfig`**

Create `.editorconfig` at the repo root with this exact content:

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

- [ ] **Step 3: Create `.env.example`**

Create `.env.example` at the repo root with this exact content:

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

Notes:

- `TELEGRAM_ADMIN_USER_ID` is commented out because it is optional in v1 (PRD §19 #5).
- `TZ=Asia/Dubai` follows the canonical PRD default (resolves a copy-paste error in PRD §21.2).
- Empty values signal "owner must supply".

- [ ] **Step 4: Verify `.env.example` is tracked but `.env` is not**

Run:

```bash
git check-ignore -v .env
git status --short .env.example
```

Expected:

- The first command prints a `.gitignore:3:.env  .env` line (proving `.env` is ignored).
- The second command prints nothing (the file is not modified — it's already tracked from this commit).

- [ ] **Step 5: Commit**

```bash
rtk git add .nvmrc .editorconfig .env.example
rtk git commit -m "chore: add .nvmrc, .editorconfig, .env.example"
```

---

## Task 9: Create `README.md`

**Files:**

- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

Create `README.md` at the repo root with this exact content:

````markdown
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
````

- [ ] **Step 2: Render the README to verify Markdown is well-formed**

Run (PowerShell):

```powershell
Get-Content README.md | Select-Object -First 5
```

Expected: prints the title, blank line, blockquote, blank line, "**Status:** ..." line, blank line, `## Prerequisites` line.

- [ ] **Step 3: Commit**

```bash
rtk git add README.md
rtk git commit -m "docs: add README with status banner, quickstart, and project layout"
```

---

## Task 10: Final acceptance verification

**Files:** none (read-only verification)

This task runs all M0 acceptance criteria from the design spec and confirms they pass. No file changes, no commit.

- [ ] **Step 1: Run the toolchain green check**

Run:

```bash
npm run lint && npm test && npm run build
```

Expected: all three exit 0. Output should show:

- ESLint: clean
- Vitest: "No test files found" but exits 0
- TypeScript: builds `dist/util/logger.js`

- [ ] **Step 2: Verify the "MetaTrader 5" ban still works after all changes**

Append a probe literal:

```bash
echo '' >> src/util/logger.ts
echo 'const _banProbe = "MetaTrader 5";' >> src/util/logger.ts
```

Run:

```bash
npm run lint
```

Expected: exits non-zero with the rule message.

Revert:

```bash
rtk git checkout -- src/util/logger.ts
```

Confirm revert:

```bash
npm run lint
```

Expected: exits 0.

- [ ] **Step 3: Verify folder layout**

Run (PowerShell):

```powershell
Test-Path src, sql, scripts, docs
```

Expected: `True` for each.

If using bash:

```bash
test -d src && test -d sql && test -d scripts && test -d docs && echo OK
```

Expected: prints `OK`.

- [ ] **Step 4: Verify `.gitignore` is in place**

Run:

```bash
git check-ignore -v node_modules dist/.env coverage
```

Expected: at least one line per path, all starting with `.gitignore:`.

- [ ] **Step 5: Verify git history**

Run:

```bash
rtk git log --oneline
```

Expected: 8 commits beyond the brainstorming commit:

1. `chore: add .gitignore (node_modules, dist, env, logs, OS junk)`
2. `chore: add package.json with toolchain + pino deps`
3. `chore: add strict tsconfig.json (ES2022, NodeNext)`
4. `feat: add pino logger with LOG_LEVEL + TZ (default Asia/Dubai)`
5. `chore: add prettier config and ignore paths`
6. `chore: add eslint flat config with MetaTrader 5 ban`
7. `chore: add vitest config (passWithNoTests, v8 coverage)`
8. `chore: add .nvmrc, .editorconfig, .env.example`
9. `docs: add README with status banner, quickstart, and project layout`

(Note: the brainstorming commit `docs: add PRD and M0 design spec` will appear at the top of the log.)

- [ ] **Step 6: M0 acceptance — done**

If every step above passed, M0 is complete. Hand off to M1 (Database schema & repositories).

---

## Self-Review (run by the plan author before handoff)

### 1. Spec coverage

| Spec section / requirement                             | Task(s) implementing it             |
| ------------------------------------------------------ | ----------------------------------- |
| Goal & scope (logger only)                             | Task 4                              |
| Folder layout                                          | Tasks 1–9 collectively              |
| `package.json` scripts (§6.1)                          | Task 2                              |
| `tsconfig.json` (strict, ES2022, NodeNext)             | Task 3                              |
| `eslint.config.js` (flat, with MetaTrader 5 ban)       | Task 6                              |
| `.prettierrc.json` + `.prettierignore`                 | Task 5                              |
| `vitest.config.ts`                                     | Task 7                              |
| `.gitignore`                                           | Task 1                              |
| `.nvmrc`                                               | Task 8                              |
| `.editorconfig`                                        | Task 8                              |
| `.env.example`                                         | Task 8                              |
| `src/util/logger.ts`                                   | Task 4                              |
| `README.md`                                            | Task 9                              |
| All 8 acceptance criteria from spec §6                 | Task 10                             |
| PRD deltas (no `test/`, TZ default, Procfile deferral) | Tasks 1, 4, 7 (no Procfile created) |

No gaps.

### 2. Placeholder scan

- No "TBD", "TODO", "implement later", or "fill in details".
- No "add appropriate error handling" or "similar to Task N".
- Every file-creation step shows the complete file content.
- Every verification step shows the exact command and the expected outcome.

### 3. Type / name consistency

- The single exported symbol in `src/util/logger.ts` is `logger` (default export). No other tasks reference it by name.
- Vitest config uses `defineConfig` from `vitest/config`. Matches `vitest` 2.x API.
- ESLint config uses `tseslint.config(...)` from `typescript-eslint` v8. Matches the installed dep.
- Package.json scripts match PRD §6.1 exactly: `build`, `start`, `dev`, `lint`, `format`, `test`, `test:watch`, `db:migrate`, `db:rollback`.
- `.gitignore` list matches PRD M0 list exactly (plus the `!.env.example` un-ignore line which the spec implies).

No inconsistencies.
