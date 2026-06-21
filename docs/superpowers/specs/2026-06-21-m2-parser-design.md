# M2 — Signal Parser (Pure Module): Design

**Status:** Approved (brainstorming complete)
**Date:** 2026-06-21
**Project:** Billo Auto-Trade (Telegram → MetaTrader 5 signal copier)
**PRD reference:** `docs/PRD.md` §22 Milestones, M2
**Depends on:** M0

---

## 1. Goal & Scope

Deliver the pure parsing layer M7 (executor) and M3 (listener) need to turn raw Telegram message text into a typed `ParsedSignal` (or a rejection reason). Zero I/O — no DB, no Telegram, no HTTP, no clock, no environment access.

**In scope (M2):**

- `src/parser/types.ts` — `Direction`, `ParsedSignal`, `RejectionReason`, `ParseResult`.
- `src/parser/regex.ts` — the six regexes from PRD §7.5, exported as named constants.
- `src/parser/parse.ts` — pure `parse()` + private per-field extractor helpers.
- `src/parser/parse.test.ts` — every case in PRD §16 + the M2 additions, with full `ParseResult` equality assertions.
- `src/config/pairs.ts` — `PAIRS` map (17 entries) + `normalize()` helper.
- `src/config/pairs.test.ts` — unit tests for the map alone.
- `eslint.config.js` — add `no-restricted-imports` for `src/parser/**` to enforce the "no I/O imports" acceptance criterion.

**Out of scope (deferred):**

- Telegram listener / raw message ingestion → M3.
- MT5 adapter, executor wiring, retries → M4, M7.
- Owner notifier templates, rejection DM formatting → M5.
- Health endpoint, graceful shutdown → M6.
- Composition root (`src/index.ts`) that wires `parse()` into the pipeline → M7.
- `scripts/telegram-auth.ts` → M3.
- GitHub Actions workflow that runs parser tests in CI → M8.
- v2 multi-TP child orders (TP2/TP3 are captured into `ParsedSignal` but never acted on) → v2 roadmap.

---

## 2. Decisions Resolved in Brainstorming

| Topic | Decision |
| --- | --- |
| Rejection reporting | **Short-circuit on first failure.** `parse()` walks fields in a fixed order — header → pair → SL → TP1 → SL≠TP1 — and returns the first `null` as the typed reason. Matches the PRD M2 literal-union type exactly. A message missing both SL and TP1 reports only the first missing one. |
| Pair-normalization tests | **Separate `src/config/pairs.test.ts`.** `parse.test.ts` exercises `parse()` end-to-end; the map gets its own dedicated tests. Matches the M1 "one `*.test.ts` per source file" convention. |
| Implementation discipline | **Strict TDD.** Red → green per case from the PRD §16 + M2 additions list. Coverage is built up case-by-case, not retrofitted. |
| Internal parser structure | **Per-field extractor helpers + orchestrator.** Private `extractHeader`, `extractPositiveNumber`, `extractOptionalNumber` helpers each handle one field. `parse()` calls them in order and short-circuits on the first `null`. Public API stays `parse(text): ParseResult`. |
| `missing_direction` / `missing_pair` reasons | **Dropped from the union.** The header regex enforces direction + pair atomically; splitting them adds union members the parser can never produce. Final union: `'wrong_format' \| 'invalid_pair' \| 'missing_sl' \| 'missing_tp1' \| 'invalid_number' \| 'sl_equals_tp1'`. |
| Pair auto-split fallback | **Not implemented.** All 17 PRD pairs are enumerated explicitly in the map; any pair outside the list returns `null` (parser rejects with `invalid_pair`). YAGNI — auto-split would mask typos like `EUURSD`. |

---

## 3. File Layout (M2 additions only)

```
billo-auto-trade/
├── src/
│   ├── config/
│   │   ├── pairs.ts                       # NEW — PAIRS map + normalize()
│   │   └── pairs.test.ts                  # NEW — unit tests for pairs.ts
│   └── parser/
│       ├── regex.ts                       # NEW — the 6 regexes from PRD §7.5
│       ├── types.ts                       # NEW — ParsedSignal, ParseResult, RejectionReason
│       ├── parse.ts                       # NEW — parse() + private extractors
│       └── parse.test.ts                  # NEW — full test suite
└── eslint.config.js                       # MODIFIED — add no-restricted-imports for src/parser/**
```

No `index.ts` barrel — callers import named symbols directly (`import { parse } from './parser/parse.js'`). Matches M1.

