import { describe, expect, it } from 'vitest';
import { parse } from './parse.js';

describe('parser/parse — wrong_format branch', () => {
  it('rejects an empty string', () => {
    expect(parse('')).toEqual({ outcome: 'rejected', reason: 'wrong_format' });
  });

  it('rejects a whitespace-only string', () => {
    expect(parse('   \n\t  ')).toEqual({ outcome: 'rejected', reason: 'wrong_format' });
  });

  it('rejects a footer-only message', () => {
    expect(parse('⚠️ Manage your risks')).toEqual({
      outcome: 'rejected',
      reason: 'wrong_format',
    });
  });

  it('rejects a lowercase pair', () => {
    expect(parse('🔼BUY eurusd\n🔴 SL: 1.0\n🟢 TP1: 0.9')).toEqual({
      outcome: 'rejected',
      reason: 'wrong_format',
    });
  });

  it('rejects a pair with embedded whitespace', () => {
    expect(parse('🔼BUY EU RSD\n🔴 SL: 1.0\n🟢 TP1: 0.9')).toEqual({
      outcome: 'rejected',
      reason: 'wrong_format',
    });
  });
});
