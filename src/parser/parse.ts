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

export function parse(text: string): ParseResult {
  const header = extractHeader(text);
  if (!header) return { outcome: 'rejected', reason: 'wrong_format' };
  // Subsequent branches added in Tasks 4–8. Returning a placeholder here
  // would be a placeholder — instead we throw to make any un-added case loud.
  throw new Error('parse(): not yet implemented beyond header (Task 3)');
}
