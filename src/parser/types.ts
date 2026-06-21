export type Direction = 'BUY' | 'SELL';

export type ParsedSignal = {
  direction: Direction;
  pairRaw: string;
  pairNormalized: string;
  sl: number;
  tp1: number;
  tp2: number | null;
  tp3: number | null;
  executionPrice: number | null;
};

export type RejectionReason =
  | 'wrong_format'
  | 'invalid_pair'
  | 'missing_sl'
  | 'missing_tp1'
  | 'invalid_number'
  | 'sl_equals_tp1';

export type ParseResult =
  | { outcome: 'ok'; parsed: ParsedSignal }
  | { outcome: 'rejected'; reason: RejectionReason };

export type ExtractedHeader = { direction: Direction; pairRaw: string } | null;

export type NumberExtraction =
  | { kind: 'ok'; value: number }
  | { kind: 'missing' }
  | { kind: 'invalid' };