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

describe('parser/parse — invalid_pair branch', () => {
  it('rejects a known-shaped pair that is not in the PAIRS map', () => {
    expect(
      parse('🔼BUY BTCEUR\n🔴 SL: 50000\n🟢 TP1: 51000'),
    ).toEqual({ outcome: 'rejected', reason: 'invalid_pair' });
  });

  it('rejects a 6-letter ticker that is not a real pair', () => {
    expect(
      parse('🔽SELL XAUUSD\n🔴 SL: 2000\n🟢 TP1: 1900'),
    ).toEqual({ outcome: 'rejected', reason: 'invalid_pair' });
  });
});

describe('parser/parse — missing_sl / missing_tp1 branches', () => {
  it('rejects when the SL line is missing', () => {
    expect(
      parse('🔼BUY EURUSD\n\n🟢 TP1: 1.0721'),
    ).toEqual({ outcome: 'rejected', reason: 'missing_sl' });
  });

  it('rejects when the TP1 line is missing', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: 1.0781\n'),
    ).toEqual({ outcome: 'rejected', reason: 'missing_tp1' });
  });

  it('reports missing_sl before missing_tp1 when both are absent', () => {
    expect(parse('🔼BUY EURUSD\n')).toEqual({
      outcome: 'rejected',
      reason: 'missing_sl',
    });
  });
});

describe('parser/parse — invalid_number branch', () => {
  it('rejects a negative SL', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: -1.0781\n🟢 TP1: 1.0721'),
    ).toEqual({ outcome: 'rejected', reason: 'invalid_number' });
  });

  it('rejects a zero SL', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: 0\n🟢 TP1: 1.0721'),
    ).toEqual({ outcome: 'rejected', reason: 'invalid_number' });
  });

  it('rejects a non-numeric SL', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: abc\n🟢 TP1: 1.0721'),
    ).toEqual({ outcome: 'rejected', reason: 'invalid_number' });
  });

  it('rejects a negative TP1', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: 1.0781\n🟢 TP1: -1.0721'),
    ).toEqual({ outcome: 'rejected', reason: 'invalid_number' });
  });

  it('rejects a zero TP1', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: 1.0781\n🟢 TP1: 0'),
    ).toEqual({ outcome: 'rejected', reason: 'invalid_number' });
  });

  it('reports invalid_number for SL before TP1 when both are bad', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: -1\n🟢 TP1: -1'),
    ).toEqual({ outcome: 'rejected', reason: 'invalid_number' });
  });
});

describe('parser/parse — sl_equals_tp1 branch', () => {
  it('rejects when SL equals TP1', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: 1.0781\n🟢 TP1: 1.0781'),
    ).toEqual({ outcome: 'rejected', reason: 'sl_equals_tp1' });
  });
});