---

## 4. Public API & Types

### 4.1 `src/parser/types.ts`

```ts
export type Direction = 'BUY' | 'SELL';

export type ParsedSignal = {
  direction: Direction;
  pairRaw: string;             // 'EURUSD' (as it appeared in the message)
  pairNormalized: string;      // 'EUR/USD' (broker form, from src/config/pairs.ts)
  sl: number;                  // positive finite number
  tp1: number;                 // positive finite number, sl !== tp1
  tp2: number | null;          // optional in v1 — captured for v2
  tp3: number | null;          // optional in v1 — captured for v2
  executionPrice: number | null; // optional in v1
};

export type RejectionReason =
  | 'wrong_format'   // no header line matching 🔼BUY|🔽SELL + 6-letter pair
  | 'invalid_pair'   // header regex matched but pair not in the PAIRS map
  | 'missing_sl'     // no 🔴 SL: line
  | 'missing_tp1'    // no 🟢 TP1: line
  | 'invalid_number' // SL or TP1 present but not a finite positive number (NaN, neg, zero, ∞)
  | 'sl_equals_tp1'; // semantic: zero-range trade

export type ParseResult =
  | { outcome: 'ok'; parsed: ParsedSignal }
  | { outcome: 'rejected'; reason: RejectionReason };
```

### 4.2 Public function

```ts
export function parse(text: string): ParseResult;
```

- **Pure**: no `Date.now()`, no `Math.random()`, no I/O, no environment access.
- **Synchronous**: returns the result directly.
- **Total**: every input maps to a `ParseResult` — no thrown exceptions for normal inputs.
- **Side-effect-free**: no logging, no global state.

`parse()` is the only public symbol from `src/parser/`. The extractor helpers and regex constants are module-private (extractors) or exported-but-internal (regex constants, used by the test file via the same import path).

---

## 5. Internal Algorithm

### 5.1 `src/parser/regex.ts` — exported constants

The six regexes from PRD §7.5, verbatim:

```ts
export const RE_HEADER = /^\s*(?:🔼BUY|🔽SELL)\s+([A-Z]{6})\s*$/m;
export const RE_SL      = /🔴\s*SL\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
export const RE_TP1     = /🟢\s*TP1\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
export const RE_TP2     = /🟢\s*TP2\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
export const RE_TP3     = /🟢\s*TP3\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
export const RE_EXEC    = /Execution\s*Price\s*:\s*([0-9]+(?:\.[0-9]+)?)/i;
```

Notes:

- `RE_HEADER` carries the `m` flag so it scans line-by-line. `RE_SL`, `RE_TP1`, `RE_TP2`, `RE_TP3` match anywhere in the string; they ignore which line they sit on. This matches PRD §7.5.
- Direction match is **case-sensitive** (`BUY`, `SELL` uppercase). Per PRD §7.3.
- Pair regex is `[A-Z]{6}` — uppercase only, exactly six letters. PRD §7.4 validation.

### 5.2 Per-field extractors (private to `parse.ts`)

The orchestrator needs to distinguish **three** outcomes from a number field: line missing, line present but unparseable/invalid, line present and valid. So `extractNumber` returns a discriminated union, not a bare `number | null`.

```ts
type ExtractedHeader = { direction: Direction; pairRaw: string } | null;
type NumberExtraction =
  | { kind: 'ok'; value: number }
  | { kind: 'missing' }
  | { kind: 'invalid' };  // regex matched but value isn't a finite positive number

function extractHeader(text: string): ExtractedHeader;
function extractNumber(text: string, re: RegExp): NumberExtraction;
function extractOptionalNumber(text: string, re: RegExp): number | null;
function normalizePairOrNull(raw: string): string | null;
```

- **`extractHeader`** — runs `RE_HEADER.exec(text)`. Returns `null` on no match. On match, returns `{ direction: match[0].includes('🔼') ? 'BUY' : 'SELL', pairRaw: match[1] }`.
- **`extractNumber`** — runs `re.exec(text)`. If no match → `{ kind: 'missing' }`. If match, runs `Number(match[1])`. Returns `{ kind: 'invalid' }` if the result is `NaN`, `Infinity`, `-Infinity`, `0`, or negative; otherwise `{ kind: 'ok', value: n }`. PRD §7.4: "finite positive numbers".
- **`extractOptionalNumber`** — same regex and parse semantics as `extractNumber`, but collapses missing/invalid into `null` (since neither is fatal for the optional TP2/TP3/executionPrice fields). Used only on lines whose absence must not produce a rejection.
- **`normalizePairOrNull`** — calls `normalize(header.pairRaw)` from `src/config/pairs.ts` and returns whatever `normalize` returns. v1 imports directly (no DI).

