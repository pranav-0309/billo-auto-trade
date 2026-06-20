# PRD — Billo Auto-Trade

**Project:** Telegram → MetaTrader 5 Trade Signal Copier (v1)
**Status:** Draft v1.3
**Last updated:** 2026-06-20 (v1.1: hosting = Railway, DB = Railway Postgres; v1.2: Telegram = GramJS user session, MT5 = MetaAPI, TZ = Asia/Dubai, admin filter optional, kill switch env-var only, dev DB = Railway Postgres, all open questions resolved; v1.3: §22 Milestones added — M0–M10 with detailed feature lists and dependency graph)
**Owner:** Billo (personal project)
**Target consumer of this doc:** the owner + an AI coding assistant

---

## 1. Executive Summary

Build a small automation service that watches a single Telegram channel in which one admin posts trading signals, parses the signals, and places corresponding trades on a **MetaTrader 5** terminal logged in to a **VT Markets** account.

The service runs unattended, has no manual confirmation step, and uses a fixed **0.01 lot** size on a **demo account** for v1. All incoming signals, parse results, trade attempts, fills, and errors are persisted to a **PostgreSQL** database. After every attempt, the service sends a Telegram notification back to the owner containing the parsed trade details and a generic platform label (e.g. _"MT5"_) that is **not hard-coded** in the message template.

v1 handles **one take-profit level (TP1)** per signal. v2 will extend the same trade to multiple take-profits (TP1/TP2/TP3 with the same stop-loss and lot size, modeled as three child orders).

---

## 2. Goals and Non-Goals

### 2.1 Goals (v1)

- Monitor a specific Telegram channel and react only to messages sent by the admin (single allowed sender).
- Parse the canonical signal format (see §7) and extract: **direction**, **pair**, **stop-loss**, **take-profit (TP1)**.
- Place a market order on MT5 within **~1 second** of receiving a parseable signal.
- Persist every signal, parse outcome, and trade attempt to PostgreSQL.
- Send a Telegram notification to the owner for every received signal (parsed, rejected, or filled).
- Run 24/7 on a single machine (local PC or small VPS) with automatic reconnection to Telegram and MT5.
- Be configurable via a single `.env` file — no rebuilds required to change pair list, magic number, lot size, etc.

### 2.2 Non-Goals (v1)

- No UI / dashboard. Logs and DB are the source of truth.
- No multi-account support (only one MT5 login at a time).
- No TP2 / TP3 partial closes. Only TP1.
- No manual approval step. Fully autonomous.
- No trading strategies of its own. It only mirrors the signal channel.
- No backtesting / paper trading layer beyond what MT5 demo already provides.
- No mobile app or push notifications other than Telegram.

---

## 3. Personas and Use Cases

### 3.1 Primary persona — Billo (the owner)

- Has a VT Markets demo account in MT5.
- Is added to a private Telegram channel that receives signals from one admin.
- Wants to be away from the screen (working, sleeping) and still capture signals.
- Wants Telegram feedback so he can audit what happened without opening a database client.

### 3.2 Use cases

| ID  | Use case                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------- |
| U1  | Admin posts a BUY signal for EURUSD with SL + TP1. Tool places a 0.01 BUY on EURUSD within ~1 s.                 |
| U2  | Admin posts a SELL signal for GBPJPY. Tool places a 0.01 SELL on GBPJPY with the parsed SL and TP1.              |
| U3  | A non-admin user posts in the channel. Tool ignores it (defence in depth).                                       |
| U4  | A message does not match the signal format. Tool logs it as "unparseable" and notifies the owner.                |
| U5  | A message matches the format but is missing one field (e.g. SL). Tool does **not** trade and notifies the owner. |
| U6  | MT5 is disconnected. Tool buffers the signal, retries connection, and reports status to the owner.               |
| U7  | Telegram is disconnected. Tool reconnects automatically and resumes listening.                                   |

---

## 4. Glossary

| Term             | Meaning                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| **Signal**       | A Telegram message from the admin that follows the canonical format (see §7).                                |
| **Admin**        | The single Telegram user allowed to post in the monitored channel. Their `user_id` is whitelisted in config. |
| **Parse OK**     | All four required fields (direction, pair, SL, TP1) extracted and validated.                                 |
| **Trade**        | A single market order placed via the MT5 integration with the parsed parameters and the configured lot size. |
| **Notification** | A Telegram message sent from the bot to the owner's chat with a summary of the signal and outcome.           |
| **MT5**          | MetaTrader 5 terminal, in this case provided by VT Markets.                                                  |

---

## 5. High-Level Architecture

```
 ┌────────────────────┐    poll/listen    ┌──────────────────────┐
 │  Telegram channel  │ ────────────────▶ │  Listener service    │
 │  (admin only)      │                   │  (Telegraf/GramJS)   │
 └────────────────────┘                   └──────────┬───────────┘
                                                     │ raw message
                                                     ▼
                                          ┌──────────────────────┐
                                          │  Parser              │
                                          │  (regex + validator) │
                                          └──────────┬───────────┘
                                                     │ { direction, pair, sl, tp1 } | reject
                                                     ▼
                                          ┌──────────────────────┐
                                          │  Trade executor      │
                                          │  (MT5 bridge)        │
                                          └──────────┬───────────┘
                                                     │ result
                                                     ▼
                          ┌──────────────────────────────────────────────┐
                          │  PostgreSQL                                   │
                          │  signals | parse_results | trades | errors   │
                          └──────────────────────────────────────────────┘

  In parallel, on every event, a Notifier sends a Telegram message to the owner.
```

All components run as **a single Node.js / TypeScript process** in v1. Splitting into multiple services is a v2+ concern.

---

## 6. Tech Stack

| Layer                    | Choice                                                                                                                                                                                                        | Why                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Language                 | **TypeScript (Node.js ≥ 20, ESM)**                                                                                                                                                                            | User preference; rich ecosystem for Telegram clients.                                                 |
| Hosting                  | **Railway** (web service, single region)                                                                                                                                                                      | User choice. Runs the long-lived listener; auto-restart on crash; built-in log aggregation.           |
| Telegram client          | **Telegraf** if the channel accepts bots, else **GramJS (telegram-mtproto)** with a user session                                                                                                              | Bot API is simpler; private channels may require a user session. See §13.                             |
| MT5 bridge               | **MetaAPI** (cloud, official Node SDK `metaapi.cloud-sdk`) as the **recommended** path. Fallback: local **MetaTrader5 Python package** invoked via subprocess, or a tiny MT5 EA exposing HTTP via WebRequest. | TypeScript-native; no need to keep a Windows MT5 terminal logged in 24/7. See §14.                    |
| Database                 | **Railway Postgres** (managed PostgreSQL 15+)                                                                                                                                                                 | User choice. `DATABASE_URL` is auto-injected by Railway when the Postgres service is linked.          |
| Schema migrations        | **`node-pg-migrate`**, run automatically on deploy                                                                                                                                                            | Lightweight, SQL-first, reversible. See §21.4.                                                        |
| Logging                  | **`pino`** → stdout (Railway captures and aggregates)                                                                                                                                                         | No logrotate needed; Railway persists logs in the dashboard.                                          |
| Config                   | **`.env` locally** / **Railway Variables** in prod. Loaded via `dotenv` + a typed config module (`zod`).                                                                                                      | Same code path in both environments.                                                                  |
| Process supervisor       | **Railway's built-in restart policy** (`NUM_WORKERS=1`, `restartPolicyType=ON_FAILURE`)                                                                                                                       | No `pm2` / `systemd` needed.                                                                          |
| Health check             | Minimal **Express** HTTP server on `PORT` exposing `GET /health`                                                                                                                                              | Required by Railway to mark the service healthy; also exposes status of Telegram and MT5 connections. |
| Testing                  | **Vitest** + **nock** for HTTP mocks                                                                                                                                                                          | Fast TS-native test runner.                                                                           |
| Lint / format            | **ESLint** (flat config) + **Prettier**                                                                                                                                                                       | Standard.                                                                                             |
| Notifications (outbound) | Same Telegraf/GramJS client as the listener, but the bot DMs the owner.                                                                                                                                       | One dependency, one Telegram identity.                                                                |

