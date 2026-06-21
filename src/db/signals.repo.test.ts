import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { configureNumericTypes } from './types.js';
import {
  insertSignal,
  getSignalById,
  findByTelegramMessageId,
} from './signals.repo.js';

const TEST_URL = process.env.DATABASE_URL_TEST;
if (!TEST_URL) {
  throw new Error('DATABASE_URL_TEST must be set to run repo tests');
}

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

describe('signals.repo', () => {
  it('insertSignal returns a row with snake_case columns mapped correctly', async () => {
    const row = await insertSignal(pool, {
      telegramMessageId: 100,
      chatId: '-100123',
      senderUserId: 42,
      rawText: 'BUY EURUSD',
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.telegram_message_id).toBe(100);
    expect(typeof row.telegram_message_id).toBe('number');
    expect(row.chat_id).toBe('-100123');
    expect(row.sender_user_id).toBe(42);
    expect(row.raw_text).toBe('BUY EURUSD');
    expect(row.received_at).toBeInstanceOf(Date);
  });

  it('getSignalById returns the row when it exists, null when not', async () => {
    const inserted = await insertSignal(pool, {
      telegramMessageId: 1,
      chatId: 'c',
      senderUserId: 1,
      rawText: 't',
    });
    const found = await getSignalById(pool, inserted.id);
    expect(found?.id).toBe(inserted.id);
    const missing = await getSignalById(pool, '00000000-0000-0000-0000-000000000000');
    expect(missing).toBeNull();
  });

  it('findByTelegramMessageId returns null when no row matches', async () => {
    const found = await findByTelegramMessageId(pool, 'c', 999);
    expect(found).toBeNull();
  });

  it('insertSignal is dedup-safe: a second insert with the same (chat_id, telegram_message_id) returns the existing row', async () => {
    const first = await insertSignal(pool, {
      telegramMessageId: 5,
      chatId: 'c',
      senderUserId: 1,
      rawText: 'first',
    });
    const second = await insertSignal(pool, {
      telegramMessageId: 5,
      chatId: 'c',
      senderUserId: 1,
      rawText: 'second',
    });
    expect(second.id).toBe(first.id);
    expect(second.raw_text).toBe('first');
  });
});