These helpers are **not exported** from `parse.ts`. Tests target `parse()` end-to-end; the helpers are private implementation detail.

### 5.3 `parse()` orchestrator

```ts
export function parse(text: string): ParseResult {
  const header = extractHeader(text);
  if (!header) return { outcome: 'rejected', reason: 'wrong_format' };

  const pairNormalized = normalizePairOrNull(header.pairRaw);
  if (!pairNormalized) return { outcome: 'rejected', reason: 'invalid_pair' };

  const slResult = extractNumber(text, RE_SL);
  if (slResult.kind === 'missing') return { outcome: 'rejected', reason: 'missing_sl' };
  if (slResult.kind === 'invalid') return { outcome: 'rejected', reason: 'invalid_number' };

  const tp1Result = extractNumber(text, RE_TP1);
  if (tp1Result.kind === 'missing') return { outcome: 'rejected', reason: 'missing_tp1' };
  if (tp1Result.kind === 'invalid') return { outcome: 'rejected', reason: 'invalid_number' };

  const sl = slResult.value;
  const tp1 = tp1Result.value;
  if (sl === tp1) return { outcome: 'rejected', reason: 'sl_equals_tp1' };

  return {
    outcome: 'ok',
    parsed: {
      direction: header.direction,
      pairRaw: header.pairRaw,
      pairNormalized,
      sl,
      tp1,
      tp2: extractOptionalNumber(text, RE_TP2),
      tp3: extractOptionalNumber(text, RE_TP3),
      executionPrice: extractOptionalNumber(text, RE_EXEC),
    },
  };
}
```

### 5.4 Behavioural notes

- **No geometric / R:R validation.** PRD §7.4 + decision log #10 — admin is trusted blindly. A BUY with TP below SL is accepted as-is.
- **Whitespace tolerance.** `RE_HEADER` accepts leading whitespace on the header line and any amount of horizontal whitespace around the pair. Blank lines between fields are fine.
- **Order matters.** `header → pair → SL (missing/invalid) → TP1 (missing/invalid) → SL≠TP1`. The orchestrator branches on each `NumberExtraction` variant so the typed `RejectionReason` is precise: a missing SL line is `missing_sl`, an unparseable SL is `invalid_number`. The `sl_equals_tp1` check fires only after both SL and TP1 parsed as finite positives.
- **TP-only messages** (TP1 present, TP2/TP3 missing) → `{ outcome: 'ok', parsed: { …, tp2: null, tp3: null } }`. PRD §7.3 says TP2/TP3 are optional.
- **Trailing junk** after the `⚠️ Manage your risks` footer is silently ignored — `RE_HEADER` is anchored to a single line, and the field regexes don't care what comes after.
- **Empty / whitespace-only input** → `extractHeader` returns `null` → `wrong_format`. Tested explicitly.

---

## 6. Pair Normalization (`src/config/pairs.ts`)

### 6.1 The map

```ts
const PAIRS: Readonly<Record<string, string>> = {
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  GBPJPY: 'GBP/JPY',
  AUDUSD: 'AUD/USD',
  USDCAD: 'USD/CAD',
  USDCHF: 'USD/CHF',
  NZDUSD: 'NZD/USD',
  EURJPY: 'EUR/JPY',
  EURGBP: 'EUR/GBP',
  EURCHF: 'EUR/CHF',
  AUDJPY: 'AUD/JPY',
  EURAUD: 'EUR/AUD',
  EURCAD: 'EUR/CAD',
  GBPCHF: 'GBP/CHF',
  CADJPY: 'CAD/JPY',
  CHFJPY: 'CHF/JPY',
};
```

### 6.2 The function

```ts
export function normalize(rawPair: string): string | null {
  return PAIRS[rawPair] ?? null;
}
```

### 6.3 Why a flat map (no auto-split)

- YAGNI for v1: every signal the admin posts is one of these 17.
- Auto-split would mask typos (`EUURSD` → `EUURS/D`, which is worse than rejecting).
- Broker-specific suffixes (`m`, `.i`) are a v2+ concern; an 18th pair becomes a one-line map entry.
- Failure mode is clean: parser rejects with `invalid_pair`, owner gets a DM, one-line code change.

