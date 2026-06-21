import { normalize } from '../config/pairs.js';
import { RE_EXEC, RE_HEADER, RE_SL, RE_TP1, RE_TP2, RE_TP3 } from './regex.js';
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
  const pairRaw = match[1]!;
  return { direction, pairRaw };
}

function extractNumber(text: string, re: RegExp): NumberExtraction {
  const match = re.exec(text);
  if (!match) return { kind: 'missing' };
  const captured = match[1];
  const n = Number(captured);
  if (!Number.isFinite(n) || n <= 0) return { kind: 'invalid' };
  return { kind: 'ok', value: n };
}

function extractOptionalNumber(text: string, re: RegExp): number | null {
  const result = extractNumber(text, re);
  return result.kind === 'ok' ? result.value : null;
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

  const parsed: ParsedSignal = {
    direction: header.direction,
    pairRaw: header.pairRaw,
    pairNormalized,
    sl,
    tp1,
    tp2: extractOptionalNumber(text, RE_TP2),
    tp3: extractOptionalNumber(text, RE_TP3),
    executionPrice: extractOptionalNumber(text, RE_EXEC),
  };
  return { outcome: 'ok', parsed };
}