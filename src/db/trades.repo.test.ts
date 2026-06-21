import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { configureNumericTypes } from './types.js';
import { insertSignal } from './signals.repo.js';
import { insertParseResult } from './parseResults.repo.js';
import {
  insertTradeAttempt,
  updateTradeAttemptStatus,
  getBySignalId,
} from './trades.repo.js';

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

describe('trades.repo', () => {
  it('insertTradeAttempt creates a row with status=submitted', async () => {
    const signal = await insertSignal(pool, {
      telegramMessageId: 1,
      chatId: 'c',
      senderUserId: 1,
      rawText: 't',
    });
    const pr = await insertParseResult(pool, {
      signalId: signal.id,
      outcome: 'ok',
      direction: 'BUY',
      pairRaw: 'EURUSD',
      pairNormalized: 'EUR/USD',
    });
    const attempt = await insertTradeAttempt(pool, {
      signalId: signal.id,
      parseResultId: pr.id,
      status: 'submitted',
      lotSize: 0.01,
      requestedSymbol: 'EUR/USD',
    });
    expect(attempt.status).toBe('submitted');
    expect(attempt.lot_size).toBe(0.01);
    expect(typeof attempt.lot_size).toBe('number');
    expect(attempt.requested_symbol).toBe('EUR/USD');
    expect(attempt.filled_symbol).toBeNull();
    expect(attempt.completed_at).toBeNull();
  });

  it('updateTradeAttemptStatus patches the row and returns the updated version', async () => {
    const signal = await insertSignal(pool, {
      telegramMessageId: 2,
      chatId: 'c',
      senderUserId: 1,
      rawText: 't',
    });
    const pr = await insertParseResult(pool, {
      signalId: signal.id,
      outcome: 'ok',
    });
    const attempt = await insertTradeAttempt(pool, {
      signalId: signal.id,
      parseResultId: pr.id,
      status: 'submitted',
      lotSize: 0.01,
      requestedSymbol: 'EUR/USD',
    });
    const updated = await updateTradeAttemptStatus(pool, attempt.id, {
      status: 'filled',
      broker_ticket: 987654321,
      filled_symbol: 'EUR/USD',
      filled_price: 1.0735,
      completed_at: new Date(),
    });
    expect(updated.status).toBe('filled');
    expect(updated.broker_ticket).toBe(987654321);
    expect(typeof updated.broker_ticket).toBe('number');
    expect(updated.filled_symbol).toBe('EUR/USD');
    expect(updated.filled_price).toBe(1.0735);
    expect(updated.completed_at).toBeInstanceOf(Date);
  });

  it('getBySignalId returns all attempts for a signal', async () => {
    const signal = await insertSignal(pool, {
      telegramMessageId: 3,
      chatId: 'c',
      senderUserId: 1,
      rawText: 't',
    });
    const pr = await insertParseResult(pool, {
      signalId: signal.id,
      outcome: 'ok',
    });
    await insertTradeAttempt(pool, {
      signalId: signal.id,
      parseResultId: pr.id,
      status: 'submitted',
      lotSize: 0.01,
      requestedSymbol: 'EUR/USD',
    });
    await insertTradeAttempt(pool, {
      signalId: signal.id,
      parseResultId: pr.id,
      status: 'error',
      lotSize: 0.01,
      requestedSymbol: 'EUR/USD',
    });
    const rows = await getBySignalId(pool, signal.id);
    expect(rows).toHaveLength(2);
    const statuses = rows.map((r) => r.status).sort();
    expect(statuses).toEqual(['error', 'submitted']);
  });
});