---

## 7. ESLint Enforcement

`eslint.config.js` gains a `no-restricted-imports` block for `src/parser/**` that blocks every I/O path the module must not touch:

```js
{
  files: ['src/parser/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: '../db', message: 'src/parser/ is a pure module — no DB (PRD §22 M2).' },
        { name: '../db/*', message: 'src/parser/ is a pure module — no DB (PRD §22 M2).' },
        { name: '../telegram', message: 'src/parser/ is a pure module — no Telegram (PRD §22 M2).' },
        { name: '../telegram/*', message: 'src/parser/ is a pure module — no Telegram (PRD §22 M2).' },
        { name: '../executor', message: 'src/parser/ is a pure module — no executor (PRD §22 M2).' },
        { name: '../executor/*', message: 'src/parser/ is a pure module — no executor (PRD §22 M2).' },
        { name: '../util', message: 'src/parser/ is a pure module — no util/logger (PRD §22 M2).' },
        { name: '../util/*', message: 'src/parser/ is a pure module — no util/logger (PRD §22 M2).' },
        { name: '../config/env', message: 'src/parser/ is a pure module — no env loader (PRD §22 M2).' },
      ],
    }],
  },
},
```

`../config/pairs` is **not** in the block list — `parse.ts` legitimately imports `normalize` from there. Everything else is blocked. The existing M0 rule banning the literal string `"MetaTrader 5"` still applies; the parser doesn't reference the platform label anyway.

---

## 8. Test Strategy

Two test files. **Strict TDD** — each case is written as a failing test before the corresponding code path exists.

### 8.1 `src/parser/parse.test.ts`

**Canonical (ok) cases:**

- `BUY EURUSD` with all fields + footer → full `ParsedSignal` with TP2/TP3/executionPrice populated.
- `SELL EURUSD` with all fields → `direction: 'SELL'`, otherwise identical.
- `BUY EURUSD` without TP2/TP3 → `tp2 === null`, `tp3 === null`.
- `BUY EURUSD` without `Execution Price:` → `executionPrice === null`.
- Header with leading/trailing whitespace → `outcome: 'ok'`.
- Blank lines between fields → `outcome: 'ok'`.
- Extra trailing text after the footer (e.g. forwarded signature) → `outcome: 'ok'`.
- One test per PAIRS key (`for (const raw of Object.keys(PAIRS))`) — sends a canonical `BUY <key>` and asserts `pairNormalized`.

**Rejection cases (each asserts exact reason):**

- Lowercase pair (`eurusd`) → `wrong_format`.
- Pair with embedded whitespace (`EU RSD`) → `wrong_format`.
- Missing SL line → `missing_sl`.
- Missing TP1 line → `missing_tp1`.
- SL == TP1 → `sl_equals_tp1`.
- Negative SL (`🔴 SL: -1.0781`) → `invalid_number`.
- Negative TP1 → `invalid_number`.
- Non-numeric SL (`🔴 SL: abc`) → `invalid_number`.
- Zero SL (`🔴 SL: 0`) → `invalid_number`.
- Zero TP1 → `invalid_number`.
- Emoji typo on SL (`🔵 SL:`) → `missing_sl`.
- Footer-only message (`⚠️ Manage your risks`) → `wrong_format`.
- Empty string → `wrong_format`.
- Whitespace-only string → `wrong_format`.
- Unknown pair (`🔼BUY BTCEUR`, pair regex matches but map returns `null`) → `invalid_pair`.

**Assertion style:** every test asserts full `ParseResult` equality (`expect(result).toEqual({…})`) — no `toMatchObject` shortcuts, no partial assertions. Catches accidental field additions on the success path.

### 8.2 `src/config/pairs.test.ts`

- Parameterized loop over all 17 `Object.keys(PAIRS)` — each asserts `normalize(raw) === expected`.
- Unknown pair (`'BTCEUR'`) → `null`.
- Empty string → `null`.
- Lowercase pair (`'eurusd'`) → `null`.
- Mixed-case pair (`'EurUsd'`) → `null`.

### 8.3 Coverage bar

After all tests pass, run:

```
npx vitest run --coverage src/parser/
npx vitest run --coverage src/config/pairs.ts
```

Acceptance: 100% statements, branches, functions on both files. No `/* c8 ignore */` comments. Any uncovered branch indicates a missing test, not a justified exception.

### 8.4 No DB / no Telegram / no mocks

The module has zero I/O. No fixtures, no clock injection, no env stubs. Test runtime is under 50 ms.

