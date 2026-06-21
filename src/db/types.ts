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