### 6.1 Repo bootstrap

```bash
git init
git checkout -b main
# create .gitignore (node_modules, .env, logs/, dist/, .DS_Store, *.log, .railway/)
# initial commit
mkdir -p src docs scripts sql
# create package.json with `npm init -y`, then add scripts below
# create railway.json or railpack.json (see §21)
# create Procfile (used by Railway as the run command)
```

Recommended `npm` scripts:

```json
{
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
  }
}
```

A `Procfile` is committed at the repo root so Railway knows how to run the service:

```
web: node dist/index.js
release: npm run db:migrate
```

The `release` phase runs migrations **before** the new version starts serving traffic, so schema and code deploy in lockstep. See §21.4.

---

## 7. Signal Format (canonical spec)

The parser **must** match this format. Anything that doesn't match is logged as `unparseable` and ignored.

### 7.1 Buy example

```
🔼BUY EURUSD

Execution Price: 1.0735

🔴 SL: 1.0781

🟢 TP1: 1.0721

🟢 TP2: 1.0681

🟢 TP3: 1.0631

⚠️ Manage your risks
```

### 7.2 Sell example

```
🔽SELL EURUSD

Execution Price: 1.0735

🔴 SL: 1.0781

🟢 TP1: 1.0721

🟢 TP2: 1.0681

🟢 TP3: 1.0631

⚠️ Manage your risks
```

### 7.3 Required fields for v1

| Field       | Source line                     | Notes                                                                |
| ----------- | ------------------------------- | -------------------------------------------------------------------- |
| `direction` | First line, `🔼BUY` or `🔽SELL` | Buy ↔ SELL uppercase. Case-sensitive match.                          |
| `pair`      | Same line as direction          | 6 uppercase letters, e.g. `EURUSD`, `GBPJPY`. No slash in v1 source. |
| `sl`        | `🔴 SL:`                        | Decimal number, 4–5 fraction digits.                                 |
| `tp1`       | `🟢 TP1:`                       | Decimal number, 4–5 fraction digits.                                 |

Fields **not** required in v1 but parsed and stored if present:

- `execution_price` — from `Execution Price:` line.
- `tp2`, `tp3` — for v2 multi-TP support.
- The `⚠️ Manage your risks` footer — parsed but ignored.

### 7.4 Validation rules

- `direction` must be `BUY` or `SELL`.
- `pair` must match `^[A-Z]{6}$`. After parsing it is normalized to `EUR/USD` form for MT5 symbol lookups (see §10.2).
- `sl` and `tp1` must parse as finite positive numbers.
- `sl == tp1` is rejected (zero-range trade).
- **No geometric / R:R / direction-vs-level validation.** The owner has confirmed the channel is trusted: if the admin posts a signal, place it exactly as written. The parser's only job is to extract the four fields without errors.
- If any required field is missing or invalid (including the two rules above), the parser returns a `reject` outcome and **no trade is placed**.

### 7.5 Suggested regex (illustrative)

```ts
// Direction + pair
const RE_HEADER = /^\s*(?:🔼BUY|🔽SELL)\s+([A-Z]{6})\s*$/m;

// Stop loss
const RE_SL = /🔴\s*SL\s*:\s*([0-9]+(?:\.[0-9]+)?)/;

// Take profit 1 (and 2/3 captured for v2)
const RE_TP1 = /🟢\s*TP1\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
const RE_TP2 = /🟢\s*TP2\s*:\s*([0-9]+(?:\.[0-9]+)?)/;
const RE_TP3 = /🟢\s*TP3\s*:\s*([0-9]+(?:\.[0-9]+)?)/;

const RE_EXEC = /Execution\s*Price\s*:\s*([0-9]+(?:\.[0-9]+)?)/i;
```

These will be unit-tested against the canonical examples and a battery of negative cases (lowercase pair, missing SL, missing TP1, etc.).

---

## 8. Functional Requirements

### 8.1 Telegram monitoring