---

## 9. Acceptance Criteria

Run from a clean clone, with M0/M1 already merged.

| #   | Check                                                              | Command                                                                                       | Expected                                       |
| --- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | New files exist where expected                                    | `ls src/parser/{regex,types,parse,parse.test}.ts src/config/pairs.test.ts src/config/pairs.ts` | all present                                    |
| 2   | Lint, test, build all green                                        | `npm run lint && npm test && npm run build`                                                   | exits 0                                        |
| 3   | Parser achieves 100% coverage                                      | `npx vitest run --coverage src/parser/`                                                       | 100% statements, branches, functions on parser |
| 4   | Pair map achieves 100% coverage                                    | `npx vitest run --coverage src/config/pairs.ts`                                               | 100% on pairs.ts                               |
| 5   | Parser does not import from db/telegram/executor/util/config-env   | `rg "from '\\.\\./(db\|telegram\|executor\|util\|config/env)" src/parser/`                    | no matches                                     |
| 6   | All PRD §16 cases pass                                             | `npx vitest run src/parser/parse.test.ts`                                                      | all green                                      |
| 7   | All M2 additions pass                                              | same                                                                                          | all green                                      |
| 8   | ESLint `no-restricted-imports` enforces (5)                        | temporarily add `import { pool } from '../db/pool.js'` to `parse.ts`, run `npm run lint`      | lint fails                                     |
| 9   | No hard-coded "MetaTrader 5" in parser (existing M0 rule)          | `rg "MetaTrader 5" src/parser/`                                                               | no matches                                     |
| 10  | The literal strings `🔼BUY` / `🔽SELL` / `🔴 SL` / `🟢 TP1` only appear in `regex.ts` | `rg "🔼BUY\|🔽SELL\|🔴\s*SL\|🟢\s*TP1" src/parser/` | matches only in regex.ts                  |

---

## 10. PRD Deltas Resolved During Brainstorming

| PRD location                       | PRD says                                           | Resolved as                                                                                              | Reason                                                                                                       |
| ---------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| M2 `RejectionReason` union         | includes `'missing_direction' \| 'missing_pair'`   | dropped — union is `'wrong_format' \| 'invalid_pair' \| 'missing_sl' \| 'missing_tp1' \| 'invalid_number' \| 'sl_equals_tp1'` | The header regex enforces direction + pair atomically; splitting them adds union members the parser never produces. |
| §16 `BUY with TP below SL` case    | "rejected"                                         | accepted (parsed as-is)                                                                                  | PRD §7.4 + decision log #10 — no geometric / R:R validation. The test case in §16 is the legacy PRD wording and is overridden by §7.4 + decision log. The M2 acceptance does not assert this rejection. |
| §10.2 pair "split-after-3" fallback | fallback rule for unmapped pairs                  | not implemented; explicit map only                                                                       | YAGNI; auto-split would mask typos. Unmapped pairs return `invalid_pair`, surfaced as a one-line code change. |
| M2 "rejection_reason" granularity  | §22 lists many literal reasons                    | short-circuit on first failure — one reason per `parse()` call                                           | User-confirmed: simpler types, simpler tests, simpler downstream messaging.                                   |
| M2 pair-list coverage              | "all major pairs covered"                          | the 17 pairs listed in M2 PRD                                                                            | Hard-coded in the spec; map enumerates each one explicitly so the test loop covers every entry.             |
| Implicit: `tp2`/`tp3` typing       | v1 only requires TP1 but the parser "captures" them | typed as `number \| null` in `ParsedSignal`                                                              | Captures them when present, explicit `null` when absent. The executor (M7) only reads TP1 for v1.            |

---

## 11. Open Items (carried forward)

- **`TELEGRAM_CHANNEL_ID`** remains the only runtime blocker before M3 can be exercised end-to-end. M2 has no dependency on it — parser tests use inline text.
- The `🔼BUY` / `🔽SELL` / `🔴 SL` / `🟢 TP1` literals live only in `src/parser/regex.ts`. If the admin ever changes emoji, **one file changes** and the tests catch the regression. This is a deliberate isolation property of the design.
- v2 multi-TP: `ParsedSignal.tp2` / `tp3` are captured but unused by the M7 executor. When v2 lands, `executor.ts` will read them and spawn child orders. No parser change required.
- No `scripts/` additions in M2. `scripts/telegram-auth.ts` arrives in M3.

---

_End of M2 design._
