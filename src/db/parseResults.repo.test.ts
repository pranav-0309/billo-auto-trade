import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { configureNumericTypes } from './types.js';
import { insertSignal } from './signals.repo.js';
import { insertParseResult, getBySignalId } from './parseResults.repo.js';

const TEST_URL = process.env.DATABASE_URL_TEST;
if (!TEST_URL) throw new Error('DATABASE_URL_TEST must be set');

let pool: pg.Pool;

beforeAll(() => {
  configureNumericTypes();
  pool = new pg.Pool({ connectionString: TEST_URL });
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    'TRUNCATE errors, trade_attempts, parse_results, signals RESTART IDENTITY CASCADE',
  );
});

describe('parseResults.repo', () => {
  it('insertParseResult round-trips a successful parse', async () => {
    const signal = await insertSignal(pool, {
      telegramMessageId: 1,
      chatId: 'c',
      senderUserId: 1,
      rawText: 'BUY EURUSD',
    });
    const row = await insertParseResult(pool, {
      signalId: signal.id,
      outcome: 'ok',
      direction: 'BUY',
      pairRaw: 'EURUSD',
      pairNormalized: 'EUR/USD',
      sl: 1.0781,
      tp1: 1.0721,
      tp2: 1.0681,
      tp3: 1.0631,
      executionPrice: 1.0735,
    });
    expect(row.outcome).toBe('ok');
    expect(row.direction).toBe('BUY');
    expect(row.sl).toBe(1.0781);
    expect(typeof row.sl).toBe('number');
    expect(row.tp1).toBe(1.0721);
    expect(row.tp2).toBe(1.0681);
    expect(row.tp3).toBe(1.0631);
  });

  it('insertParseResult round-trips a rejection', async () => {
    const signal = await insertSignal(pool, {
      telegramMessageId: 2,
      chatId: 'c',
      senderUserId: 1,
      rawText: 'garbage',
    });
    const row = await insertParseResult(pool, {
      signalId: signal.id,
      outcome: 'rejected',
      rejectionReason: 'missing_sl',
    });
    expect(row.outcome).toBe('rejected');
    expect(row.rejection_reason).toBe('missing_sl');
    expect(row.direction).toBeNull();
    expect(row.sl).toBeNull();
  });

  it('getBySignalId returns all parse results for a signal in insertion order', async () => {
    const signal = await insertSignal(pool, {
      telegramMessageId: 3,
      chatId: 'c',
      senderUserId: 1,
      rawText: 't',
    });
    await insertParseResult(pool, { signalId: signal.id, outcome: 'rejected', rejectionReason: 'x' });
    await insertParseResult(pool, { signalId: signal.id, outcome: 'ok', direction: 'BUY', pairRaw: 'EURUSD', pairNormalized: 'EUR/USD' });
    const rows = await getBySignalId(pool, signal.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].outcome).toBe('rejected');
    expect(rows[1].outcome).toBe('ok');
  });
});
