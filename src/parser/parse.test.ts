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

describe('parser/parse — success path (TP2/TP3/executionPrice)', () => {
  const fullBuy = `🔼BUY EURUSD

Execution Price: 1.0735

🔴 SL: 1.0781

🟢 TP1: 1.0721

🟢 TP2: 1.0681

🟢 TP3: 1.0631

⚠️ Manage your risks`;

  const fullSell = `🔽SELL EURUSD

Execution Price: 1.0735

🔴 SL: 1.0781

🟢 TP1: 1.0721

🟢 TP2: 1.0681

🟢 TP3: 1.0631

⚠️ Manage your risks`;

  it('parses a full BUY EURUSD signal with all fields populated', () => {
    expect(parse(fullBuy)).toEqual({
      outcome: 'ok',
      parsed: {
        direction: 'BUY',
        pairRaw: 'EURUSD',
        pairNormalized: 'EUR/USD',
        sl: 1.0781,
        tp1: 1.0721,
        tp2: 1.0681,
        tp3: 1.0631,
        executionPrice: 1.0735,
      },
    });
  });

  it('parses a full SELL EURUSD signal', () => {
    expect(parse(fullSell)).toEqual({
      outcome: 'ok',
      parsed: {
        direction: 'SELL',
        pairRaw: 'EURUSD',
        pairNormalized: 'EUR/USD',
        sl: 1.0781,
        tp1: 1.0721,
        tp2: 1.0681,
        tp3: 1.0631,
        executionPrice: 1.0735,
      },
    });
  });

  it('returns null TP2/TP3 when only TP1 is present', () => {
    const text = `🔼BUY EURUSD

🔴 SL: 1.0781

🟢 TP1: 1.0721`;
    const result = parse(text);
    expect(result.outcome).toBe('ok');
    if (result.outcome === 'ok') {
      expect(result.parsed.tp2).toBeNull();
      expect(result.parsed.tp3).toBeNull();
    }
  });

  it('returns null executionPrice when the line is missing', () => {
    const text = `🔼BUY EURUSD

🔴 SL: 1.0781

🟢 TP1: 1.0721

🟢 TP2: 1.0681`;
    const result = parse(text);
    expect(result.outcome).toBe('ok');
    if (result.outcome === 'ok') {
      expect(result.parsed.executionPrice).toBeNull();
      expect(result.parsed.tp2).toBe(1.0681);
    }
  });

  it('returns null for an optional field when its value is non-numeric', () => {
    const text = `🔼BUY EURUSD

Execution Price: not-a-price

🔴 SL: 1.0781

🟢 TP1: 1.0721`;
    const result = parse(text);
    expect(result.outcome).toBe('ok');
    if (result.outcome === 'ok') {
      expect(result.parsed.executionPrice).toBeNull();
    }
  });
});

describe('parser/parse — whitespace tolerance and edge cases', () => {
  it('accepts leading and trailing whitespace on the header line', () => {
    const text = '   🔼BUY EURUSD   \n🔴 SL: 1.0781\n🟢 TP1: 1.0721';
    const result = parse(text);
    expect(result.outcome).toBe('ok');
    if (result.outcome === 'ok') {
      expect(result.parsed.direction).toBe('BUY');
      expect(result.parsed.pairNormalized).toBe('EUR/USD');
    }
  });

  it('accepts blank lines between fields', () => {
    const text = `🔼BUY EURUSD

🔴 SL: 1.0781

🟢 TP1: 1.0721`;
    const result = parse(text);
    expect(result.outcome).toBe('ok');
  });

  it('accepts extra trailing text after the footer', () => {
    const text = `🔼BUY EURUSD

🔴 SL: 1.0781

🟢 TP1: 1.0721

⚠️ Manage your risks

— forwarded by some user at 2026-06-21`;
    const result = parse(text);
    expect(result.outcome).toBe('ok');
    if (result.outcome === 'ok') {
      expect(result.parsed.sl).toBe(1.0781);
      expect(result.parsed.tp1).toBe(1.0721);
    }
  });

  it('rejects when the SL emoji is wrong (blue circle instead of red)', () => {
    expect(
      parse('🔼BUY EURUSD\n🔵 SL: 1.0781\n🟢 TP1: 1.0721'),
    ).toEqual({ outcome: 'rejected', reason: 'missing_sl' });
  });

  it('rejects when the TP1 emoji is wrong (yellow instead of green)', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: 1.0781\n🟡 TP1: 1.0721'),
    ).toEqual({ outcome: 'rejected', reason: 'missing_tp1' });
  });

  it('accepts a BUY with TP below SL (no geometric validation)', () => {
    expect(
      parse('🔼BUY EURUSD\n🔴 SL: 1.0781\n🟢 TP1: 1.0721'),
    ).toMatchObject({ outcome: 'ok', parsed: { direction: 'BUY', sl: 1.0781, tp1: 1.0721 } });
  });
});
