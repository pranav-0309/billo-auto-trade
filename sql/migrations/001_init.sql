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
