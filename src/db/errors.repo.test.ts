import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { configureNumericTypes } from './types.js';
import { insertSignal } from './signals.repo.js';
import { recordError } from './errors.repo.js';

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
  await pool.query('TRUNCATE errors CASCADE');
});

describe('errors.repo', () => {
  it('recordError creates a row with the message and stack', async () => {
    const row = await recordError(pool, {
      message: 'something exploded',
      stack: 'Error: something exploded\n  at ...',
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.message).toBe('something exploded');
    expect(row.stack).toBe('Error: something exploded\n  at ...');
    expect(row.signal_id).toBeNull();
    expect(row.occurred_at).toBeInstanceOf(Date);
  });

  it('recordError links to a signal when signalId is provided', async () => {
    const signal = await insertSignal(pool, {
      telegramMessageId: 1,
      chatId: 'c',
      senderUserId: 1,
      rawText: 't',
    });
    const row = await recordError(pool, {
      message: 'm',
      stack: 's',
      signalId: signal.id,
    });
    expect(row.signal_id).toBe(signal.id);
  });
});
