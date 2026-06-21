import { normalize } from '../config/pairs.js';
import { RE_HEADER } from './regex.js';
import type { Direction, ExtractedHeader, ParseResult } from './types.js';

function extractHeader(text: string): ExtractedHeader {
  const match = RE_HEADER.exec(text);
  if (!match) return null;
  const direction: Direction = match[0].includes('🔼') ? 'BUY' : 'SELL';
  const pairRaw = match[1];
  if (pairRaw === undefined) return null;
  return { direction, pairRaw };
}

function normalizePairOrNull(raw: string): string | null {
  return normalize(raw);
}

export function parse(text: string): ParseResult {
  const header = extractHeader(text);
  if (!header) return { outcome: 'rejected', reason: 'wrong_format' };

  const pairNormalized = normalizePairOrNull(header.pairRaw);
  if (!pairNormalized) return { outcome: 'rejected', reason: 'invalid_pair' };

  // Subsequent branches added in Tasks 5–8.
  throw new Error('parse(): not yet implemented beyond pair (Task 4)');
}
