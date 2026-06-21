import { normalize } from '../config/pairs.js';
import { RE_HEADER, RE_SL, RE_TP1 } from './regex.js';
import type {
  Direction,
  ExtractedHeader,
  NumberExtraction,
  ParseResult,
  ParsedSignal,
} from './types.js';

function extractHeader(text: string): ExtractedHeader {
  const match = RE_HEADER.exec(text);
  if (!match) return null;
  const direction: Direction = match[0].includes('🔼') ? 'BUY' : 'SELL';
  const pairRaw = match[1];
  if (pairRaw === undefined) return null;
  return { direction, pairRaw };
}

function extractNumber(text: string, re: RegExp): NumberExtraction {
  const match = re.exec(text);
  if (!match) return { kind: 'missing' };
  const captured = match[1];
  if (captured === undefined) return { kind: 'missing' };
  const n = Number(captured);
  if (!Number.isFinite(n) || n <= 0) return { kind: 'invalid' };
  return { kind: 'ok', value: n };
}

function normalizePairOrNull(raw: string): string | null {
  return normalize(raw);
}

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

  // TP2 / TP3 / executionPrice extracted in Task 8. For now, null them.
  const parsed: ParsedSignal = {
    direction: header.direction,
    pairRaw: header.pairRaw,
    pairNormalized,
    sl,
    tp1,
    tp2: null,
    tp3: null,
    executionPrice: null,
  };
  return { outcome: 'ok', parsed };
}