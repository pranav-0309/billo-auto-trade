import { describe, expect, it } from 'vitest';
import { normalize, PAIRS } from './pairs.js';

describe('config/pairs', () => {
  describe('normalize() — known pairs', () => {
    const cases: Array<[string, string]> = [
      ['EURUSD', 'EUR/USD'],
      ['GBPUSD', 'GBP/USD'],
      ['USDJPY', 'USD/JPY'],
      ['GBPJPY', 'GBP/JPY'],
      ['AUDUSD', 'AUD/USD'],
      ['USDCAD', 'USD/CAD'],
      ['USDCHF', 'USD/CHF'],
      ['NZDUSD', 'NZD/USD'],
      ['EURJPY', 'EUR/JPY'],
      ['EURGBP', 'EUR/GBP'],
      ['EURCHF', 'EUR/CHF'],
      ['AUDJPY', 'AUD/JPY'],
      ['EURAUD', 'EUR/AUD'],
      ['EURCAD', 'EUR/CAD'],
      ['GBPCHF', 'GBP/CHF'],
      ['CADJPY', 'CAD/JPY'],
      ['CHFJPY', 'CHF/JPY'],
    ];

    for (const [raw, expected] of cases) {
      it(`normalizes ${raw} to ${expected}`, () => {
        expect(normalize(raw)).toBe(expected);
      });
    }

    it('exposes the full PAIRS map with 17 entries', () => {
      expect(Object.keys(PAIRS)).toHaveLength(17);
    });
  });

  describe('normalize() — unknown pairs', () => {
    it('returns null for an unknown pair', () => {
      expect(normalize('BTCEUR')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(normalize('')).toBeNull();
    });

    it('returns null for a lowercase pair', () => {
      expect(normalize('eurusd')).toBeNull();
    });

    it('returns null for a mixed-case pair', () => {
      expect(normalize('EurUsd')).toBeNull();
    });
  });
});