- **FR-1** The service shall connect to Telegram on startup and remain connected.
- **FR-2** The service shall listen to **one specific channel** identified by `TELEGRAM_CHANNEL_ID` (numeric) or `@channelusername`.
- **FR-3 (optional defence-in-depth)** If `TELEGRAM_ADMIN_USER_ID` is set, the service shall accept messages only from that user. Any other sender triggers an `ignored_other_sender` log entry and a notification to the owner. If `TELEGRAM_ADMIN_USER_ID` is **not** set, the service accepts all messages from the channel (relying on the channel's server-side permission that only the admin can post). The owner has confirmed the channel is admin-only by Telegram's own rules, so this filter is **optional** in v1 and defaults to off.
- **FR-4** The service shall deduplicate messages using `message_id` (and `chat_id`). Telegram can redeliver updates after a reconnect; duplicates must be dropped.
- **FR-5** On Telegram disconnect, the service shall reconnect with exponential backoff (1 s → 30 s cap) and report status to the owner on each retry.

### 8.2 Signal parsing

- **FR-6** The parser shall extract `direction`, `pair`, `sl`, `tp1`, and optionally `execution_price`, `tp2`, `tp3`.
- **FR-7** If any of the four required fields cannot be extracted, the service shall **not place a trade** and shall record a `rejected` parse result.
- **FR-8** The parser shall be a pure function (`parse(text): ParseResult`) with no side effects so it is fully unit-testable.
- **FR-9** The parser shall be tolerant to extra whitespace and blank lines but **strict** about the emoji-prefixed field names. A new emoji variant (e.g. 🔵 instead of 🔴) is treated as unparseable.

### 8.3 Trade execution

- **FR-10** On a `parse_ok` outcome, the executor shall place a **market order** with:
  - symbol: parsed pair, normalized for the broker (see §10.2),
  - side: parsed direction,
  - volume: `LOT_SIZE` from config (default `0.01`),
  - `sl`: parsed stop-loss,
  - `tp`: parsed TP1,
  - `magic`: a fixed `MAGIC_NUMBER` from config (used for identifying our orders),
  - `comment`: a short tag like `billo-<signalId>` for traceability.
- **FR-11** The executor shall target a latency of **≤ 1 000 ms** from message receipt to order submission, exclusive of network round-trip.
- **FR-12** If MT5 returns an error (off-quotes, requote, no money, etc.), the executor shall retry once with a 200 ms delay and a fresh price snapshot. A second failure is logged and notified but no further retries are attempted (avoids runaway retries on a fast-moving market).
- **FR-13** A `trade_attempts` row is written **before** the API call so a crash during the call is still recoverable from logs.
- **FR-14** The executor shall never place a trade without all four required fields being parsed successfully. This is a hard invariant enforced by the type system: the executor's input type is `ParsedSignal`, not `RawMessage`.

### 8.4 Persistence

- **FR-15** Every received Telegram message produces a `signals` row regardless of parse outcome.
- **FR-16** Every parse outcome produces a `parse_results` row linked to its `signals` row.
- **FR-17** Every trade attempt produces a `trade_attempts` row with: status (`submitted`, `filled`, `rejected`, `error`), broker ticket id if filled, raw error if rejected, timestamps.
- **FR-18** Every unexpected exception is caught at the top level and stored in `errors` with stack trace and the `signal_id` (if any).

### 8.5 Notifications

- **FR-19** The service shall send **one Telegram message per received signal** to the owner's chat (`TELEGRAM_OWNER_CHAT_ID`).
- **FR-20** The message shall contain:
  - received timestamp,
  - parse outcome (`OK` or `REJECTED — reason`),
  - the four extracted fields when parse OK,
  - the trade status (`submitted`, `filled`, `error: …`),
  - the platform label taken from the **`PLATFORM_LABEL`** config value (default `MT5`). **The literal string `MetaTrader 5` must not appear anywhere in source code or templates** — it must be sourced from config so the same binary can target a different broker/platform later.
- **FR-21** Notification failures (Telegram API error) are logged but **do not** block or roll back a trade. The trade is the source of truth; the notification is best-effort.

### 8.6 Configuration

All configuration is read from environment variables. Required vs. optional is shown below.

| Variable                  | Required            | Default           | Description                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`            | yes                 | —                 | Postgres connection string. **On Railway this is auto-injected** when the Postgres service is linked — do not set it manually in the Railway dashboard. Locally, put it in `.env`.                                                                                                                                                                           |
| `TELEGRAM_API_ID`         | yes (GramJS only)   | —                 | my.telegram.org app credentials.                                                                                                                                                                                                                                                                                                                             |
| `TELEGRAM_API_HASH`       | yes (GramJS only)   | —                 | my.telegram.org app credentials.                                                                                                                                                                                                                                                                                                                             |
| `TELEGRAM_SESSION_STRING` | yes (GramJS only)   | —                 | Pre-generated MTProto session string.                                                                                                                                                                                                                                                                                                                        |
| `TELEGRAM_BOT_TOKEN`      | yes (Telegraf only) | —                 | Bot token from @BotFather (only if using a bot, see §13).                                                                                                                                                                                                                                                                                                    |
| `TELEGRAM_CHANNEL_ID`     | yes                 | —                 | Channel id (`-100…`) or `@username` of the signal channel.                                                                                                                                                                                                                                                                                                   |
| `TELEGRAM_ADMIN_USER_ID`  | no                  | unset (no filter) | If set, the service filters out non-admin senders. **Optional in v1** — the channel's own permissions already guarantee only the admin can post, so this is defence-in-depth only.                                                                                                                                                                           |
| `TELEGRAM_OWNER_CHAT_ID`  | yes                 | —                 | Chat id the notifications are sent to.                                                                                                                                                                                                                                                                                                                       |
| `PLATFORM_LABEL`          | no                  | `MT5`             | Generic platform label used in notifications. **Not** "MetaTrader 5".                                                                                                                                                                                                                                                                                        |
| `LOT_SIZE`                | no                  | `0.01`            | Trade volume.                                                                                                                                                                                                                                                                                                                                                |
| `MAGIC_NUMBER`            | no                  | `778899`          | Magic id stamped on every order.                                                                                                                                                                                                                                                                                                                             |
| `MT5_LOGIN`               | yes                 | —                 | VT Markets MT5 account number.                                                                                                                                                                                                                                                                                                                               |
| `MT5_PASSWORD`            | yes                 | —                 | MT5 password.                                                                                                                                                                                                                                                                                                                                                |
| `MT5_SERVER`              | yes                 | —                 | Broker server name, e.g. `VTMarkets-Demo`.                                                                                                                                                                                                                                                                                                                   |
| `MT5_INTEGRATION`         | no                  | `metaapi`         | One of `metaapi`, `python-bridge`, `mt5-webrequest`. See §14.                                                                                                                                                                                                                                                                                                |
| `METAAPI_TOKEN`           | yes (metaapi)       | —                 | metaapi.cloud API token.                                                                                                                                                                                                                                                                                                                                     |
| `METAAPI_ACCOUNT_ID`      | yes (metaapi)       | —                 | metaapi.cloud provisioned account id.                                                                                                                                                                                                                                                                                                                        |
| `DRY_RUN`                 | no                  | `false`           | If `true`, parse + log + notify, but **do not** call MT5. Useful for warm-up.                                                                                                                                                                                                                                                                                |
| `LOG_LEVEL`               | no                  | `info`            | `trace` / `debug` / `info` / `warn` / `error`.                                                                                                                                                                                                                                                                                                               |
| `TZ`                      | no                  | `Asia/Dubai`      | Timezone used for all timestamps in logs and notifications. The signal channel operates on Dubai time (UTC+4); all DB timestamps are still stored as UTC (`timestamptz`), but the pino logger and notification formatter render in this zone. **Trade execution is always immediate on message receipt** — this setting does not delay or schedule anything. |

`.env` is git-ignored. `.env.example` is committed.

---

## 9. Non-Functional Requirements

- **NFR-1 Latency:** median time from Telegram message arrival to MT5 order submission ≤ 1 s; p95 ≤ 3 s.
- **NFR-2 Reliability:** if the process crashes mid-execution, restarting it must not double-place trades on the same signal. Dedup is on `message_id`.
- **NFR-3 Observability:** every lifecycle event (Telegram connect/disconnect, MT5 connect/disconnect, trade placed, trade error) is logged in structured JSON.
- **NFR-4 Security:** secrets are only in `.env`. No secrets in logs. No secrets in DB rows. Telegram session string is treated as a secret.
- **NFR-5 Portability:** the codebase runs unchanged on Windows, macOS, and Linux. The Python-bridge MT5 integration is the only path that hard-depends on Windows + a locally installed MT5 terminal.
- **NFR-6 Cost:** for v1, the only paid dependency is the MT5 integration (MetaAPI free tier is fine for demo; ~$0–5/mo on a paid tier when going live). No other SaaS.

---

## 10. Data Model (PostgreSQL)

`uuid` for primary keys, `timestamptz` everywhere. Schema lives in `sql/` and is applied with `node-pg-migrate`.

### 10.1 Tables

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
  pair_raw        text,           -- e.g. 'EURUSD'
  pair_normalized text,           -- e.g. 'EUR/USD'
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

CREATE INDEX idx_signals_received_at ON signals (received_at DESC);
CREATE INDEX idx_parse_results_signal_id ON parse_results (signal_id);
CREATE INDEX idx_trade_attempts_signal_id ON trade_attempts (signal_id);
CREATE INDEX idx_trade_attempts_status ON trade_attempts (status);
```

### 10.2 Pair normalization

The signal uses `EURUSD`; the broker expects `EUR/USD`. The normalization table is a small map kept in `src/config/pairs.ts`:

```ts
// input "EURUSD" -> "EUR/USD"
// input "GBPJPY" -> "GBP/JPY"
//
// Optional overrides for exotic pairs or broker-specific suffixes
// (e.g. some brokers suffix "m" or ".i" for indices/crypto).
```

If a pair from the signal is **not** in the map and not auto-derivable (split-after-3-chars rule), the parse result is `rejected` with reason `unknown_pair`.

---

## 11. Component Design

### 11.1 Module layout

```
src/
  index.ts                   # entrypoint, wires everything
  config/
    env.ts                   # typed env loader (zod)
    pairs.ts                 # pair normalization map
  telegram/
    client.ts                # builds Telegraf or GramJS client
    listener.ts              # subscribes to channel, emits events
    notifier.ts              # sends owner notifications
  parser/
    parse.ts                 # pure parse() function
    parse.test.ts            # vitest unit tests
    types.ts                 # ParsedSignal, ParseResult
  executor/
    executor.ts              # decides whether and how to trade
    mt5/
      index.ts               # selects adapter
      metaapi.ts             # metaapi adapter
      pythonBridge.ts        # subprocess adapter
      mt5WebRequest.ts       # EA HTTP adapter
      types.ts               # common adapter interface
  db/
    pool.ts                  # pg Pool
    signals.repo.ts
    parseResults.repo.ts
    trades.repo.ts
    errors.repo.ts
  util/
    logger.ts                # pino instance
    retry.ts                 # exponential backoff helper
```

### 11.2 Adapter interface (MT5)

```ts
export interface Mt5Adapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  placeMarketOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    volume: number;
    sl?: number;
    tp?: number;
    magic: number;
    comment: string;
  }): Promise<{ ticket: number; filledPrice: number } | { error: string }>;
}
```

All three concrete adapters implement this interface so the executor doesn't care which one is wired in.

---

## 12. End-to-End Sequence (happy path)

```
1. Listener receives a Telegram update
2. Listener filters by chat_id == TELEGRAM_CHANNEL_ID
3. Listener filters by sender_user_id == TELEGRAM_ADMIN_USER_ID
   (otherwise log + notify + return)
4. Listener inserts a row into `signals` (with telegram_message_id)
5. Listener calls parser.parse(raw_text)
6. Parser returns either:
     { outcome: 'ok',        parsed: {...} }
     { outcome: 'rejected',  reason: '...' }
7. Listener inserts a `parse_results` row
8. If rejected -> notifier sends "REJECTED — <reason>" to owner. Done.
9. If ok     -> executor calls MT5 adapter
10. Executor inserts a `trade_attempts` row with status='submitted'
11. Adapter returns either filled ticket+price or an error
12. Executor updates `trade_attempts` row to filled/rejected/error
13. Notifier sends "FILLED <pair> <side> <volume> @ <price>, SL=..., TP=..., platform=<PLATFORM_LABEL>"
```

---

## 13. Telegram Integration — Resolved: User Session (GramJS)

Two paths exist; we are going with **Option B**.

### 13.1 Option A — Telegraf + bot account (rejected for v1)

- Add a bot user to the channel.
- The admin must allow the bot to read messages (in private channels this usually means making the bot an admin or using a public channel).
- Listener uses `bot.on('channel_post', ...)`.
- Pros: simple, official Bot API, well-documented.
- Cons: requires the admin to add a bot to the channel. In a private channel where only the admin can post, only the admin can add the bot. We don't want to depend on admin cooperation for the deploy.

### 13.2 Option B — GramJS + user session ✅ chosen

- A real Telegram user account (the owner) is "logged in" via a session string generated once via a small auth script (`scripts/telegram-auth.ts`).
- The listener uses `client.getEntity(channelId)` and `client.addEventHandler(...)` with a filter on `chats: [TELEGRAM_CHANNEL_ID]`.
- Pros: works in any channel the user is in, **no admin cooperation needed**, the owner is already a member.
- Cons: technically against Telegram ToS for automation if the account is a normal user account. Slightly higher risk of session bans (mitigated because we only listen — no spamming, no scraping). Must keep the session string secret.

**Why this over Option A:** the channel is private and the owner is already a member. A bot would require the admin to add it; a user session does not. The owner has confirmed this path.

**One-time auth script (`scripts/telegram-auth.ts`):**

```bash
TELEGRAM_API_ID=... TELEGRAM_API_HASH=... npx tsx scripts/telegram-auth.ts
# prompts for phone number + login code
# prints TELEGRAM_SESSION_STRING=<base64>
# owner pastes this into Railway Variables (and .env locally)
```

The session string is treated as a top-tier secret. It is never logged, never written to the database, and lives only in env vars.

> **QUESTION FOR OWNER:** The owner must run the auth script once, on their own machine, with their own phone number, and paste the resulting `TELEGRAM_SESSION_STRING` into Railway Variables. The signal `TELEGRAM_CHANNEL_ID` and the optional `TELEGRAM_ADMIN_USER_ID` (see §8.1) still need to be supplied.

---

## 14. MetaTrader 5 Integration — Open Decision

Three paths exist. The owner must pick one.

### 14.1 Option A — MetaAPI (cloud, recommended)

- Sign up at metaapi.cloud, provision an MT5 account (paper trading is supported).
- Use `metaapi.cloud-sdk` from Node.
- **No local MT5 terminal required.** Runs anywhere Node runs (Linux VPS included).
- Free tier exists; paid tier is a few $/mo.
- Pros: cleanest TS-native path, no Windows dependency, stable.
- Cons: third-party SaaS; data leaves your machine.

### 14.2 Option B — Local Python bridge

- Run the official `MetaTrader5` Python package as a small sidecar (Python 3.10+, Windows required, MT5 terminal must be open and logged in).
- Node talks to Python over stdio or a local HTTP socket.
- Pros: official broker integration, no SaaS.
- Cons: must keep a Windows desktop session alive; MT5 terminal must stay logged in.

### 14.3 Option C — MT5 Expert Advisor with WebRequest

- Write a tiny MQL5 EA that exposes a local HTTP endpoint (MT5 WebRequest) and accepts JSON orders from Node.
- Pros: full control.
- Cons: MQL5 code to maintain, must keep the EA attached to a chart, only works while MT5 is running locally.

> **QUESTION FOR OWNER:** Which integration path? Option A (MetaAPI) is the default if not specified.

---

## 15. Error Handling & Edge Cases

| Case                                               | Behaviour                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram disconnect                                | Reconnect with backoff; notify owner of each failure and each recovery.                                                                      |
| MT5 disconnect                                     | Buffer incoming signals (still parse + log + notify). Reconnect with backoff. On reconnect, do **not** replay old signals — they are stale.  |
| Signal missing required field                      | Rejected. No trade. Notification explains which field.                                                                                       |
| Pair unknown to the broker                         | Rejected. No trade. Notification names the pair.                                                                                             |
| Broker rejects order (insufficient margin, etc.)   | Logged as `trade_attempts.status='error'`. Notification includes the broker error string.                                                    |
| Order requote                                      | One retry with fresh price. Second failure stops.                                                                                            |
| Same signal delivered twice (Telegram redelivery)  | Dedup by `(chat_id, telegram_message_id)`.                                                                                                   |
| Admin posts two signals for the same pair in < 5 s | Both are placed. v1 has no portfolio-level deduplication.                                                                                    |
| Process crashes between parse and trade attempt    | Restart picks up nothing — the signal is gone from Telegram's queue by then. The DB row exists, so the owner can replay manually if desired. |
| `DRY_RUN=true`                                     | Everything happens except the actual `placeMarketOrder` call. `trade_attempts.status='dry_run'`.                                             |

---

## 16. Testing Strategy

- **Unit tests** for the parser. Cases:
  - canonical buy (full message),
  - canonical sell (full message),
  - lowercase pair (rejected),
  - missing SL (rejected),
  - missing TP1 (rejected),
  - SL == TP1 (rejected),
  - BUY with TP below SL (rejected),
  - emoji typo on field name (rejected),
  - footer "⚠️ Manage your risks" alone (rejected),
  - extra whitespace and blank lines (OK),
  - pair normalization (`EURUSD` → `EUR/USD`).
- **Unit tests** for the pair-normalization map and the env loader.
- **Integration tests** with a fake MT5 adapter that records calls — verify the executor never calls it on `parse_rejected`.
- **Manual smoke test** against a Telegram test channel + a MetaAPI demo account before going live.

No live-money testing in v1.

---

## 17. Deployment & Operations

- **Local dev:** `npm run dev` (tsx watch). Uses `.env` for configuration.
- **Production (Railway):** the service runs as a **Railway web service** (see §21 for full deploy steps).
- **Logs:** `pino-pretty` for dev, raw JSON in prod. On Railway, stdout is captured automatically — viewable in the Railway dashboard under the service's "Logs" tab; no `pm2-logrotate` or `logrotate` needed.
- **DB backups:** handled by Railway's managed Postgres. Daily snapshots are available; Railway also offers point-in-time recovery on paid plans. No `pg_dump` cron is required in v1.
- **Health check:** the service exposes a tiny `GET /health` endpoint (see §21.3) and sends a Telegram heartbeat to the owner every 24 h ("still alive — N signals processed today"). If the owner doesn't see a heartbeat for > 25 h, they know to investigate.
- **Kill switch:** setting `KILL_SWITCH=true` in Railway Variables (and redeploying, or triggering a redeploy) makes the service start in listener-only mode (no trades, all parse results recorded, notifications still sent). Documented as the canonical "pause" mechanism.
- **Graceful shutdown:** on Railway, a deploy or restart sends `SIGTERM`. The service must trap `SIGTERM`, stop accepting new Telegram messages, finish any in-flight trade attempt, and exit within Railway's 10 s grace window before being force-killed.

---

## 18. Roadmap

### v1 (this document)

- Single TP1, single account, single channel, no UI.
- 0.01 lot on demo.
- Owner-only Telegram feedback.

### v2

- TP1/TP2/TP3 with shared SL, modeled as either (a) one order with three TPs if broker supports it, or (b) three child orders with the same SL.
- Per-pair lot size overrides.
- Optional Kelly-fraction-of-balance sizing behind a feature flag.
- Daily P&L summary notification.
- Reconciliation job: read open positions from MT5 at startup and verify them against `trade_attempts`.

### v3

- Web dashboard (read-only) over the same Postgres.
- Multi-account support.
- Risk circuit breaker: stop trading for the day after N consecutive losses.

---

## 19. Decisions Log

> This section tracks every decision the owner has made. Defaults that have been confirmed are moved here from the open-questions list and locked.

| #   | Topic                           | Decision                                                                                                                                                                               |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Telegram path                   | **GramJS + user session** (Option B). One-time `scripts/telegram-auth.ts` produces the session string.                                                                                 |
| 2   | MT5 integration                 | **MetaAPI** (cloud, Node SDK).                                                                                                                                                         |
| 3   | MT5 demo server                 | `MT5_SERVER=VTMarkets-Demo`                                                                                                                                                            |
| 4   | Telegram channel id             | **PENDING** — owner to provide later. Stored in `TELEGRAM_CHANNEL_ID`.                                                                                                                 |
| 5   | Admin sender filter             | **Optional in v1.** `TELEGRAM_ADMIN_USER_ID` defaults to unset; the channel's own permissions already guarantee only the admin can post. The filter, if set, is pure defence-in-depth. |
| 6   | Heartbeat interval              | 24 h.                                                                                                                                                                                  |
| 7   | Database hosting                | **Resolved** — Railway Postgres. `DATABASE_URL` auto-injected in Railway; copied into local `.env` for dev.                                                                            |
| 8   | Timezone                        | `TZ=Asia/Dubai` (UTC+4) for log + notification rendering. All DB timestamps stored as UTC (`timestamptz`). **Execution is always immediate** — TZ does not delay anything.             |
| 9   | Multiple admins                 | v1 single-admin. Not a current concern.                                                                                                                                                |
| 10  | R:R / direction-vs-level checks | **None.** We trust the admin blindly. Parser only verifies the four fields are present and well-formed.                                                                                |
| 11  | Dedup window                    | Forever (by `(chat_id, telegram_message_id)`). Telegram ids are unique per chat.                                                                                                       |
| 12  | Edited messages                 | Ignored. Only `message` events processed.                                                                                                                                              |
| 13  | Duplicate signal guard          | None in v1. Both will be placed. (v2 may add.)                                                                                                                                         |
| 14  | Logging / DB retention          | Forever. (Data volume is trivial.)                                                                                                                                                     |
| 15  | Notification wording            | Approved as per §8.5.                                                                                                                                                                  |
| 16  | Hard-coded "MetaTrader 5"       | Forbidden in `src/`. Enforced by ESLint. Use `PLATFORM_LABEL` (default `MT5`).                                                                                                         |
| 17  | Railway region                  | `us-east1`.                                                                                                                                                                            |
| 18  | Kill switch mechanism           | **Env-var only** — `KILL_SWITCH=true` in Railway Variables. No HTTP kill endpoint.                                                                                                     |
| 19  | Local DB during dev             | Use the Railway Postgres directly (copy `DATABASE_URL` from the Railway dashboard into `.env`).                                                                                        |

### Still open (low priority — defaults will be used if not answered)

- `TELEGRAM_CHANNEL_ID` (§19 #4) — required to run; assistant cannot proceed past scaffolding without it. **This is the only blocker.**
- `TELEGRAM_ADMIN_USER_ID` (§19 #5) — optional. If provided later, set it in Railway Variables and the filter activates.

---

## 20. Acceptance Criteria for v1

The v1 build is "done" when all of the following hold:

- [ ] Repo initialized with the structure in §11.1.
- [ ] `npm run lint`, `npm run test`, `npm run build` all pass.
- [ ] Parser passes all unit tests in §16.
- [ ] Listener correctly ignores messages from non-admin senders (verified by an integration test).
- [ ] Service connects to Telegram, parses the canonical buy and sell examples, and places the correct market orders on a MetaAPI demo account within ≤ 1 s median.
- [ ] Every received signal — parsed, rejected, or filled — produces one row in `signals` and at least one row in `parse_results`.
- [ ] Every trade attempt produces a row in `trade_attempts` with a terminal status.
- [ ] Every received signal produces exactly one Telegram notification to the owner, and that notification contains the `PLATFORM_LABEL` value (not the literal `MetaTrader 5`).
- [ ] Process kill + restart does not double-place on the same signal.
- [ ] `DRY_RUN=true` causes no MT5 orders to be placed.

---

## 21. Railway Deployment Guide

### 21.1 Service topology

Two Railway services in the same project:

| Service        | Type               | Purpose                                                         |
| -------------- | ------------------ | --------------------------------------------------------------- |
| `billo-worker` | Web service (Node) | The TypeScript listener/executor described throughout this PRD. |
| `billo-db`     | Railway Postgres   | Managed PostgreSQL 15+ for `signals`, `parse_results`, etc.     |

`DATABASE_URL` is **not** set manually. When the Postgres service is provisioned and linked to `billo-worker`, Railway injects it automatically.

### 21.2 Environment variables (Railway → Variables tab)

Set the following for the `billo-worker` service. **Do not** include `DATABASE_URL` — Railway injects it.

```
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
TELEGRAM_SESSION_STRING=...        # secret
TELEGRAM_CHANNEL_ID=...
TELEGRAM_ADMIN_USER_ID=...
TELEGRAM_OWNER_CHAT_ID=...
PLATFORM_LABEL=MT5
LOT_SIZE=0.01
MAGIC_NUMBER=778899
MT5_LOGIN=...
MT5_PASSWORD=...                   # secret
MT5_SERVER=VTMarkets-Demo
MT5_INTEGRATION=metaapi
METAAPI_TOKEN=...                  # secret
METAAPI_ACCOUNT_ID=...
DRY_RUN=false
LOG_LEVEL=info
TZ=UTC
```

`Procfile` at repo root:

```
web: node dist/index.js
release: npm run db:migrate
```

### 21.3 Health endpoint

Railway requires a web service to respond on `PORT` for health checks. Add a minimal Express server in `src/health.ts` that:

- Listens on `process.env.PORT ?? 8080`.
- Exposes `GET /health` returning `200 { status: 'ok', telegram: 'connected'|'disconnected', mt5: 'connected'|'disconnected', uptime_s: N }`.
- Exposes `GET /ready` returning `200` only when both upstream connections are live, `503` otherwise.

There is no `POST /kill` endpoint in v1. The kill switch is exclusively the `KILL_SWITCH=true` env var (see §17).

### 21.4 Database migrations

The `release` phase in the `Procfile` runs `npm run db:migrate` before the new version receives traffic. This guarantees the schema is current before the listener starts.

If a migration fails:

- The release fails → the previous version keeps serving → zero downtime.
- The owner sees the error in the Railway deploy log and must fix it before the next deploy.

For destructive migrations (v2+), the recommendation is the widen-migrate-narrow pattern, but v1 only adds new tables/indexes so this is straightforward.

### 21.5 Deploy flow

```bash
# local
git push origin main
# Railway watches main, builds with `npm ci && npm run build`, runs release, then runs `web`.
```

Build command is set in `railway.json` (or auto-detected from `package.json`):

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "node dist/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
```

### 21.6 Local dev vs. Railway parity

The owner has decided to **use the same Railway Postgres from local dev**. This keeps the dev and prod schemas in lockstep and avoids running a second Postgres locally. The cost is a network round-trip on every DB query during dev — acceptable for a low-traffic listener.

| Concern           | Local                                                                    | Railway                                              |
| ----------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| Env vars          | `.env` (git-ignored)                                                     | Railway Variables tab                                |
| `DATABASE_URL`    | Copy the value from Railway's Postgres service "Connect" tab into `.env` | Auto-injected by Railway                             |
| Process lifecycle | `tsx watch` (foreground)                                                 | Container, restarted by Railway on crash             |
| Logs              | `pino-pretty` to terminal                                                | Raw JSON to stdout, captured by Railway              |
| Schema migrations | `npm run db:migrate` manually                                            | Automatic on every deploy via the `release` phase    |
| Health probe      | `curl localhost:8080/health`                                             | Railway hits `/health` per `healthcheckPath`         |
| `SIGTERM`         | Ctrl-C                                                                   | Sent on deploy/restart; service must drain (see §17) |

### 21.7 Cost notes

- Railway's Hobby plan includes $5/mo of usage plus 0.5 GB Postgres. The worker + a small Postgres instance comfortably fits within this for v1.
- MetaAPI free tier is sufficient while on the VT Markets demo account.

### 21.8 Railway-specific gotchas

- **Sleeping on free tier:** Railway may sleep idle services. Since the listener must be always-on, use a paid plan or accept the limitation during testing. The `healthcheckPath` does not prevent sleep.
- **Region:** pick a region close to the MetaAPI endpoint for lower latency. `us-east1` is a safe default.
- **No `pm2`:** do not install `pm2` in the container — Railway manages the process count. The service must be safe to run as a **single instance** (no internal port assumptions).
- **Cold starts:** the first deploy after a schema change runs `release` then `web`. If migrations are slow, Railway's deploy will time out and roll back. Keep migrations under 60 s.

---

## 22. Milestones (v1 implementation breakdown)

> The product roadmap in §18 is the _what_ (what v1/v2/v3 deliver). This section is the _how_ — the ordered, AI-assistant-friendly build plan for v1.
>
> Milestones are designed to be small enough to implement and verify in one or two AI sessions each. They split into two phases:
>
> - **Phase A (M0–M6):** parallelizable. After M0, the next five milestones touch independent modules and can be developed concurrently by separate agents. Each has a clean interface boundary.
> - **Phase B (M7–M10):** sequential. The wiring, deploy, and go-live steps depend on all prior pieces.

### M0 — Repo bootstrap & tooling

**Goal:** empty-but-runnable TypeScript repository that lints, type-checks, and tests green.

**Depends on:** —

**Features:**

- `git init` (already done — see §6.1) and a `main` branch with an initial commit.
- `.gitignore` covering `node_modules`, `dist`, `.env`, `.env.*` (except `.env.example`), `logs`, `coverage`, `.DS_Store`, `*.log`, `.railway/`.
- `package.json` with the scripts in §6.1, Node 20+ engine, ESM (`"type": "module"`).
- `tsconfig.json` strict mode, target ES2022, module NodeNext, outDir `dist`, rootDir `src`.
- ESLint flat config: `@typescript-eslint`, `eslint-config-prettier`, custom rule banning the literal string `"MetaTrader 5"` in `src/**` (see §19 #16).
- Prettier config (default).
- Vitest config with `vitest run` and `vitest --coverage` working.
- `pino` configured in `src/util/logger.ts` with the level from `LOG_LEVEL` and the timestamp in `TZ` (default `Asia/Dubai`).
- Folder layout: `src/`, `sql/`, `scripts/`, `docs/`, `test/`.
- `README.md` with: project one-liner, prerequisites, dev quickstart (`npm i`, `npm run dev`), test (`npm test`), and a "Status: pre-implementation" banner.
- `npm run lint && npm run test && npm run build` all exit 0 on a no-op codebase.

**Acceptance criteria:**

- Cloning the repo and running `npm i && npm test` works on a clean machine.
- An ESLint error fires if any file in `src/` contains the literal `MetaTrader 5`.

---

### M1 — Database schema & repositories

**Goal:** Postgres schema in version control, applied by `node-pg-migrate`, with a typed repository layer the rest of the app uses.

**Depends on:** M0.

**Features:**

- SQL migrations in `sql/migrations/`:
  - `001_init.sql` creates the four tables and indexes from §10.1 (`signals`, `parse_results`, `trade_attempts`, `errors`) with `gen_random_uuid()` (i.e. `pgcrypto`).
  - Migrations are reversible (`down` files) and idempotent.
- `node-pg-migrate` config (`package.json` or `.node-pg-migrate.json`).
- `src/db/pool.ts` — singleton `pg.Pool` reading `DATABASE_URL`. Honours `pg` env vars (`PGSSLMODE`, etc.) so it works on Railway (which requires SSL).
- `src/db/signals.repo.ts` — `insertSignal`, `getSignalById`, `findByTelegramMessageId` (for dedup), all returning typed rows.
- `src/db/parseResults.repo.ts` — `insertParseResult`, `getBySignalId`.
- `src/db/trades.repo.ts` — `insertTradeAttempt`, `updateTradeAttemptStatus`, `getBySignalId`.
- `src/db/errors.repo.ts` — `recordError`.
- `src/config/env.ts` — `zod`-validated env loader (one schema for all env vars in §8.6). Exports a typed `env` object. Throws on startup if any required var is missing.
- Unit tests for the env loader (valid + invalid cases) and for the repositories (using a `DATABASE_URL_TEST` that points at a throwaway schema, with `beforeEach` truncating tables).

**Acceptance criteria:**

- `npm run db:migrate` applies cleanly against a fresh DB.
- `npm run db:rollback` undoes it.
- Repositories are the **only** place SQL strings live; everything else uses repository methods.
- `signals` table has the unique constraint on `(chat_id, telegram_message_id)` that the dedup logic relies on.

---

### M2 — Signal parser (pure module)

**Goal:** a pure, fully unit-tested `parse(text): ParseResult` that is the only place signal-parsing logic lives.

**Depends on:** M0.

**Features:**

- `src/parser/types.ts` — `ParsedSignal`, `ParseResult` (discriminated union: `{ outcome: 'ok'; parsed: ParsedSignal }` vs `{ outcome: 'rejected'; reason: RejectionReason }`). `RejectionReason` is a string-literal union: `'missing_direction' | 'missing_pair' | 'missing_sl' | 'missing_tp1' | 'invalid_pair' | 'invalid_number' | 'sl_equals_tp1' | 'unknown_pair' | 'wrong_format'`.
- `src/parser/parse.ts` — pure function. Returns `ParseResult`. No `Date.now()`, no I/O, no DB.
- `src/parser/regex.ts` — the regexes from §7.5, exported as named constants.
- `src/parser/parse.test.ts` — the test cases from §16, plus:
  - pair with embedded whitespace (`EU RSD` → rejected),
  - negative `sl` or `tp1` (rejected),
  - `tp1` only, no `tp2`/`tp3` (OK, fields undefined),
  - extra trailing text after the footer (OK),
  - empty input (rejected).
- `src/config/pairs.ts` — the pair-normalization map from §10.2 with all major pairs covered (`EURUSD`, `GBPUSD`, `USDJPY`, `GBPJPY`, `AUDUSD`, `USDCAD`, `USDCHF`, `NZDUSD`, `EURJPY`, `EURGBP`, `EURCHF`, `AUDJPY`, `EURAUD`, `EURCAD`, `GBPCHF`, `CADJPY`, `CHFJPY`).

**Acceptance criteria:**

- 100% line + branch coverage on `src/parser/`.
- No `import` of any I/O module (db, telegram, http) inside `src/parser/`.

---

### M3 — Telegram listener (GramJS + user session)

**Goal:** a connection to Telegram that emits a typed `RawMessage` event for every message in the configured channel, with dedup and reconnection.

**Depends on:** M0.

**Features:**

- `scripts/telegram-auth.ts` — one-time CLI: prompts for phone + code, prints the session string. (See §13.2.)
- `src/telegram/client.ts` — builds and connects a `TelegramClient` from `telegram` (GramJS) using `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION_STRING`. Connects on startup. Logs `telegram_connected`.
- `src/telegram/listener.ts` — registers an `NewMessage` event handler filtered to `TELEGRAM_CHANNEL_ID` and (if `TELEGRAM_ADMIN_USER_ID` is set) to that sender. Emits an `EventEmitter` event `rawMessage` with `{ messageId, chatId, senderId, text, raw }`.
- Dedup: before emitting, calls `signals.repo.findByTelegramMessageId`. If a row exists, drop the message and log `duplicate_message_dropped`.
- Reconnection: wraps the GramJS client in a watchdog that reconnects with exponential backoff (1 s → 30 s cap). Each retry sends a Telegram notification to the owner.
- Non-message events (edits, service messages, etc.) are ignored.
- `src/telegram/listener.test.ts` — uses a fake GramJS client (dependency-injected) to assert: channel filter works, admin filter works when set, dedup works, edits are dropped.

**Acceptance criteria:**

- Running the service with valid `TELEGRAM_*` env vars and posting in the configured channel produces `rawMessage` events.
- A second delivery of the same `(chat_id, message_id)` after a reconnect does not produce a second event.
- Disconnecting Wi-Fi for 10 s and reconnecting results in the listener resuming, with a notification to the owner.

---

### M4 — MetaAPI MT5 adapter

**Goal:** an `Mt5Adapter` implementation that connects to MetaAPI and places market orders on the VT Markets demo account.

**Depends on:** M0, M1 (env loader).

**Features:**

- `src/executor/mt5/types.ts` — the `Mt5Adapter` interface from §11.2.
- `src/executor/mt5/metaapi.ts` — implementation using `metaapi.cloud-sdk`. Methods:
  - `connect()` — waits for the MetaAPI account to be deployed and synchronized, with a 60 s timeout.
  - `disconnect()`.
  - `placeMarketOrder(params)` — calls `connection.createMarketOrder(...)` with `magic`, `comment`, `sl`, `tp`. Maps the SDK's error codes to a `string` error message.
- `src/executor/mt5/index.ts` — factory that returns the adapter named by `MT5_INTEGRATION` (`metaapi` in v1; the other two paths return "not implemented" so future milestones can fill them in).
- `src/executor/mt5/metaapi.test.ts` — mocks the SDK; tests: connect success, connect timeout, order fill, broker rejection, network error. Asserts that `sl` and `tp` are forwarded unchanged.
- `DRY_RUN=true` short-circuits the adapter: `placeMarketOrder` resolves with a fake ticket `0` and logs `dry_run_trade_skipped`. The executor still writes a `trade_attempts` row with `status='dry_run'`.

**Acceptance criteria:**

- Adapter is constructed purely from env vars — no constructor parameters in production code.
- A live test against the MetaAPI demo account (`MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER=VTMarkets-Demo`) places a 0.01 EURUSD BUY with SL + TP and the trade appears in the MT5 terminal.
- Killing the MetaAPI connection from their dashboard causes `placeMarketOrder` to fail with a clear error within 10 s, and the executor records `status='error'`.

---

### M5 — Owner notifier

**Goal:** a small module that sends a Telegram DM to the owner for every received signal.

**Depends on:** M0, M3 (re-uses the GramJS client).

**Features:**

- `src/telegram/notifier.ts` — uses the same `TelegramClient` from M3, sends a message to `TELEGRAM_OWNER_CHAT_ID`.
- Four message templates, all sourcing the platform label from `PLATFORM_LABEL`:
  - **filled:** `"✅ FILLED <DIRECTION> <PAIR> <LOT> @ <PRICE>\nSL=<sl> TP=<tp1>\nPlatform: <PLATFORM_LABEL>\nSignal id: <uuid>\nReceived: <TZ-formatted timestamp>"`.
  - **rejected (parse):** `"❌ REJECTED — <reason>\nRaw: <truncated text>\nSignal id: <uuid>"`.
  - **error (trade):** `"⚠️ TRADE ERROR — <broker error>\n<DIRECTION> <PAIR> <LOT>\nSignal id: <uuid>"`.
  - **lifecycle (startup/reconnect/kill-switch):** plain text.
- The notifier wraps the SDK call in a `try/catch` and logs `notifier_send_failed` on failure. It **never throws back to the caller** (per FR-21).
- Unit tests verify the four message strings render correctly against a fixed input, and that the `PLATFORM_LABEL` env var is interpolated (no hard-coded `MT5` or `MetaTrader 5` in the rendered output).

**Acceptance criteria:**

- All four message templates contain `<PLATFORM_LABEL>` interpolation, verified by an ESLint regex test.
- A failing notifier call does not prevent a successful trade from being recorded.

---

### M6 — Health endpoint & observability

**Goal:** a minimal HTTP server that lets Railway (and humans) probe service health.

**Depends on:** M0.

**Features:**

- `src/health.ts` — Express app, listens on `process.env.PORT ?? 8080`.
- `GET /health` → `200 { status: 'ok', telegram: 'connected'|'disconnected', mt5: 'connected'|'disconnected', uptime_s: number, kill_switch: boolean }`. Always returns 200 unless the process is shutting down.
- `GET /ready` → `200` if both `telegram === 'connected'` and `mt5 === 'connected'`, else `503`.
- Process-level state is shared via a `src/state.ts` module that the listener, executor, and notifier write to.
- Graceful shutdown: `SIGTERM` / `SIGINT` handlers flip a flag, stop the Telegram listener, close the MT5 adapter, drain the HTTP server, then `process.exit(0)` within Railway's 10 s window.
- 24 h heartbeat: a `setInterval` in `index.ts` posts a `"💚 heartbeat — <N> signals processed in the last 24h"` message via the notifier.

**Acceptance criteria:**

- `curl http://localhost:8080/health` returns the expected JSON.
- Sending `SIGTERM` to the process exits within 5 s with no in-flight trade lost (or with a clear error logged if a trade was in flight).
- `KILL_SWITCH=true` makes `parse_ok` signals produce `trade_attempts.status='dry_run'` instead of calling the adapter.

---

### M7 — Executor & wiring (the heart of the system)

**Goal:** end-to-end pipeline: Telegram message → DB row → parser → executor → MT5 → notifier. The composition root that ties every other milestone together.

**Depends on:** M1, M2, M3, M4, M5, M6.

**Features:**

- `src/executor/executor.ts` — `handleRawMessage(raw: RawMessage)`:
  1. `const signal = await signalsRepo.insertSignal({...})` — captures the `signal_id` immediately.
  2. `const parsed = parse(raw.text)` — pure call, no I/O.
  3. `await parseResultsRepo.insertParseResult({signalId, ...})`.
  4. If `parsed.outcome === 'rejected'`: `await notifier.notifyRejection(...)` and return.
  5. If `parsed.outcome === 'ok'`: `const attempt = await tradesRepo.insertTradeAttempt({status: 'submitted', ...})`.
  6. `const result = await mt5.placeMarketOrder({...})`.
  7. If `result.ticket`: update trade to `filled`, notify success.
  8. If `result.error`: one retry with a 200 ms delay and fresh price; second failure updates to `error` and notifies.
- The executor is wrapped in a top-level `try/catch` that writes to `errors` table and logs the stack trace, so a single bad message can never crash the process.
- `src/index.ts` — composition root. Wires the env loader, logger, DB pool, Telegram client, listener, executor, notifier, health server, heartbeat, and SIGTERM handler in that order.
- `src/dedup.ts` — small wrapper that combines the `findByTelegramMessageId` check with the listener's event flow.

**Acceptance criteria:**

- Posting a canonical BUY EURUSD message in the configured channel results in:
  1. A row in `signals`,
  2. A row in `parse_results` with `outcome='ok'`,
  3. A row in `trade_attempts` with `status='filled'`,
  4. A filled market order on the MetaAPI demo account,
  5. A Telegram DM to the owner with the filled template,
     — all within 1 s median.
- Posting a malformed message results in: signal row, rejected parse row, no trade row, rejection DM. The process keeps running.
- Posting a message from a non-admin user (when `TELEGRAM_ADMIN_USER_ID` is set) results in: no signal row, `ignored_other_sender` log, an `ignored` DM to the owner. (This branch is only reached if the filter is on; otherwise it's unreachable because Telegram won't let non-admins post.)
- Restarting the process and re-delivering the same Telegram message (simulated via a test that calls the listener directly with a duplicate `message_id`) does not create a second trade.

---

### M8 — Railway deployment

**Goal:** the service runs on Railway end-to-end, with `DATABASE_URL` linked, migrations running on every deploy, and the healthcheck wired.

**Depends on:** M7.

**Features:**

- `Procfile` at repo root (per §6.1): `web: node dist/index.js` and `release: npm run db:migrate`.
- `railway.json` (per §21.5) with `healthcheckPath: "/health"`, `restartPolicyType: "ON_FAILURE"`, `restartPolicyMaxRetries: 10`, `healthcheckTimeout: 30`.
- `Dockerfile` is **not** needed — Railway uses Nixpacks to detect the Node app from `package.json`.
- `docs/railway-deploy.md` — step-by-step deploy guide: create project, add Postgres, add web service from GitHub repo, set the env vars from §21.2 in the Variables tab, deploy, verify logs, verify healthcheck.
- `.github/workflows/ci.yml` (optional but recommended): on PR and push to `main`, run `npm ci && npm run lint && npm test && npm run build`. Catches type errors and test failures before they reach Railway.

**Acceptance criteria:**

- A `git push origin main` triggers a Railway deploy that:
  1. Runs the `release` phase (migrations),
  2. Starts the `web` process,
  3. Hits `/health` and gets 200 within 30 s.
- The owner receives a `💚 startup — connected` lifecycle DM in Telegram within 1 minute of deploy.
- The Railway logs tab shows structured pino JSON with `telegram_connected` and `mt5_connected` events.

---

### M9 — End-to-end demo verification

**Goal:** a one-week soak test on the VT Markets demo account with real Telegram signals, validating that the v1 acceptance criteria (§20) are met.

**Depends on:** M8 deployed and a demo account funded with a small balance.

**Features (this milestone is mostly verification + small fixes, not new code):**

- Manual E2E checklist executed on day 1 of the soak:
  - [ ] Post a BUY EURUSD signal in the channel → trade appears on MT5 demo within 1 s, owner receives filled DM.
  - [ ] Post a SELL GBPJPY signal → same flow, different pair.
  - [ ] Post a malformed message (missing SL) → no trade, owner receives rejection DM.
  - [ ] Kill the Railway service from the dashboard → it auto-restarts, sends lifecycle DM.
  - [ ] `KILL_SWITCH=true` + redeploy → trade attempts are recorded as `dry_run`, no live orders, owner receives `dry_run` DMs.
- Latency measurement: the pino logs include `signal_received_at` and `mt5_filled_at`. The owner can `grep` them out and compute median + p95.
- 24 h heartbeat: owner receives one heartbeat DM per 24 h with the signal count.
- Daily review (7 days): each morning, owner checks Railway logs, the `signals` and `trade_attempts` tables, and the MT5 terminal's "Trade" tab to confirm every signal has a matching closed/open position with the correct magic number.
- Bug fixes from the soak: any defects discovered are filed as small milestones (M9.1, M9.2, …) and resolved before go-live.

**Acceptance criteria:**

- All v1 acceptance criteria in §20 are checked off.
- Median end-to-end latency is ≤ 1 s; p95 is ≤ 3 s.
- Zero unintended trades during the soak (every trade in MT5 has a matching `trade_attempts` row, and every `trade_attempts.filled` row has a matching MT5 position).
- Zero process crashes over 7 days.

---

### M10 — Live cutover

**Goal:** the service runs against the VT Markets live account with the same 0.01 lot size and TP1-only behaviour.

**Depends on:** M9 green for ≥ 7 days.

**Features:**

- Owner updates Railway Variables: `MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER` (likely `VTMarkets-Live` or similar — verify in the live MT5 terminal).
- Owner confirms the MetaAPI account is provisioned for the live account (or provisions a new one and updates `METAAPI_ACCOUNT_ID`).
- `KILL_SWITCH=false` is set (or the var is removed) and the service is redeployed.
- The first live signal is monitored end-to-end: owner confirms the trade lands, DM arrives, no surprises.
- v1 is shipped. 🎉

**Acceptance criteria:**

- First live trade matches the admin's signal exactly (pair, side, lot, SL, TP1).
- All other v1 acceptance criteria continue to hold.
- A `CHANGELOG.md` entry marks v1.0.0 released with the date.

---

### Milestone dependency graph

```
        ┌──► M1 (DB)         ──┐
        │                       │
M0 ─────┼──► M2 (Parser)        │
        │                       │
        ├──► M3 (Telegram)      ├──► M7 (Executor & wiring) ──► M8 (Deploy) ──► M9 (E2E) ──► M10 (Live)
        │                       │
        ├──► M4 (MetaAPI)       │
        │                       │
        ├──► M5 (Notifier)      │
        │                       │
        └──► M6 (Health)      ──┘
```

After M0, the **six shaded milestones (M1–M6) can be developed in parallel** by separate agents or sessions. M7 is the integration point where they meet.

### Milestone sizing (rough estimates)

| Milestone | Size | Notes                                                                     |
| --------- | ---- | ------------------------------------------------------------------------- |
| M0        | XS   | Toolchain only. < 1 session.                                              |
| M1        | M    | Schema + 4 repos + env loader + tests. ~1 session.                        |
| M2        | M    | Pure module, but many test cases. ~1 session.                             |
| M3        | L    | GramJS has a learning curve + reconnection. ~1–2 sessions.                |
| M4        | M    | MetaAPI SDK is straightforward. ~1 session.                               |
| M5        | S    | Thin wrapper. < 1 session.                                                |
| M6        | S    | Express + a few endpoints. < 1 session.                                   |
| M7        | L    | Integration + the type-safety check that ties it together. ~1–2 sessions. |
| M8        | S    | Config files + a deploy doc. < 1 session.                                 |
| M9        | M    | Mostly verification + soak-test babysitting. ~1 session + 7 days.         |
| M10       | XS   | Config change + redeploy. < 1 hour.                                       |

Total active engineering: roughly **5–8 sessions** of focused work, plus a 7-day soak. After M10, v2 milestones will be drafted.

---

_End of PRD v1.2._
